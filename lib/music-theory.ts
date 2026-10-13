// Теория для фоновой музыки: чистые функции без WebAudio (проверяются в tsx).
// Тональность A minor pentatonic, прогрессия Am - F - C - G, по такту на аккорд.

export type Mood = "calm" | "tense" | "win";
export type Rng = () => number;

export interface MoodParams {
  bpm: number; // темп
  arpDensity: number; // 0..1: насколько часто «щипки» арпеджио
  arpOctave: number; // сдвиг арпеджио в октавах (0..1)
  padLevel: number; // 0..1: уровень pad
  brightness: number; // Гц: срез lowpass фильтра pad
}

export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = 8; // восьмые доли
export const CHORD_NAMES = ["Am", "F", "C", "G"] as const;

// MIDI-ноты аккордов (голосоведение близкое, чтобы pad звучал плавно)
const CHORDS: readonly (readonly number[])[] = [
  [57, 60, 64], // Am: A3 C4 E4
  [53, 57, 60], // F:  F3 A3 C4
  [55, 60, 64], // C:  G3 C4 E4
  [55, 59, 62], // G:  G3 B3 D4
];

// Пентатоника A minor: A C D E G (классы высоты 9, 0, 2, 4, 7)
const PENTA_PITCH_CLASSES = new Set([9, 0, 2, 4, 7]);

/** Ноты арпеджио: пентатоника от C4 до C6 */
export const ARP_POOL: readonly number[] = Array.from({ length: 25 }, (_, k) => 60 + k).filter((m) =>
  PENTA_PITCH_CLASSES.has(m % 12)
);

/** Короткое мажорное арпеджио для настроения win: C5 E5 G5 C6 */
export const WIN_ARP: readonly number[] = [72, 76, 79, 84];
export const WIN_STEP_SEC = 0.42;
export const WIN_TOTAL_SEC = 2;

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Ноты аккорда по номеру такта (циклически) */
export function chordNotes(i: number): number[] {
  const n = CHORDS.length;
  return [...CHORDS[((Math.trunc(i) % n) + n) % n]];
}

/** Детерминируемый генератор (mulberry32): одинаковый seed даёт одинаковую последовательность */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Шаги случайной ходьбы по индексам пентатоники и их веса: соседние ноты чаще, чем через одну
const STEPS = [-2, -1, 1, 2];
const WEIGHTS = [1, 3, 3, 1];

/** Следующая нота арпеджио: случайная ходьба по пентатонике, без повторов, прыжок <= 5 полутонов */
export function nextArpNote(prevNote: number, rng: Rng): number {
  const last = ARP_POOL.length - 1;
  let idx = 0;
  if (Number.isFinite(prevNote)) {
    let best = Infinity;
    ARP_POOL.forEach((n, k) => {
      const d = Math.abs(n - prevNote);
      if (d < best) {
        best = d;
        idx = k;
      }
    });
  } else idx = Math.floor(last / 2);

  const opts = STEPS.map((d, k) => ({ to: idx + d, w: WEIGHTS[k] })).filter((o) => o.to >= 0 && o.to <= last);
  const total = opts.reduce((s, o) => s + o.w, 0);
  let r = rng() * total;
  for (const o of opts) {
    r -= o.w;
    if (r < 0) return ARP_POOL[o.to];
  }
  return ARP_POOL[opts[opts.length - 1].to];
}

const MOODS: Record<Mood, MoodParams> = {
  calm: { bpm: 84, arpDensity: 0.35, arpOctave: 0, padLevel: 1, brightness: 900 },
  tense: { bpm: 108, arpDensity: 0.7, arpOctave: 0, padLevel: 0.85, brightness: 1500 },
  // на win обычное арпеджио молчит, движок играет WIN_ARP один раз
  win: { bpm: 84, arpDensity: 0, arpOctave: 1, padLevel: 0.7, brightness: 1500 },
};

export function moodParams(mood: Mood): MoodParams {
  return { ...(MOODS[mood] ?? MOODS.calm) };
}
