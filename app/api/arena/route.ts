import { NextRequest, NextResponse } from "next/server";
import { careKind, careReply, containsPrivateData, SAFETY_REPLY } from "@/lib/safety";
import { ARENA_MAX_TURNS, DEBATES, HAGGLES, TACTIC_KEYS } from "@/lib/arena";
import { FLOORS, debateSystem, haggleSystem, parseJson } from "@/lib/arena-server";
import { speechExtras } from "@/lib/tts-token";

export const runtime = "nodejs";

const MAX_MSG_LEN = 400;
const hourly = new Map<string, { n: number; reset: number }>();
let daily = { n: 0, reset: Date.now() + 86400000 };

function overLimit(ip: string): boolean {
  const now = Date.now();
  if (now > daily.reset) daily = { n: 0, reset: now + 86400000 };
  if (daily.n >= Number(process.env.FINNI_DAILY_CAP ?? 500)) return true;
  const rec = hourly.get(ip);
  if (!rec || now > rec.reset) hourly.set(ip, { n: 1, reset: now + 3600000 });
  else {
    if (rec.n >= Number(process.env.FINNI_HOURLY_PER_IP ?? 60)) return true;
    rec.n++;
  }
  daily.n++;
  return false;
}

const str = (v: unknown, n = 160) => (typeof v === "string" ? v.slice(0, n).trim() : "");
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const lang: "ru" | "he" = body?.lang === "ru" ? "ru" : "he";
  const voice = body?.voice === true; // голосовой режим: короткие ответы и данные для озвучки
  const mode: "haggle" | "debate" | null = body?.mode === "haggle" || body?.mode === "debate" ? body.mode : null;
  const id = str(body?.id, 20);
  if (!mode) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const known = mode === "haggle" ? HAGGLES.find((h) => h.id === id) : DEBATES.find((d) => d.id === id);
  if (!known) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Берём только реплики ребёнка и ответы Финни (текстом), без чужих полей.
  const raw = Array.isArray(body?.messages) ? body.messages.slice(-20) : null;
  if (!raw) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
    msgs.push({ role: m.role, content: m.content.slice(0, MAX_MSG_LEN) });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const turnsUsed = msgs.filter((m) => m.role === "user").length;
  const maxTurns = ARENA_MAX_TURNS[mode];
  if (turnsUsed > maxTurns) return NextResponse.json({ error: "round_over" }, { status: 400 });
  const turnsLeft = maxTurns - turnsUsed;

  if (msgs.some((m) => m.role === "user" && containsPrivateData(m.content))) {
    return NextResponse.json({ blocked: true, reply: SAFETY_REPLY[lang] });
  }
  const care = msgs.reduce<"none" | "distress" | "harm">((acc, m) => {
    if (m.role !== "user") return acc;
    const k = careKind(m.content);
    if (k === "harm" || acc === "harm") return "harm";
    if (k === "distress") return "distress";
    return acc;
  }, "none");
  if (care !== "none") {
    return NextResponse.json({ blocked: true, reply: careReply(care, lang) });
  }
  if (overLimit(req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown")) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sc = known as any;
  const lastPrice = mode === "haggle" ? clamp(Number(body?.price) || sc.list, FLOORS[id], sc.list) : 0;
  const meter = mode === "debate" ? clamp(Number(body?.meter) || 0, 0, 100) : 0;
  const system = mode === "haggle" ? haggleSystem(lang, id, lastPrice, turnsLeft, voice) : debateSystem(lang, id, meter, turnsLeft, voice);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 500, system, messages: msgs }),
    });
    if (!res.ok) {
      console.error("[arena] upstream", res.status);
      return NextResponse.json({ error: "upstream", status: res.status }, { status: 502 });
    }
    const data = await res.json();
    const text: string = (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n");
    const j = parseJson(text) ?? {};
    const reply = str(j.reply, 400) || text.replace(/[{}"]/g, "").slice(0, 300);
    const tactics = (Array.isArray(j.tactics) ? j.tactics : []).filter((t: unknown) => typeof t === "string" && TACTIC_KEYS.includes(t)).slice(0, 4);
    const worked = str(j.worked, 220);
    const tryNext = str(j.tryNext, 220);

    if (mode === "haggle") {
      let price = Number(j.price);
      if (!Number.isFinite(price)) price = lastPrice;
      price = Math.round(clamp(price, FLOORS[id], lastPrice));
      const deal = j.deal === true;
      const over = deal || turnsLeft === 0;
      let xp = 0;
      if (over) xp = deal ? Math.min(30, 10 + Math.round((20 * (sc.list - price)) / Math.max(1, sc.list - FLOORS[id]))) : 5;
      return NextResponse.json({ reply, price, deal, over, turnsLeft, xp, tactics, worked: over ? worked : "", tryNext: over ? tryNext : "", ...speechExtras(reply, lang, voice) });
    }
    let m2 = Number(j.convinced);
    if (!Number.isFinite(m2)) m2 = meter;
    m2 = Math.round(clamp(m2, Math.max(0, meter - 10), Math.min(100, meter + 35)));
    const won = m2 >= 100;
    const over = won || turnsLeft === 0;
    const xp = over ? (won ? Math.min(30, 15 + 3 * turnsLeft) : 3 + Math.round((m2 / 100) * 12)) : 0;
    return NextResponse.json({ reply, convinced: m2, won, over, turnsLeft, xp, tactics, worked: over ? worked : "", tryNext: over ? tryNext : "", ...speechExtras(reply, lang, voice) });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
