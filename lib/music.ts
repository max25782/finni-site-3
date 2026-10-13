// Фоновая музыка: спокойный бесконечный луп, генерируется WebAudio (без файлов).
// Синглтон. SSR-безопасен: к window/AudioContext обращаемся только внутри вызовов API.
// AudioContext создаётся ТОЛЬКО по жесту пользователя (политика автоплея), см. ensureCtx().
import {
  STEPS_PER_BAR,
  WIN_ARP,
  WIN_STEP_SEC,
  WIN_TOTAL_SEC,
  chordNotes,
  createRng,
  midiToHz,
  moodParams,
  nextArpNote,
  type Mood,
  type Rng,
} from "./music-theory";

export type { Mood };

const TICK_MS = 25; // период планировщика
const LOOKAHEAD = 0.12; // планируем ноты на 120 мс вперёд
const MAX_VOICES = 6; // одновременных голосов (нот)
const FADE_TC = 0.5; // постоянная времени: ~95% за 1.5 с
const FADE_OUT_MS = 1800; // после этого узлы освобождаются
const DUCK_LEVEL = 0.35;
const HOLD_SAFETY_MS = 60000; // страховка: микрофон не должен глушить музыку вечно

interface Voice {
  gain: GainNode;
  oscs: OscillatorNode[];
  end: number; // когда голос закончится (время контекста)
}

interface Graph {
  master: GainNode;
  padBus: GainNode;
  padFilter: BiquadFilterNode;
  arpBus: GainNode;
}

let ctx: AudioContext | null = null;
let graph: Graph | null = null;
const voices = new Set<Voice>();

let vol = 0.5;
let duckOn = false;
let holdOn = false;
let wanted = false; // музыка включена пользователем
let paused = false; // вкладка скрыта
let mood: Mood = "calm";
let winPending = false;
let winEnd = 0;
let slot = 0; // номер восьмой доли с начала лупа
let nextTime = 0; // время следующей доли (время контекста)
let prevArp = NaN;
let rng: Rng | null = null;

let timer: ReturnType<typeof setInterval> | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let quietTimer: ReturnType<typeof setTimeout> | null = null;
let pauseTimer: ReturnType<typeof setTimeout> | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

// ---------- вспомогательное ----------

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5);

/** Громкость 0..1 в усиление: 0.5 даёт примерно -20 дБ */
const gainFor = (v: number) => 0.4 * v * v;

const stepSec = () => 60 / moodParams(mood).bpm / 2;

function ctor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function target(): number {
  if (!wanted || paused) return 0;
  return gainFor(vol) * (duckOn ? DUCK_LEVEL : 1) * (holdOn ? 0 : 1);
}

/** Плавно ведём общую громкость к целевой (setTargetAtTime: без щелчков) */
function apply(tc: number) {
  if (!ctx || !graph) return;
  graph.master.gain.setTargetAtTime(target(), ctx.currentTime, tc);
}

/** Тембр под настроение: срез фильтра pad и его уровень */
function applyTone(at?: number) {
  if (!ctx || !graph) return;
  const p = moodParams(mood);
  const t = at ?? ctx.currentTime;
  graph.padFilter.frequency.setTargetAtTime(p.brightness, t, 0.5);
  graph.padBus.gain.setTargetAtTime(p.padLevel, t, 0.5);
}

/** Атрибуты на <html>: удобно для стилей и для проверки в тестах */
function flags() {
  if (typeof document === "undefined") return;
  const d = document.documentElement.dataset;
  d.music = wanted && !paused ? "on" : "off";
  d.musicMood = mood;
}

// Импульс для «реверберации»: шум с затуханием, ~1.5 с
function makeImpulse(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 1.5);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

/** Строим постоянную часть графа один раз: bus -> эхо/реверб -> master -> компрессор -> выход */
function buildGraph(c: AudioContext): Graph {
  const master = c.createGain();
  master.gain.value = 0; // стартуем с тишины, поднимаем плавно
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 20;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  master.connect(comp).connect(c.destination);

  const mix = c.createGain();
  mix.connect(master); // сухой сигнал

  const padBus = c.createGain();
  const padFilter = c.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = moodParams("calm").brightness;
  padFilter.Q.value = 0.5;
  padBus.connect(padFilter).connect(mix);

  const arpBus = c.createGain();
  const arpFilter = c.createBiquadFilter();
  arpFilter.type = "lowpass";
  arpFilter.frequency.value = 4000;
  arpBus.connect(arpFilter).connect(mix);

  // эхо: delay с обратной связью ~0.3 и lowpass в петле
  const echoSend = c.createGain();
  echoSend.gain.value = 0.35;
  const delay = c.createDelay(1);
  delay.delayTime.value = 0.36;
  const echoLp = c.createBiquadFilter();
  echoLp.type = "lowpass";
  echoLp.frequency.value = 1800;
  const feedback = c.createGain();
  feedback.gain.value = 0.3;
  mix.connect(echoSend).connect(delay).connect(echoLp);
  echoLp.connect(feedback).connect(delay);
  echoLp.connect(master);

  // реверберация: свёртка с шумовым импульсом
  const revSend = c.createGain();
  revSend.gain.value = 0.4;
  const conv = c.createConvolver();
  conv.buffer = makeImpulse(c);
  mix.connect(revSend).connect(conv).connect(master);

  return { master, padBus, padFilter, arpBus };
}

/** Контекст создаётся только по жесту; без жеста возвращаем null */
function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  const C = ctor();
  if (!C || typeof navigator === "undefined") return null;
  const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return null; // жеста ещё не было
  try {
    ctx = new C({ latencyHint: "playback" }); // фон не требует малой задержки: меньше нагрузка
    graph = buildGraph(ctx);
  } catch {
    ctx = null;
    graph = null;
  }
  return ctx;
}

// ---------- голоса ----------

function release(v: Voice) {
  voices.delete(v);
  try {
    v.oscs.forEach((o) => o.disconnect());
    v.gain.disconnect();
  } catch {
    /* уже отключено */
  }
}

/** Освобождаем самый «старый» голос (по времени окончания): для важных нот */
function steal() {
  if (!ctx) return;
  let victim: Voice | null = null;
  voices.forEach((v) => {
    if (!victim || v.end < victim.end) victim = v;
  });
  const v = victim as Voice | null;
  if (!v) return;
  const now = ctx.currentTime;
  v.gain.gain.setTargetAtTime(0, now, 0.01);
  v.oscs.forEach((o) => {
    try {
      o.stop(now + 0.08);
    } catch {
      /* уже остановлен */
    }
  });
  v.end = now + 0.08;
}

interface OscSpec {
  type: OscillatorType;
  detune: number;
}

/** Создаёт голос: осцилляторы -> gain -> dest. Огибающую задаёт env, по onended всё отключается. */
function spawn(
  freq: number,
  specs: OscSpec[],
  dest: AudioNode,
  t0: number,
  end: number,
  env: (g: AudioParam) => void,
  priority = false
): Voice | null {
  if (!ctx) return null;
  if (voices.size >= MAX_VOICES) {
    if (!priority) return null;
    steal();
  }
  const gain = ctx.createGain();
  env(gain.gain);
  gain.connect(dest);
  const voice: Voice = { gain, oscs: [], end };
  let alive = specs.length;
  specs.forEach((sp) => {
    const o = ctx!.createOscillator();
    o.type = sp.type;
    o.frequency.value = freq;
    o.detune.value = sp.detune;
    o.connect(gain);
    o.onended = () => {
      alive -= 1;
      if (alive <= 0) release(voice);
    };
    o.start(t0);
    o.stop(end + 0.03);
    voice.oscs.push(o);
  });
  voices.add(voice);
  return voice;
}

/** Нота pad: два осциллятора с лёгкой расстройкой, медленная атака и релиз */
function padNote(midi: number, t0: number, barLen: number) {
  if (!graph) return;
  const att = Math.min(0.9, barLen * 0.4);
  const relStart = t0 + barLen - 0.5;
  const end = t0 + barLen + 0.5;
  spawn(
    midiToHz(midi),
    [
      { type: "triangle", detune: -5 },
      { type: "sine", detune: 5 },
    ],
    graph.padBus,
    t0,
    end,
    (g) => {
      g.setValueAtTime(0, t0);
      g.linearRampToValueAtTime(0.16, t0 + att);
      g.setValueAtTime(0.16, relStart);
      g.linearRampToValueAtTime(0, end);
    }
  );
}

/** «Щипок» арпеджио: короткая огибающая, экспоненциальное затухание */
function pluck(freq: number, t0: number, peak: number, dur: number, type: OscillatorType, priority = false) {
  if (!graph) return;
  spawn(
    freq,
    [{ type, detune: 0 }],
    graph.arpBus,
    t0,
    t0 + dur,
    (g) => {
      g.setValueAtTime(0, t0);
      g.linearRampToValueAtTime(peak, t0 + 0.015);
      g.exponentialRampToValueAtTime(0.0001, t0 + dur);
    },
    priority
  );
}

// ---------- планировщик ----------

function scheduleSlot(n: number, t: number) {
  if (!rng) return;
  const p = moodParams(mood);
  const bs = n % STEPS_PER_BAR;
  if (bs === 0) {
    const barLen = STEPS_PER_BAR * (60 / p.bpm / 2);
    chordNotes(Math.floor(n / STEPS_PER_BAR)).forEach((m) => padNote(m, t, barLen));
    applyTone(t);
  }
  // сильные доли играют чаще слабых
  if (p.arpDensity > 0 && rng() < p.arpDensity * (bs % 2 === 0 ? 1 : 0.5)) {
    const note = nextArpNote(prevArp, rng);
    prevArp = note;
    const dur = mood === "tense" ? 0.7 : 1.1;
    pluck(midiToHz(note + 12 * p.arpOctave), t + rng() * 0.015, 0.2, dur, rng() < 0.5 ? "sine" : "triangle");
  }
}

function tick() {
  if (!ctx || !wanted || paused) return;
  const now = ctx.currentTime;
  if (nextTime < now - 0.3) nextTime = now + 0.05; // вкладку троттлило: не догоняем пачкой
  if (winPending) {
    winPending = false;
    const t0 = now + 0.03;
    WIN_ARP.forEach((m, i) => pluck(midiToHz(m), t0 + i * WIN_STEP_SEC, 0.26, 1.1, "triangle", true));
    winEnd = t0 + WIN_TOTAL_SEC;
  }
  while (nextTime < now + LOOKAHEAD) {
    scheduleSlot(slot, nextTime);
    nextTime += stepSec();
    slot += 1;
  }
  if (mood === "win" && now > winEnd) {
    mood = "calm"; // короткий «выигрыш» закончился
    applyTone();
    flags();
  }
}

function runScheduler() {
  if (timer || !ctx) return;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.06;
  timer = setInterval(tick, TICK_MS);
  tick();
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Окончательная остановка после затухания: гасим голоса и усыпляем контекст */
function teardown() {
  stopTimer = null;
  if (wanted || !ctx) return;
  const now = ctx.currentTime;
  voices.forEach((v) =>
    v.oscs.forEach((o) => {
      try {
        o.stop(now);
      } catch {
        /* уже остановлен */
      }
    })
  );
  slot = 0;
  prevArp = NaN;
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    quietTimer = null;
    if (!wanted && ctx && ctx.state === "running") void ctx.suspend().catch(() => undefined);
  }, 200); // даём onended отработать
}

// ---------- пауза на скрытой вкладке ----------

function onVisibility() {
  if (typeof document === "undefined") return;
  if (document.hidden) {
    if (paused) return;
    paused = true;
    stopScheduler();
    apply(0.05);
    flags();
    if (pauseTimer) clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => {
      pauseTimer = null;
      if (paused && ctx && ctx.state === "running") void ctx.suspend().catch(() => undefined);
    }, 250);
  } else if (paused) {
    paused = false;
    if (pauseTimer) clearTimeout(pauseTimer);
    pauseTimer = null;
    if (wanted && ctx) {
      void ctx.resume().catch(() => undefined);
      runScheduler();
      apply(0.3);
    }
    flags();
  }
}

function watchVisibility() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", onVisibility);
}

// ---------- публичный API ----------

export const music = {
  /** Запуск: вызывать из обработчика жеста (клик/тап) */
  start() {
    if (typeof window === "undefined") return;
    if (wanted) {
      if (ctx && ctx.state === "suspended" && !paused) void ctx.resume().catch(() => undefined);
      return;
    }
    const c = ensureCtx();
    if (!c) return;
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = null;
    wanted = true;
    rng = rng ?? createRng((Date.now() ^ 0x9e3779b9) >>> 0);
    void c.resume().catch(() => undefined);
    watchVisibility();
    paused = document.hidden;
    applyTone();
    if (!paused) runScheduler();
    apply(FADE_TC);
    flags();
  },

  /** Остановка с плавным затуханием; интервал планировщика гасим сразу */
  stop() {
    if (!wanted) return;
    wanted = false;
    winPending = false;
    if (mood === "win") mood = "calm";
    stopScheduler();
    apply(FADE_TC);
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(teardown, FADE_OUT_MS);
    flags();
  },

  /** Громкость 0..1 (плавно) */
  setVolume(v: number) {
    vol = clamp01(v);
    apply(0.3);
  },

  /** Настроение: calm | tense | win (win играет ~2 с и возвращается в calm) */
  setMood(m: Mood) {
    if (m === "win") {
      if (!wanted || paused) return; // без звука «выигрыш» не копим
      mood = "win";
      winPending = true;
      applyTone();
      flags();
      tick();
      return;
    }
    mood = m;
    winPending = false;
    applyTone();
    flags();
  },

  /** Приглушить до ~35% на время озвучки/эффектов */
  duck(on: boolean) {
    duckOn = on;
    apply(0.25);
  },

  /** Полная тишина на время работы микрофона (музыка не должна попасть в распознавание) */
  hold(on: boolean) {
    holdOn = on;
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    if (on) holdTimer = setTimeout(() => music.hold(false), HOLD_SAFETY_MS);
    apply(on ? 0.04 : 0.3);
  },

  isPlaying: () => wanted,

  isSupported: () => ctor() !== null,

  /** Диагностика (для проверок на утечки) */
  stats: () => ({ voices: voices.size, scheduler: timer !== null, state: ctx?.state ?? "none" }),
};
