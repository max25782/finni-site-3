import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { TTS_MAX_CHARS } from "@/lib/speech-text";
import { isStaticSpeech, ttsConfigured, verifySpeech, voiceIdFor } from "@/lib/tts-token";
import { ipOf, refund, take } from "@/lib/ratelimit";

export const runtime = "nodejs";

const HOUR = 3600_000;
const DAY = 86_400_000;
const CID = "finni_cid";

// LRU-кэш готового аудио для коротких повторяющихся фраз (ключ: хэш языка и текста). Текст нигде не логируется.
const CACHE_MAX_ITEMS = 80;
const CACHE_MAX_BYTES = 8 * 1024 * 1024;
const cache = new Map<string, Uint8Array>();
let cacheBytes = 0;
const cacheGet = (k: string) => {
  const v = cache.get(k);
  if (v) {
    cache.delete(k);
    cache.set(k, v); // освежаем позицию
  }
  return v;
};
function cacheSet(k: string, v: Uint8Array) {
  if (v.length > CACHE_MAX_BYTES / 4) return;
  cache.set(k, v);
  cacheBytes += v.length;
  while (cache.size > CACHE_MAX_ITEMS || cacheBytes > CACHE_MAX_BYTES) {
    const first = cache.keys().next().value as string | undefined;
    if (first === undefined) break;
    cacheBytes -= cache.get(first)!.length;
    cache.delete(first);
  }
}

const num = (name: string, def: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export async function POST(req: NextRequest) {
  // идентификатор клиента: cookie (httpOnly), нужен для лимитов помимо IP
  const existing = req.cookies.get(CID)?.value;
  const cid = existing && /^[a-f0-9]{32}$/.test(existing) ? existing : randomBytes(16).toString("hex");
  const finish = (res: NextResponse) => {
    if (cid !== existing) res.cookies.set(CID, cid, { httpOnly: true, sameSite: "lax", maxAge: 365 * 86400, path: "/", secure: process.env.NODE_ENV === "production" });
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  const err = (error: string, status: number) => finish(NextResponse.json({ error }, { status }));

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err("bad_request", 400);
  }
  const lang: "ru" | "he" | null = body?.lang === "ru" ? "ru" : body?.lang === "he" ? "he" : null;
  const text: string = typeof body?.text === "string" ? body.text.trim() : "";
  if (!lang || !text || text.length > TTS_MAX_CHARS) return err("bad_request", 400);

  // Сначала отказ чужому тексту (даже без ключа): роут не озвучивает «что угодно».
  if (!isStaticSpeech(lang, text) && !verifySpeech(body?.token, lang, text)) return err("forbidden", 403);

  const key = process.env.ELEVENLABS_API_KEY;
  const voice = voiceIdFor(lang);
  if (!ttsConfigured() || !key || !voice) return err("not_configured", 501);

  const ip = ipOf(req);
  if (!take(`tts:ip:${ip}`, num("TTS_HOURLY_PER_IP", 90), HOUR)) return err("rate_limited", 429);
  if (!take(`tts:cid:${cid}`, num("TTS_HOURLY_PER_CLIENT", 60), HOUR)) return err("rate_limited", 429);

  const ckey = createHash("sha256").update(`${lang}\n${text}`).digest("hex");
  const hit = cacheGet(ckey);
  const audio = (buf: Uint8Array) => finish(new NextResponse(buf as unknown as BodyInit, { status: 200, headers: { "Content-Type": "audio/mpeg" } }));
  if (hit) return audio(hit); // кэш не тратит символы провайдера

  // суточные потолки в символах: на клиента и общий
  const clientKey = `tts:chars:${cid}`;
  const globalKey = "tts:chars:global";
  if (!take(clientKey, num("TTS_CLIENT_DAILY_CHARS", 6000), DAY, text.length)) return err("rate_limited", 429);
  if (!take(globalKey, num("TTS_DAILY_CHAR_CAP", 40000), DAY, text.length)) {
    refund(clientKey, text.length);
    return err("rate_limited", 429);
  }

  try {
    const base = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io";
    // Иврит поддерживает eleven_v3 (multilingual_v2 иврит не поддерживает). Модель можно сменить в env.
    const res = await fetch(`${base}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": key, accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_v3", language_code: lang }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      refund(clientKey, text.length);
      refund(globalKey, text.length);
      console.error("[tts] upstream", res.status); // только статус, без текста и ключа
      return err("upstream", 502);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    cacheSet(ckey, buf);
    return audio(buf);
  } catch {
    refund(clientKey, text.length);
    refund(globalKey, text.length);
    return err("upstream", 502);
  }
}
