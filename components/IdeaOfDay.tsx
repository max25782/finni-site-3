"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { todayKey, yesterdayKey } from "@/lib/game";
import { BOOKS, IDEAS, IDEA_COUNT } from "@/lib/ideas";

export default function IdeaOfDay() {
  const { s, lang, ready, mutate, addBadge } = useGame();
  const [picked, setPicked] = useState<number | null>(null);
  const L = (ru: string, he: string) => (lang === "he" ? he : ru);
  const today = todayKey();

  useEffect(() => {
    if (!ready || s.ideaDay === today) return;
    mutate((p) => {
      if (p.ideaDay === today) return p;
      const seen = p.ideasSeen.length >= IDEA_COUNT ? [] : p.ideasSeen;
      const next = IDEAS.find((i) => !seen.includes(i.id)) ?? IDEAS[0];
      return { ...p, ideasSeen: seen, ideaDay: today, ideaId: next.id, ideaDone: false, ideaDid: false };
    });
  }, [ready, s.ideaDay, today, mutate]);

  if (!ready || s.ideaDay !== today) return null;
  const idea = IDEAS.find((i) => i.id === s.ideaId);
  if (!idea) return null;
  const x = idea[lang];
  const book = BOOKS[idea.book];

  const answer = (n: number) => {
    if (s.ideaDone) return;
    setPicked(n);
    mutate((p) => {
      if (p.ideaDone) return p;
      const streak = p.ideaLastDay === yesterdayKey() ? p.ideaStreak + 1 : p.ideaLastDay === today ? p.ideaStreak : 1;
      return { ...p, xp: p.xp + 10, ideaDone: true, ideaStreak: streak, ideaLastDay: today, ideasSeen: p.ideasSeen.includes(idea.id) ? p.ideasSeen : [...p.ideasSeen, idea.id] };
    });
    if (s.ideaStreak + (s.ideaLastDay === yesterdayKey() ? 1 : 0) >= 7) addBadge("idea_week");
  };
  const did = () => {
    mutate((p) => (p.ideaDid ? p : { ...p, xp: p.xp + 5, ideaDid: true }));
  };
  const chosen = s.ideaDone ? picked : null;

  return (
    <div className="card hero" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill">💡 {L("Идея дня", "רעיון היום")}</span>
        <span className="pill">
          {book.ico} {book[lang]}
        </span>
      </div>
      <h2 style={{ marginTop: 10 }}>{x.t}</h2>
      <p>{x.i}</p>
      <p>
        <b>🎮 {x.q}</b>
      </p>
      <div className="options">
        {x.o.map((o, n) => {
          const answered = s.ideaDone;
          const isOk = n === x.ok;
          return (
            <button key={n} className={`btn secondary option`} disabled={answered} onClick={() => answer(n)} style={answered && isOk ? { outline: "3px solid var(--good)" } : undefined}>
              {answered && isOk ? "✅ " : ""}
              {o}
            </button>
          );
        })}
      </div>
      {s.ideaDone && (
        <>
          <p style={{ marginTop: 10 }}>
            {chosen === x.ok || chosen === null ? "🎯 " : "💡 "}
            {x.w}
          </p>
          <p>
            <b>👉 {L("Сделай сегодня", "עשי היום")}:</b> {x.d}
          </p>
          <div className="row">
            <button className="btn" disabled={s.ideaDid} onClick={did}>
              {s.ideaDid ? L("Сделано ✅ (+5 XP)", "בוצע ✅ (+5 XP)") : L("Я сделала! +5 XP", "עשיתי! +5 XP")}
            </button>
            <span className="pill">+10 XP</span>
            <span className="pill">🔥 {s.ideaStreak} {L("дн. подряд", "ימים ברצף")}</span>
          </div>
          <p className="muted">{L("Завтра будет новая идея.", "מחר יהיה רעיון חדש.")}</p>
        </>
      )}
    </div>
  );
}
