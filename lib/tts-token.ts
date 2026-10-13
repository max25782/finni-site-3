// ТОЛЬКО сервер: подпись текста, который только что вернула наша модель.
// /api/tts озвучивает лишь текст с валидной подписью (или фиксированные фразы), поэтому роут нельзя
// использовать как открытый «озвучиватель чего угодно». Подпись stateless: HMAC(ts, lang, text), TTL 10 минут.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { speechFor, staticSpeech } from "./speech-text";
import type { SpeechLang } from "./speech-text";

const TTL_MS = 10 * 60 * 1000;

function secret(): string {
  // Отдельный секрет можно задать в env, иначе выводим из ключей сервера (в клиент не попадает).
  return (
    process.env.TTS_SIGNING_SECRET ||
    createHash("sha256").update(`finni-tts-v1:${process.env.ELEVENLABS_API_KEY ?? ""}:${process.env.ANTHROPIC_API_KEY ?? ""}`).digest("hex")
  );
}

const mac = (ts: string, lang: string, text: string) => createHmac("sha256", secret()).update(`${ts}\n${lang}\n${text}`).digest("base64url");

export function signSpeech(lang: SpeechLang, text: string): string {
  const ts = String(Date.now());
  return `${ts}.${mac(ts, lang, text)}`;
}

export function verifySpeech(token: unknown, lang: SpeechLang, text: string): boolean {
  if (typeof token !== "string" || token.length > 200) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig || !/^\d{10,16}$/.test(ts)) return false;
  const age = Date.now() - Number(ts);
  if (age < -60_000 || age > TTL_MS) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(ts, lang, text));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const ttsConfigured = (): boolean => Boolean(process.env.ELEVENLABS_API_KEY);

export function voiceIdFor(lang: SpeechLang): string {
  return (lang === "he" ? process.env.ELEVENLABS_VOICE_HE : process.env.ELEVENLABS_VOICE_RU) ?? "";
}

export function isStaticSpeech(lang: SpeechLang, text: string): boolean {
  return text === staticSpeech(lang);
}

/** Для ответов модели в голосовом режиме: готовый для озвучки текст и подпись (если облачная озвучка настроена). */
export function speechExtras(reply: string, lang: SpeechLang, voice: boolean): { speech?: string; ttsToken?: string } {
  if (!voice || !ttsConfigured() || !voiceIdFor(lang)) return {};
  const speech = speechFor(reply, lang);
  return speech ? { speech, ttsToken: signSpeech(lang, speech) } : {};
}
