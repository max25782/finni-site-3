import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/prompt";
import { careKind, careReply, containsPrivateData, SAFETY_REPLY } from "@/lib/safety";
import { speechExtras } from "@/lib/tts-token";

export const runtime = "nodejs";

const MAX_MSG_LEN = 500;
const MAX_HISTORY = 12;
const MAX_XP_PER_REPLY = 15;

// Простейший лимит в памяти. На Vercel он действует отдельно для каждого инстанса,
// поэтому это только базовая защита бюджета. Для продакшена: Upstash/Supabase.
const hourly = new Map<string, { n: number; reset: number }>();
let daily = { n: 0, reset: Date.now() + 86400000 };

function ipOf(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "") || "unknown";
}

function overLimit(ip: string): boolean {
  const now = Date.now();
  if (now > daily.reset) daily = { n: 0, reset: now + 86400000 };
  const dailyCap = Number(process.env.FINNI_DAILY_CAP ?? 500);
  const perIp = Number(process.env.FINNI_HOURLY_PER_IP ?? 40);
  if (daily.n >= dailyCap) return true;
  const rec = hourly.get(ip);
  if (!rec || now > rec.reset) {
    hourly.set(ip, { n: 1, reset: now + 3600000 });
  } else {
    if (rec.n >= perIp) return true;
    rec.n++;
  }
  daily.n++;
  return false;
}

type Msg = { role: "user" | "assistant"; content: string };

function cleanMessages(raw: unknown): Msg[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Msg[] = [];
  for (const m of raw.slice(-MAX_HISTORY)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    out.push({ role: m.role, content: m.content.slice(0, MAX_MSG_LEN) });
  }
  while (out.length && out[0].role !== "user") out.shift();
  // чередование ролей
  const alt: Msg[] = [];
  for (const m of out) {
    if (alt.length && alt[alt.length - 1].role === m.role) alt[alt.length - 1] = m;
    else alt.push(m);
  }
  if (!alt.length || alt[alt.length - 1].role !== "user") return null;
  return alt;
}

// Проверка для родителя: GET /api/finni показывает, видит ли сервер ключ (сам ключ не раскрывается).
export async function GET() {
  return NextResponse.json({
    keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const lang: "ru" | "he" = body?.lang === "ru" ? "ru" : "he";
  const voice = body?.voice === true; // голосовой режим
  const ageNum = Number(body?.age);
  const age = Number.isFinite(ageNum) && ageNum >= 7 && ageNum <= 14 ? Math.round(ageNum) : null;
  const messages = cleanMessages(body?.messages);
  if (!messages) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Повторная проверка на сервере: ни одно сообщение с личными данными не уходит в модель.
  if (messages.some((m) => m.role === "user" && containsPrivateData(m.content))) {
    return NextResponse.json({ reply: SAFETY_REPLY[lang], xp: 0, blocked: true });
  }
  const care = messages.reduce<"none" | "distress" | "harm">((acc, m) => {
    if (m.role !== "user") return acc;
    const k = careKind(m.content);
    if (k === "harm" || acc === "harm") return "harm";
    if (k === "distress") return "distress";
    return acc;
  }, "none");
  if (care !== "none") {
    return NextResponse.json({ reply: careReply(care, lang), xp: 0, blocked: true });
  }

  if (overLimit(ipOf(req))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 600,
        system: buildSystemPrompt(lang, age, voice),
        messages,
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const eb = await res.json();
        detail = String(eb?.error?.message ?? eb?.error?.type ?? "").slice(0, 200);
      } catch {
        /* тело не JSON */
      }
      console.error("[finni] Anthropic API error", res.status, detail);
      return NextResponse.json({ error: "upstream", status: res.status, detail }, { status: 502 });
    }
    const data = await res.json();
    const raw: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    const m = raw.match(/<xp>\s*(\d{1,3})\s*<\/xp>/i);
    const xp = Math.min(MAX_XP_PER_REPLY, m ? parseInt(m[1], 10) : 0);
    const reply = raw.replace(/<xp>[\s\S]*?<\/xp>/gi, "").trim();

    return NextResponse.json({ reply, xp, ...speechExtras(reply, lang, voice) });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
