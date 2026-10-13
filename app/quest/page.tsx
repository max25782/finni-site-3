"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { BADGES, dayIndex, todayKey } from "@/lib/game";
import { BOOK_LABEL, QUESTS, Quest, questById, questForDay } from "@/lib/quests";

export default function QuestPage() {
  const { s, lang, t, ready, update, completeQuest } = useGame();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  // Квест дня выбираем один раз и запоминаем, чтобы он не менялся после прохождения.
  useEffect(() => {
    if (!ready) return;
    const today = todayKey();
    if (s.lastQuestDay === today) {
      const q = questById(s.lastQuestId);
      if (q) {
        setQuest(q);
        return;
      }
    }
    const q = questForDay(dayIndex(), s.completed);
    update({ lastQuestDay: today, lastQuestId: q.id });
    setQuest(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready || !quest) return null;

  const qt = quest[lang];
  const book = BOOK_LABEL[quest.book];
  const doneToday = s.lastDay === todayKey();

  function choose(i: number) {
    if (picked !== null || doneToday) return;
    setPicked(i);
    const o = qt.options[i];
    completeQuest(quest!.id, o.xp, o.badge);
  }

  const result = picked !== null ? qt.options[picked] : null;

  return (
    <>
      <h1>🎮 {qt.title}</h1>
      <p className="muted">
        {book.icon} {t("fromBook")}: {book[lang]}
      </p>

      {!doneToday && picked === null && (
        <div className="card">
          <p className="scenario">{qt.scenario}</p>
          <p className="muted">{t("yourMove")}</p>
          <div className="options">
            {qt.options.map((o, i) => (
              <button key={i} className="option" onClick={() => choose(i)}>
                {o.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="card">
            <p>{result.outcome}</p>
            <p>
              <b>💡 {t("lesson")}:</b> {qt.lesson}
            </p>
            <p className="pill">
              ⭐ {t("earned")} +{result.xp + 15} XP, +20 ₪
            </p>
            {result.badge && (
              <p className="pill" style={{ marginInlineStart: 8 }}>
                {BADGES[result.badge]?.icon} {t("newBadge")}: {BADGES[result.badge]?.[lang]}
              </p>
            )}
          </div>
        </>
      )}

      {(doneToday || result) && (
        <>
          <div className="card warn">
            <h2>🌍 {t("offlineMission")}</h2>
            <p>{qt.offline}</p>
            <p className="muted">{t("offlineHint")}</p>
          </div>
          <div className="card good">
            <p>{t("seeYouTomorrow")}</p>
            <Link className="btn secondary" href="/">
              {t("navHome")}
            </Link>
          </div>
        </>
      )}

      <p className="muted">
        🧭 {s.completed.length} / {QUESTS.length}
      </p>
    </>
  );
}
