// Подготовка текста для озвучки. Общий модуль для клиента и сервера:
// сервер подписывает именно подготовленный и обрезанный текст, клиент его же проигрывает.
import { SAFETY_REPLY } from "./safety";

export type SpeechLang = "ru" | "he";

/** Максимум символов, которые уходят в облачную озвучку за один запрос. */
export const TTS_MAX_CHARS = 300;

// Эмодзи, селекторы вариантов, ZWJ, кейкапы, флаги, модификаторы тона кожи
const EMOJI = /[\p{Extended_Pictographic}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu;

// «шекель/шекеля/шекелей» и «שקל/שקלים» в зависимости от числа
function shekelWord(n: number, lang: SpeechLang): string {
  if (lang === "he") return n === 1 ? "שקל" : "שקלים";
  if (!Number.isInteger(n)) return "шекеля";
  const i = Math.abs(n);
  const m10 = i % 10;
  const m100 = i % 100;
  if (m10 === 1 && m100 !== 11) return "шекель";
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return "шекеля";
  return "шекелей";
}

/** Убирает эмодзи и markdown, ₪ превращает в слово. Экранный текст не меняется, это только для голоса. */
export function prepareForSpeech(text: string, lang: SpeechLang): string {
  let t = String(text ?? "");
  t = t.replace(/<xp>[\s\S]*?<\/xp>/gi, " ");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // [текст](ссылка) -> текст
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*₪|₪\s*(\d+(?:[.,]\d+)?)/g, (_m, a: string | undefined, b: string | undefined) => {
    const raw = (a ?? b ?? "0").replace(",", ".");
    return `${(a ?? b ?? "").trim()} ${shekelWord(parseFloat(raw), lang)}`;
  });
  t = t.replace(/₪/g, lang === "he" ? "שקל" : "шекель");
  t = t.replace(EMOJI, " ");
  t = t.replace(/^\s*(?:[-*•]+|\d+[.)])\s+/gm, ""); // маркеры списков в начале строки
  t = t.replace(/[*_`#>~|]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Режет текст на предложения, каждое не длиннее max (длинные дробит по пробелам). */
export function splitSentences(text: string, max: number): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const p of parts) {
    if (p.length > max) {
      flush();
      let rest = p.trim();
      while (rest.length > max) {
        let cut = rest.lastIndexOf(" ", max);
        if (cut < max / 2) cut = max;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      cur = rest;
      continue;
    }
    if ((cur + p).length > max) flush();
    cur += p;
  }
  flush();
  return out.length ? out : [text.slice(0, max)];
}

/** Подготовленный текст, обрезанный по границе предложений до лимита облачной озвучки. */
export function speechFor(text: string, lang: SpeechLang): string {
  const t = prepareForSpeech(text, lang);
  if (t.length <= TTS_MAX_CHARS) return t;
  const sentences = splitSentences(t, TTS_MAX_CHARS);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > TTS_MAX_CHARS) break;
    out = (out + " " + s).trim();
  }
  return out || sentences[0].slice(0, TTS_MAX_CHARS);
}

/** Фиксированная фраза, которую озвучиваем без токена (клиент сам показывает SAFETY_REPLY, не вызывая модель). */
export const staticSpeech = (lang: SpeechLang): string => speechFor(SAFETY_REPLY[lang], lang);
