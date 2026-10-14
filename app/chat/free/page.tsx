"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { todayKey } from "@/lib/game";
import { careKind, careReply, containsPrivateData, SAFETY_REPLY, type CareKind } from "@/lib/safety";
import { voiceSupported } from "@/lib/voice";
import { useVoiceChat } from "@/lib/voicechat";
import type { VcTurn } from "@/lib/voicechat";
import { VoiceTalk } from "@/components/VoiceTalk";
import { CareCard } from "@/components/CareCard";
import { track } from "@/lib/analytics";

function ChatLimit({ text, quest }: { text: string; quest: string }) {
  useEffect(() => {
    track("limit_hit");
  }, []);
  return (
    <div className="card warn">
      <p>{text}</p>
      <Link className="btn secondary" href="/quest">
        🌍 {quest}
      </Link>
    </div>
  );
}

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_XP_DAILY_CAP = 60;

export default function ChatPage() {
  const { s, lang, t, ready, update, addXp } = useGame();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [care, setCare] = useState<CareKind>("none");
  const endRef = useRef<HTMLDivElement>(null);
  const [voiceOk, setVoiceOk] = useState(false);
  // актуальные значения для голосового цикла (колбэки приходят из замыканий старых рендеров)
  const msgsRef = useRef<Msg[]>([]);
  const busyRef = useRef(false);
  const sendRef = useRef<(raw?: string, viaVoice?: boolean) => Promise<VcTurn | null>>(async () => null);
  const safetyRef = useRef<() => void>(() => {});
  msgsRef.current = msgs;
  const vc = useVoiceChat({
    lang,
    provider: s.voiceProvider,
    send: (t) => sendRef.current(t, true),
    onInterim: (t) => setInput(t),
    onPrivate: () => safetyRef.current(),
    onCare: (k) => setCare(k),
  });

  useEffect(() => {
    setVoiceOk(voiceSupported());
    track("finny_chat_started");
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  if (!ready) return null;

  const today = todayKey();
  const used = s.chatDay === today ? s.chatCount : 0;
  const xpToday = s.chatDay === today ? s.chatXp : 0;
  const left = Math.max(0, s.dailyChatLimit - used);
  const limitReached = left <= 0;

  // показ SAFETY вместо отправки (общая логика для набранного и голосового текста)
  function showSafety() {
    setMsgs((m) => [...m, { role: "user", content: "🙈 …" }, { role: "assistant", content: SAFETY_REPLY[lang] }]);
  }
  safetyRef.current = showSafety;

  async function send(raw?: string, viaVoice = false): Promise<VcTurn | null> {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current || limitReached) return null;
    setError("");
    setInput("");

    // Личные данные и тревожные слова: не отправляем в модель и не храним текст.
    if (containsPrivateData(text)) {
      showSafety();
      return { reply: SAFETY_REPLY[lang], over: false };
    }
    const kind = careKind(text);
    if (kind !== "none") {
      setCare(kind);
      return { reply: careReply(kind, lang), over: false };
    }

    const next: Msg[] = [...msgsRef.current, { role: "user", content: text }];
    msgsRef.current = next;
    setMsgs(next);
    busyRef.current = true;
    setBusy(true);
    update({ chatDay: today, chatCount: used + 1, chatXp: xpToday });

    try {
      const history = next.filter((m) => m.content !== "🙈 …").slice(-12);
      const res = await fetch("/api/finni", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, lang, age: s.age, voice: viaVoice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) {
        const code = [data.error, data.status].filter(Boolean).join(" ");
        setError(`${t("chatError")}${code ? ` [${code}]` : ""}`);
        return null;
      }
      setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
      if (!data.blocked && data.xp > 0) {
        const room = Math.max(0, CHAT_XP_DAILY_CAP - xpToday);
        const gain = Math.min(room, data.xp);
        if (gain > 0) {
          addXp(gain);
          update({ chatDay: today, chatXp: xpToday + gain });
        }
      }
      // дневной лимит сообщений исчерпан этим ходом: голосовой цикл после озвучки остановится
      return { reply: String(data.reply), speech: typeof data.speech === "string" ? data.speech : undefined, token: typeof data.ttsToken === "string" ? data.ttsToken : undefined, over: used + 1 >= s.dailyChatLimit };
    } catch {
      setError(t("chatError"));
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  sendRef.current = send;

  return (
    <>
      <p><Link className="btn secondary" href="/chat" aria-label={lang === "he" ? "חזרה" : "Назад"}>{lang === "he" ? "➡︎" : "⬅︎"}</Link></p>
      <h1>🦝 {t("chatTitle")}</h1>
      <p className="muted">🔐 {t("chatWarn")}</p>
      {care !== "none" && <CareCard kind={care} lang={lang} onClose={() => setCare("none")} />}

      <div className="chat">
        <div className="bubble finni">{t("chatGreeting")}</div>
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role === "user" ? "me" : "finni"}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="bubble finni muted">{t("thinking")}</div>}
        {error && <div className="bubble finni">{error}</div>}
        <div ref={endRef} />
      </div>

      {limitReached ? (
        <ChatLimit text={t("chatLimit")} quest={t("offlineMission")} />
      ) : (
        <>
          <div className="chatbar">
            <input
              type="text"
              value={input}
              maxLength={300}
              placeholder={t("chatPlaceholder")}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void send()}
              autoComplete="off"
            />
            <button className="btn" onClick={() => void send()} disabled={busy || !input.trim()}>
              {t("send")}
            </button>
          </div>
          <VoiceTalk vc={vc} lang={lang} unavailable={!voiceOk ? "unsupported" : !(s.voiceInput && s.voiceChat) ? "parents" : ""} />
          <p className="muted" style={{ marginTop: 8 }}>
            {t("chatLeft")}: {left}
          </p>
        </>
      )}
    </>
  );
}
