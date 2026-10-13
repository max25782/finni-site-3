// Голосовой ввод через браузерное распознавание речи (Web Speech API).
// ВАЖНО: в Chrome/Edge аудио обрабатывается на серверах производителя браузера. Поэтому функция включается только родителем.
import { music } from "./music";

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

const ctor = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

export const voiceSupported = () => !!ctor();

// Тексты ошибок распознавания (общие для арены и голосового разговора)
export const VOICE_MSG = {
  ru: {
    denied: "Браузер не дал доступ к микрофону. Разреши микрофон для сайта (значок замка рядом с адресом) или напиши текстом.",
    noMic: "Микрофон не найден. Напиши текстом.",
    network: "Нет связи с сервисом распознавания. Напиши текстом.",
    bad: "Не получилось распознать голос. Напиши текстом.",
    noSpeech: "Не слышу, попробуй ещё раз.",
  },
  he: {
    denied: "הדפדפן לא נתן גישה למיקרופון. אפשרו מיקרופון לאתר (סמל המנעול ליד הכתובת) או כתבו בטקסט.",
    noMic: "המיקרופון לא נמצא. כתבו בטקסט.",
    network: "אין קשר עם שירות הזיהוי. כתבו בטקסט.",
    bad: "לא הצלחנו לזהות קול. כתבו בטקסט.",
    noSpeech: "לא שומעים, נסו שוב.",
  },
} as const;

export function listen(lang: "ru" | "he", h: { onInterim: (t: string) => void; onFinal: (t: string) => void; onError: (code: string) => void; onEnd: () => void }): () => void {
  const C = ctor();
  if (!C) {
    h.onError("unsupported");
    h.onEnd();
    return () => {};
  }
  const r = new C();
  r.lang = lang === "he" ? "he-IL" : "ru-RU";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let finalText = "";

  // пока микрофон слушает, музыка полностью молчит (чтобы не попасть в распознавание)
  let held = true;
  music.hold(true);
  const unhold = () => {
    if (!held) return;
    held = false;
    music.hold(false);
  };

  r.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    h.onInterim((finalText + interim).trim());
  };
  r.onerror = (e: any) => {
    unhold();
    h.onError(String(e?.error || "error"));
  };
  r.onend = () => {
    unhold();
    if (finalText.trim()) h.onFinal(finalText.trim());
    h.onEnd();
  };
  try {
    r.start();
  } catch {
    unhold();
    h.onError("start_failed");
    h.onEnd();
  }
  return () => {
    try {
      r.stop();
    } catch {
      /* уже остановлено */
    }
    unhold(); // микрофон закрыт, музыку можно возвращать
  };
}
