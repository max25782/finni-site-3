"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { todayKey } from "@/lib/game";
import { BLITZ, BlitzItem } from "@/lib/blitz";
import { Burst } from "@/components/fx";
import { sfx } from "@/lib/fx";
import { music } from "@/lib/music";
import { track } from "@/lib/analytics";

const MAX_ROUNDS = 3;
const SECONDS = 45;

const tx = {
  ru: { h: "⚡ Блиц 45 секунд", intro: "Быстрые решения: жми левую или правую кнопку. Серия из 5 верных даёт +3 секунды. Ошибки ничего не отнимают: смотри разбор в конце.", go: "Старт!", left: "Раундов сегодня", none: "Три раунда на сегодня сыграны. Мозгу нужна пауза. Завтра будет снова!", score: "Верных", best: "Рекорд", xp: "XP", again: "Ещё раунд", back: "На главную", miss: "Что стоит запомнить", combo: "Серия", rule: "Лимит 3 раунда в день: быстрые игры работают лучше, когда их немного." },
  he: { h: "⚡ בליץ 45 שניות", intro: "החלטות מהירות: לחצו על הכפתור השמאלי או הימני. רצף של 5 נכונות נותן +3 שניות. טעויות לא מורידות כלום: הסבר בסוף.", go: "התחלה!", left: "סיבובים היום", none: "שלושת הסיבובים להיום הושלמו. למוח מגיעה הפסקה. מחר שוב!", score: "נכונות", best: "שיא", xp: "XP", again: "עוד סיבוב", back: "לדף הבית", miss: "מה כדאי לזכור", combo: "רצף", rule: "מגבלה של 3 סיבובים ביום: משחקים מהירים עובדים טוב יותר כשהם מעטים." },
};

function BlitzLimit({ text }: { text: string }) {
  useEffect(() => {
    track("limit_hit");
  }, []);
  return <div className="card warn">{text}</div>;
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export default function BlitzPage() {
  const { s, lang, ready, update, addXp } = useGame();
  const x = tx[lang];
  const [phase, setPhase] = useState<"intro" | "play" | "over">("intro");
  const [deck, setDeck] = useState<BlitzItem[]>([]);
  const [i, setI] = useState(0);
  const [time, setTime] = useState(SECONDS);
  const [ok, setOk] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState<"" | "yes" | "no">("");
  const [why, setWhy] = useState("");
  const [missed, setMissed] = useState<BlitzItem[]>([]);
  const [earned, setEarned] = useState(0);
  const [burst, setBurst] = useState(0);
  const finished = useRef(false);

  const today = todayKey();
  const used = s.blitzDay === today ? s.blitzCount : 0;

  const cur = deck[i % Math.max(1, deck.length)];

  // музыка: пока идёт раунд, она «напряжённая»; на выходе со страницы возвращаем спокойную
  useEffect(() => {
    music.setMood(phase === "play" ? "tense" : "calm");
    return () => {
      music.setMood("calm");
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "play") return;
    const t = setInterval(() => setTime((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "play" && time <= 0 && !finished.current) {
      finished.current = true;
      const xp = Math.min(25, ok * 2);
      setEarned(xp);
      addXp(xp);
      update({ blitzDay: today, blitzCount: used + 1, blitzBest: Math.max(s.blitzBest, ok) });
      sfx("win");
      track("blitz_finished", { score: ok });
      setPhase("over");
    }
  }, [time, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (side: 0 | 1) => {
    if (!cur || flash) return;
    const good = cur.ok === side;
    setWhy(cur.why[lang]);
    if (good) {
      const st = streak + 1;
      setOk((v) => v + 1);
      setStreak(st);
      setFlash("yes");
      if (st % 5 === 0) {
        setTime((v) => v + 3);
        setBurst((b) => b + 1);
        sfx("combo");
      } else sfx("good");
    } else {
      setStreak(0);
      setFlash("no");
      setMissed((m) => (m.includes(cur) ? m : [...m, cur]));
      sfx("soft");
    }
    setTimeout(() => {
      setFlash("");
      setI((v) => v + 1);
    }, good ? 350 : 900);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (phase !== "play") return;
      if (e.key === "ArrowLeft") answer(0);
      if (e.key === "ArrowRight") answer(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const start = () => {
    finished.current = false;
    setDeck(shuffle(BLITZ));
    setI(0);
    setOk(0);
    setStreak(0);
    setMissed([]);
    setFlash("");
    setTime(SECONDS);
    setPhase("play");
    track("blitz_started");
    sfx("tick");
  };

  const pct = useMemo(() => Math.max(0, Math.min(100, (time / (SECONDS + 9)) * 100)), [time]);

  if (!ready) return null;

  if (phase === "intro" || phase === "over") {
    const left = MAX_ROUNDS - used;
    return (
      <>
        {phase === "over" && <Burst emojis={["⚡", "🪙", "⭐", "🎉"]} count={26} />}
        <h1>{x.h}</h1>
        {phase === "intro" && (
          <div className="card hero">
            <p className="scenario">{x.intro}</p>
            <p className="muted">{x.rule}</p>
          </div>
        )}
        {phase === "over" && (
          <div className="card good">
            <p className="headline">
              {x.score}: {ok} · {x.best}: {Math.max(s.blitzBest, ok)}
            </p>
            <span className="xpfly">+{earned} XP</span>
            {missed.length > 0 && (
              <>
                <h3>{x.miss}</h3>
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  {missed.map((m, k) => (
                    <li key={k} style={{ marginBottom: 6 }}>
                      <b>{m.q[lang]}</b>: {m.why[lang]}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <p className="muted">
          {x.left}: {Math.min(MAX_ROUNDS, used)}/{MAX_ROUNDS}
        </p>
        {left > 0 ? (
          <button className="btn" onClick={start}>
            {phase === "over" ? x.again : x.go}
          </button>
        ) : (
          <BlitzLimit text={x.none} />
        )}{" "}
        <Link className="btn secondary" href="/">
          {x.back}
        </Link>
      </>
    );
  }

  return (
    <>
      {burst > 0 && <Burst key={burst} emojis={["⚡", "🔥", "✨"]} count={14} />}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill">⏱️ {Math.max(0, time)}</span>
        <span className="pill">✅ {ok}</span>
        <span className={`pill ${streak >= 3 ? "combo" : ""}`}>🔥 {x.combo} {streak}</span>
      </div>
      <div className="timer" style={{ margin: "8px 0" }}>
        <span style={{ width: `${pct}%`, animation: "none", transform: "none", transition: "width 1s linear" }} />
      </div>
      <div className="stage k-choice" style={{ minHeight: 140 }}>
        <div className="stage-title" style={{ fontSize: 28, marginTop: 14 }}>
          {cur?.q[lang]}
        </div>
        {flash && <div className="finni-say">{flash === "yes" ? "✅" : "💡"} {why}</div>}
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn grow" style={{ fontSize: 22, padding: 22 }} onClick={() => answer(0)}>
          {cur?.l[lang]}
        </button>
        <button className="btn secondary grow" style={{ fontSize: 22, padding: 22 }} onClick={() => answer(1)}>
          {cur?.r[lang]}
        </button>
      </div>
    </>
  );
}
