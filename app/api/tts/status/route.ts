import { NextResponse } from "next/server";
import { ttsConfigured, voiceIdFor } from "@/lib/tts-token";

export const runtime = "nodejs";

// Для раздела родителей: настроена ли облачная озвучка (ключ и голоса не раскрываются).
export async function GET() {
  const he = ttsConfigured() && Boolean(voiceIdFor("he"));
  const ru = ttsConfigured() && Boolean(voiceIdFor("ru"));
  return NextResponse.json({ configured: he || ru, langs: { he, ru } }, { headers: { "Cache-Control": "no-store" } });
}
