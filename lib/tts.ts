// Озвучка ответов Финни. Провайдеры: "browser" (speechSynthesis) и "elevenlabs" (наш роут /api/tts).
// Облачный провайдер при любой неудаче (нет ключа, лимит, сеть) молча откатывается на голос браузера.
// Ничего не трогает window при импорте: все обращения только внутри функций, вызываемых из обработчиков и эффектов.
import { splitSentences } from "./speech-text";

export type TtsLang = "ru" | "he";
export type TtsProvider = "browser" | "elevenlabs";

export interface SpeakHandlers {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (code: string) => void;
}
export interface SpeakOpts {
  provider?: TtsProvider;
  /** Подписанный текст для облачной озвучки (≤300 символов) и его токен */
  cloud?: { text: string; token?: string };
}
export interface SpeakHandle {
  /** Немедленно обрывает озвучку. Колбэки после stop не вызываются. */
  stop(): void;
}

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const CHUNK_MAX = 200; // Chrome может молча оборвать длинный utterance, поэтому режем на предложения

let sharedAudio: HTMLAudioElement | null = null;
// Ссылки на utterance, чтобы сборщик мусора не убил их до onend (известный баг Chrome)
const keep: SpeechSynthesisUtterance[] = [];

const synthOk = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

const langTag = (lang: TtsLang) => (lang === "he" ? "he-IL" : "ru-RU");

function voiceMatches(v: SpeechSynthesisVoice, lang: TtsLang): boolean {
  const l = v.lang.toLowerCase().replace("_", "-");
  // на Android иврит иногда помечен старым кодом "iw"
  return lang === "he" ? l.startsWith("he") || l.startsWith("iw") : l.startsWith("ru");
}

function pickVoice(lang: TtsLang): SpeechSynthesisVoice | null {
  if (!synthOk()) return null;
  const list = window.speechSynthesis.getVoices().filter((v) => voiceMatches(v, lang));
  if (!list.length) return null;
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 2 : 0) +
    (/microsoft/i.test(v.name) ? 2 : 0) +
    (v.lang.replace("_", "-").toLowerCase() === langTag(lang).toLowerCase() ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a))[0];
}

/** Есть ли в браузере голос для языка (после ensureVoices). */
export function ttsSupported(lang: TtsLang): boolean {
  return pickVoice(lang) !== null;
}

/** Голоса грузятся асинхронно: ждём voiceschanged, но не дольше 1.5 с. */
export function ensureVoices(): Promise<void> {
  return new Promise((resolve) => {
    if (!synthOk() || window.speechSynthesis.getVoices().length > 0) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", finish);
      resolve();
    };
    synth.addEventListener("voiceschanged", finish);
    setTimeout(finish, 1500);
  });
}

/** Вызывать из обработчика клика: «разблокирует» аудио и синтез речи на iOS/Android для последующих вызовов. */
export function unlockAudio() {
  try {
    if (typeof window === "undefined") return;
    if (!sharedAudio) sharedAudio = new Audio();
    sharedAudio.src = SILENT_WAV;
    void sharedAudio.play().catch(() => {});
    if (synthOk()) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {
    /* без разблокировки просто может не сыграть на старом мобильном браузере */
  }
}

function speakBrowser(text: string, lang: TtsLang, h: SpeakHandlers): SpeakHandle {
  if (!synthOk()) {
    queueMicrotask(() => h.onError?.("unsupported"));
    return { stop() {} };
  }
  const synth = window.speechSynthesis;
  const voice = pickVoice(lang);
  const chunks = splitSentences(text, CHUNK_MAX);
  let i = 0;
  let done = false;
  let started = false;
  let guard: ReturnType<typeof setTimeout> | null = null;

  const clearGuard = () => {
    if (guard) clearTimeout(guard);
    guard = null;
  };
  const finish = (code?: string) => {
    if (done) return;
    done = true;
    clearGuard();
    keep.length = 0;
    if (code) h.onError?.(code);
    else h.onEnd?.();
  };
  const next = () => {
    if (done) return;
    clearGuard();
    if (i >= chunks.length) {
      finish();
      return;
    }
    const chunk = chunks[i++];
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = langTag(lang);
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onstart = () => {
      if (!started) {
        started = true;
        h.onStart?.();
      }
    };
    u.onend = next;
    u.onerror = (e) => {
      if (done) return;
      const code = (e as SpeechSynthesisErrorEvent).error || "error";
      if (code === "canceled" || code === "interrupted") return; // наш cancel
      finish(code);
    };
    keep.push(u);
    // страховка: если onend не придёт (баг браузера), идём дальше
    guard = setTimeout(() => {
      if (done) return;
      synth.cancel();
      next();
    }, 5000 + chunk.length * 150);
    try {
      synth.speak(u);
    } catch {
      finish("error");
    }
  };
  try {
    synth.cancel(); // чистим хвосты прошлой озвучки
    next();
  } catch {
    // например, браузер не принял голос: сообщаем об ошибке, а не зависаем
    queueMicrotask(() => finish("error"));
  }
  return {
    stop() {
      if (done) return;
      done = true;
      clearGuard();
      keep.length = 0;
      synth.cancel();
    },
  };
}

function speakCloud(cloud: { text: string; token?: string }, lang: TtsLang, h: SpeakHandlers, fallback: () => SpeakHandle): SpeakHandle {
  const ctrl = new AbortController();
  let stopped = false;
  let settled = false;
  let url = "";
  let inner: SpeakHandle | null = null;

  const cleanup = () => {
    if (url) URL.revokeObjectURL(url);
    url = "";
  };
  const fail = () => {
    if (stopped || settled) return;
    settled = true;
    cleanup();
    inner = fallback(); // молча откатываемся на голос браузера
  };

  fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: cloud.text, lang, token: cloud.token }),
    signal: ctrl.signal,
  })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.blob();
    })
    .then((blob) => {
      if (stopped) return;
      if (!sharedAudio) sharedAudio = new Audio();
      const a = sharedAudio;
      url = URL.createObjectURL(blob);
      a.onplay = () => h.onStart?.();
      a.onended = () => {
        if (stopped || settled) return;
        settled = true;
        cleanup();
        h.onEnd?.();
      };
      a.onerror = fail;
      a.src = url;
      return a.play();
    })
    .catch(() => fail());

  return {
    stop() {
      stopped = true;
      ctrl.abort();
      if (sharedAudio) {
        sharedAudio.onplay = null;
        sharedAudio.onended = null;
        sharedAudio.onerror = null;
        sharedAudio.pause();
      }
      cleanup();
      inner?.stop();
    },
  };
}

/** Озвучивает text (экранный текст не меняется). Возвращает handle для остановки. */
export function speak(text: string, lang: TtsLang, h: SpeakHandlers = {}, opts: SpeakOpts = {}): SpeakHandle {
  const browser = () => speakBrowser(text, lang, h);
  if (opts.provider === "elevenlabs" && opts.cloud?.text) return speakCloud(opts.cloud, lang, h, browser);
  return browser();
}

/** Принудительно останавливает всё, что говорит (например, при уходе со страницы). */
export function stopSpeaking() {
  try {
    if (sharedAudio) sharedAudio.pause();
    if (synthOk()) window.speechSynthesis.cancel();
  } catch {
    /* уже остановлено */
  }
}
