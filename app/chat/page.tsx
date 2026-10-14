"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { todayKey } from "@/lib/game";
import { careKind, careReply, containsPrivateData, SAFETY_REPLY, type CareKind } from "@/lib/safety";
import { CareCard } from "@/components/CareCard";
import { ARENA_MAX_TURNS, ARENA_ROUNDS_PER_DAY, DEBATES, HAGGLES, TACTICS } from "@/lib/arena";
import { listen, voiceSupported, VOICE_MSG } from "@/lib/voice";
import { useVoiceChat } from "@/lib/voicechat";
import type { VcTurn } from "@/lib/voicechat";
import { VoiceTalk } from "@/components/VoiceTalk";
import { Burst } from "@/components/fx";
import { sfx } from "@/lib/fx";
import { track } from "@/lib/analytics";

type Mode = "haggle" | "debate";
type Msg = { role: "user" | "assistant"; content: string };
type Over = { xp: number; deal?: boolean; won?: boolean; tactics: string[]; worked: string; tryNext: string; price?: number; meter?: number };

const tx = {
  ru: {
    h: "🦝 Арена Финни", sub: "Не вопросы, а поединки. Выбери игру.",
    haggle: "Торгуюсь с Финни", haggleD: "Продавец не хочет уступать. Убеди его на лучшую цену.",
    debate: "Спор с Финни", debateD: "Финни защищает глупую идею. Переубеди его за 6 реплик.",
    free: "Свободный вопрос Финни", rounds: "Раундов сегодня", pick: "Выбери ситуацию", pickDebate: "Какую глупость будем разносить?",
    start: "В бой!", you: "Ты", price: "Цена на столе", goal: "Твоя цель", turns: "Осталось реплик", convinced: "Финни убеждён",
    placeholder: "Скажи или напиши свой довод…", send: "Сказать", listening: "Говори… 🎙️",
    voiceNoSupport: "Голос недоступен в этом браузере, напиши текстом.", voiceParents: "Голос включают родители.",
    done: "Раунд окончен", deal: "Сделка! 🎉", nodeal: "Сделки не вышло", won: "Финни сдался! 🏆", notWon: "Финни устоял, но ты был(а) близко",
    tactics: "Твои приёмы", worked: "Что сработало", next: "Попробуй в следующий раз", again: "Ещё раунд", hub: "К арене",
    limit: "На сегодня раундов хватит. Арена снова откроется завтра. Лучшая практика: проверь цену в настоящем магазине вместе со взрослым.",
    err: "Финни отвлёкся. Попробуй ещё раз.", note: "Все суммы игровые. Не пиши личные данные.", hint: "Подсказка",
    save: "Сэкономлено", inGame: "игровых ₪",
  },
  he: {
    h: "🦝 זירת פיני", sub: "לא שאלות אלא דו-קרב. בחרו משחק.",
    haggle: "מתמקחים עם פיני", haggleD: "המוכר לא רוצה לוותר. שכנעו אותו להוריד מחיר.",
    debate: "ויכוח עם פיני", debateD: "פיני מגן על רעיון מטופש. שכנעו אותו תוך 6 תגובות.",
    free: "שאלה חופשית לפיני", rounds: "סיבובים היום", pick: "בחרו מצב", pickDebate: "איזה שטות נפרק?",
    start: "לקרב!", you: "אתם", price: "המחיר על השולחן", goal: "היעד שלכם", turns: "נשארו תגובות", convinced: "פיני משוכנע",
    placeholder: "דברו או כתבו את הטיעון…", send: "לומר", listening: "דברו… 🎙️",
    voiceNoSupport: "הקול לא זמין בדפדפן הזה, כתבו בטקסט.", voiceParents: "את הקול מפעילים ההורים.",
    done: "הסיבוב הסתיים", deal: "עסקה! 🎉", nodeal: "לא יצאה עסקה", won: "פיני נכנע! 🏆", notWon: "פיני החזיק מעמד אבל הייתם קרובים",
    tactics: "הטכניקות שלכם", worked: "מה עבד", next: "נסו בפעם הבאה", again: "עוד סיבוב", hub: "לזירה",
    limit: "להיום מספיק סיבובים. הזירה תיפתח שוב מחר. תרגול טוב: בדקו מחיר בחנות אמיתית עם מבוגר.",
    err: "פיני התפזר. נסו שוב.", note: "כל הסכומים במשחק. אל תכתבו מידע אישי.", hint: "רמז",
    save: "נחסך", inGame: "₪ משחק",
  },
};

function ArenaLimit({ text }: { text: string }) {
  useEffect(() => {
    track("limit_hit");
  }, []);
  return <div className="card warn">{text}</div>;
}

export default function ArenaPage() {
  const { s, lang, ready, update, addXp, addBadge } = useGame();
  const x = tx[lang];
  const vm = VOICE_MSG[lang];
  const [view, setView] = useState<"hub" | "pick" | "play">("hub");
  const [mode, setMode] = useState<Mode>("haggle");
  const [sid, setSid] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [price, setPrice] = useState(0);
  const [meter, setMeter] = useState(0);
  const [turnsLeft, setTurnsLeft] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [over, setOver] = useState<Over | null>(null);
  const [rec, setRec] = useState(false);
  const stopRef = useRef<null | (() => void)>(null);
  const counted = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [voiceOk, setVoiceOk] = useState(false);
  const [hint, setHint] = useState("");
  const [care, setCare] = useState<CareKind>("none");
  // Актуальные значения для колбэков распознавания: onFinal приходит из замыкания старого рендера.
  const msgsRef = useRef<Msg[]>([]);
  const priceRef = useRef(0);
  const meterRef = useRef(0);
  const busyRef = useRef(false);
  const sendRef = useRef<(raw?: string, viaVoice?: boolean) => Promise<VcTurn | null>>(async () => null);
  const safetyRef = useRef<() => void>(() => {});
  // голосовой разговор: ход отправляет та же send, что и текстовый ввод (через ref, чтобы не было старых замыканий)
  const vc = useVoiceChat({
    lang,
    provider: s.voiceProvider,
    send: (t) => sendRef.current(t, true),
    onInterim: (t) => setInput(t),
    onPrivate: () => safetyRef.current(),
    onCare: (k) => setCare(k),
  });
  msgsRef.current = msgs;
  priceRef.current = price;
  meterRef.current = meter;

  useEffect(() => {
    setVoiceOk(voiceSupported());
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);
  useEffect(() => {
    return () => {
      stopRef.current?.();
    };
  }, []);
  // ушли с экрана игры: голосовой разговор выключаем
  useEffect(() => {
    if (view !== "play") vc.stop();
  }, [view, vc.stop]);

  if (!ready) return null;
  const today = todayKey();
  const used = s.arenaDay === today ? s.arenaRounds : 0;
  const limitReached = used >= ARENA_ROUNDS_PER_DAY;
  const hs = mode === "haggle" ? HAGGLES.find((h) => h.id === sid) : undefined;
  const ds = mode === "debate" ? DEBATES.find((d) => d.id === sid) : undefined;

  function begin(m: Mode, id: string) {
    track("finny_chat_started");
    setMode(m);
    setSid(id);
    msgsRef.current = [];
    setMsgs([]);
    setErr("");
    setHint("");
    setInput("");
    setOver(null);
    setMeter(0);
    setPrice(m === "haggle" ? HAGGLES.find((h) => h.id === id)!.list : 0);
    setTurnsLeft(ARENA_MAX_TURNS[m]);
    counted.current = false;
    setView("play");
    sfx("tick");
  }

  // показ SAFETY вместо отправки (общая логика для набранного и голосового текста)
  function showSafety() {
    setMsgs((mm) => [...mm, { role: "user", content: "🙈 …" }, { role: "assistant", content: SAFETY_REPLY[lang] }]);
  }
  safetyRef.current = showSafety;

  async function send(raw?: string, viaVoice = false): Promise<VcTurn | null> {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current || over) return null;
    setErr("");
    setHint("");
    setInput("");
    // фильтр личных данных и тревожных слов: текст не уходит в модель
    if (containsPrivateData(text)) {
      showSafety();
      return { reply: SAFETY_REPLY[lang], over: false };
    }
    const kind = careKind(text);
    if (kind !== "none") {
      setCare(kind);
      return { reply: careReply(kind, lang), over: false };
    }
    if (!counted.current) {
      counted.current = true;
      update({ arenaDay: today, arenaRounds: used + 1 });
    }
    // снимок актуального состояния (из ref, а не из замыкания)
    const prevMsgs = msgsRef.current;
    const prevPrice = priceRef.current;
    const prevMeter = meterRef.current;
    const next: Msg[] = [...prevMsgs, { role: "user", content: text }];
    msgsRef.current = next;
    setMsgs(next);
    busyRef.current = true;
    setBusy(true);
    sfx("tick");
    try {
      const history = next.filter((m) => m.content !== "🙈 …");
      const res = await fetch("/api/arena", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, id: sid, lang, messages: history, price: prevPrice, meter: prevMeter, voice: viaVoice }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.reply) {
        setErr([x.err, d.error].filter(Boolean).join(" "));
        msgsRef.current = prevMsgs;
        setMsgs(prevMsgs);
        setInput(text);
        return null;
      }
      setMsgs((mm) => [...mm, { role: "assistant", content: d.reply }]);
      if (typeof d.turnsLeft === "number") setTurnsLeft(d.turnsLeft);
      if (mode === "haggle" && typeof d.price === "number") {
        if (d.price < prevPrice) sfx("good");
        setPrice(d.price);
      }
      if (mode === "debate" && typeof d.convinced === "number") {
        if (d.convinced > prevMeter) sfx("good");
        else sfx("soft");
        setMeter(d.convinced);
      }
      if (d.over) {
        const gain = Math.max(0, Number(d.xp) || 0);
        addXp(gain);
        if (mode === "haggle" && d.deal && hs && (hs.list - d.price) / Math.max(1, hs.list - hs.goal) >= 0.8) addBadge("haggler");
        if (mode === "debate" && d.won) addBadge("debater");
        setOver({ xp: gain, deal: d.deal, won: d.won, tactics: d.tactics ?? [], worked: d.worked ?? "", tryNext: d.tryNext ?? "", price: d.price, meter: d.convinced });
        sfx((d.deal || d.won) ? "win" : "soft");
      }
      return { reply: String(d.reply), speech: typeof d.speech === "string" ? d.speech : undefined, token: typeof d.ttsToken === "string" ? d.ttsToken : undefined, over: Boolean(d.over) };
    } catch {
      setErr(x.err);
      msgsRef.current = prevMsgs;
      setMsgs(prevMsgs);
      setInput(text);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  sendRef.current = send;

  // код ошибки распознавания -> понятное сообщение (no-speech и aborted не считаются ошибкой)
  function onVoiceError(c: string) {
    if (c === "aborted") return;
    if (c === "no-speech") {
      setHint(vm.noSpeech);
      return;
    }
    if (c === "not-allowed" || c === "service-not-allowed") setErr(vm.denied);
    else if (c === "audio-capture") setErr(vm.noMic);
    else if (c === "network") setErr(vm.network);
    else setErr(vm.bad);
  }

  function mic() {
    if (rec) {
      stopRef.current?.();
      return;
    }
    setErr("");
    setHint("");
    setRec(true);
    stopRef.current = listen(lang, {
      onInterim: (t) => setInput(t),
      onFinal: (t) => void sendRef.current(t),
      onError: onVoiceError,
      onEnd: () => setRec(false),
    });
  }

  // ---------- хаб ----------
  if (view === "hub")
    return (
      <>
        <h1>{x.h}</h1>
        <p className="muted">{x.sub}</p>
        <p className="muted">
          {x.rounds}: {Math.min(used, ARENA_ROUNDS_PER_DAY)}/{ARENA_ROUNDS_PER_DAY}
        </p>
        {limitReached && <ArenaLimit text={x.limit} />}
        <button className="card hero" style={{ width: "100%", textAlign: "start", cursor: "pointer" }} disabled={limitReached} onClick={() => { setMode("haggle"); setView("pick"); }}>
          <h2>🤝 {x.haggle}</h2>
          <p className="muted" style={{ margin: 0 }}>{x.haggleD}</p>
        </button>
        <button className="card hero" style={{ width: "100%", textAlign: "start", cursor: "pointer" }} disabled={limitReached} onClick={() => { setMode("debate"); setView("pick"); }}>
          <h2>🗣️ {x.debate}</h2>
          <p className="muted" style={{ margin: 0 }}>{x.debateD}</p>
        </button>
        <p>
          <Link className="btn secondary" href="/chat/free">💬 {x.free}</Link>
        </p>
        <p className="muted">{x.note}</p>
      </>
    );

  if (view === "pick")
    return (
      <>
        <p><button className="btn secondary" aria-label={lang === "he" ? "חזרה" : "Назад"} onClick={() => setView("hub")}>{lang === "he" ? "➡︎" : "⬅︎"}</button></p>
        <h1>{mode === "haggle" ? x.pick : x.pickDebate}</h1>
        {mode === "haggle"
          ? HAGGLES.map((h) => (
              <button key={h.id} className="card" style={{ width: "100%", textAlign: "start", cursor: "pointer" }} onClick={() => begin("haggle", h.id)}>
                <h2>{h.emoji} {h.title[lang]}</h2>
                <p className="muted" style={{ margin: 0 }}>{h.intro[lang]}</p>
              </button>
            ))
          : DEBATES.map((d) => (
              <button key={d.id} className="card" style={{ width: "100%", textAlign: "start", cursor: "pointer" }} onClick={() => begin("debate", d.id)}>
                <h2>{d.emoji} {d.thesis[lang]}</h2>
                <p className="muted" style={{ margin: 0 }}>{x.hint}: {d.hint[lang]}</p>
              </button>
            ))}
      </>
    );

  // ---------- игра ----------
  // состояния кнопки: не поддерживается / выключено родителем / работает
  const voiceNote = !voiceOk ? x.voiceNoSupport : !s.voiceInput ? x.voiceParents : "";
  const canVoice = voiceNote === "";
  const talkUnavailable = !voiceOk ? "unsupported" : !(s.voiceInput && s.voiceChat) ? "parents" : "";
  return (
    <>
      {over && <Burst emojis={["🪙", "🎉", "⭐", "✨"]} count={over.deal || over.won ? 26 : 8} />}
      <div className="stage k-choice" style={{ minHeight: 0, paddingBottom: 14 }}>
        <div className="hero-emoji" style={{ fontSize: 48 }}>{mode === "haggle" ? hs?.emoji : ds?.emoji}</div>
        <div className="stage-title">{mode === "haggle" ? hs?.title[lang] : ds?.thesis[lang]}</div>
        {mode === "haggle" && hs && (
          <div className="row" style={{ justifyContent: "center", marginTop: 8, gap: 8 }}>
            <span className="pill pop" key={price} style={{ color: "var(--ink)" }}>🏷️ {x.price}: {price} ₪</span>
            <span className="pill" style={{ color: "var(--ink)" }}>🎯 {x.goal}: ≤{hs.goal} ₪</span>
          </div>
        )}
        {mode === "debate" && (
          <div style={{ marginTop: 10 }}>
            <div className="bar"><span style={{ width: `${meter}%`, transition: "width .6s" }} /></div>
            <p style={{ margin: "4px 0 0", fontWeight: 800 }}>{x.convinced}: {meter}%</p>
          </div>
        )}
      </div>

      {care !== "none" && <CareCard kind={care} lang={lang} onClose={() => setCare("none")} />}

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span className="muted">{x.turns}: {turnsLeft}</span>
        <span className="dots" style={{ margin: 0 }}>
          {Array.from({ length: ARENA_MAX_TURNS[mode] }, (_, i) => <i key={i} className={i < ARENA_MAX_TURNS[mode] - turnsLeft ? "on" : ""} />)}
        </span>
      </div>

      <div className="chat">
        <div className="bubble finni">
          {mode === "haggle" ? hs?.intro[lang] : `${ds?.thesis[lang]} 🦝`}
        </div>
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role === "user" ? "me" : "finni"}`}>{m.content}</div>
        ))}
        {busy && <div className="bubble finni muted">…</div>}
        {err && <div className="bubble finni">{err}</div>}
        <div ref={endRef} />
      </div>

      {over ? (
        <div className={`card ${over.deal || over.won ? "good" : "warn"}`}>
          <h2>
            {mode === "haggle" ? (over.deal ? x.deal : x.nodeal) : over.won ? x.won : x.notWon}
          </h2>
          {mode === "haggle" && over.deal && hs && (
            <p className="headline">{x.save}: {hs.list - (over.price ?? hs.list)} {x.inGame}</p>
          )}
          <span className="xpfly">+{over.xp} XP</span>
          {over.tactics.length > 0 && (
            <>
              <h3>{x.tactics}</h3>
              <p className="row" style={{ gap: 6 }}>
                {over.tactics.map((t) => (
                  <span key={t} className="pill">{TACTICS[t]?.icon} {TACTICS[t]?.[lang]}</span>
                ))}
              </p>
            </>
          )}
          {over.worked && <p>✅ <b>{x.worked}:</b> {over.worked}</p>}
          {over.tryNext && <p>💡 <b>{x.next}:</b> {over.tryNext}</p>}
          <p className="row" style={{ gap: 8 }}>
            {!limitReached && used + 0 < ARENA_ROUNDS_PER_DAY && (
              <button className="btn" onClick={() => setView("pick")}>{x.again}</button>
            )}
            <button className="btn secondary" onClick={() => setView("hub")}>{x.hub}</button>
          </p>
        </div>
      ) : (
        <div className="chatbar">
          <input
            type="text"
            value={input}
            maxLength={300}
            placeholder={rec ? x.listening : x.placeholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            autoComplete="off"
          />
          <button
            className={`btn ${rec ? "combo" : "secondary"}`}
            onClick={mic}
            aria-label={canVoice ? (lang === "he" ? "מיקרופון" : "Микрофон") : voiceNote}
            title={canVoice ? undefined : voiceNote}
            disabled={busy || !canVoice || vc.active}
            data-voice={canVoice ? "on" : voiceOk ? "parents" : "unsupported"}
          >
            {rec ? "⏹️" : "🎙️"}
          </button>
          <button className="btn" onClick={() => void send()} disabled={busy || !input.trim()}>
            {x.send}
          </button>
        </div>
      )}
      {!over && rec && <p className="listening" role="status">{x.listening}</p>}
      {!over && !rec && hint && <p className="muted" role="status">{hint}</p>}
      {!over && <VoiceTalk vc={vc} lang={lang} unavailable={talkUnavailable} />}
    </>
  );
}
