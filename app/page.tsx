"use client";

import ShareBox from "@/components/ShareBox";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { BADGES, levelFor, todayKey, yesterdayKey } from "@/lib/game";
import LangSwitch from "@/components/LangSwitch";

export default function Home() {
  const { s, lang, t, ready } = useGame();
  if (!ready) return null;

  const lv = levelFor(s.xp);
  const doneToday = s.lastDay === todayKey();
  const streak = s.lastDay === todayKey() || s.lastDay === yesterdayKey() ? s.streak : 0;
  const xpToNext = lv.next ? lv.next.min - s.xp : 0;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill">🦝 {t("appName")}</span>
        <LangSwitch />
      </div>

      <div className="card hero" style={{ marginTop: 12 }}>
        <h1>{s.name ? `${t("hello")}, ${s.name}!` : t("helloAnon")}</h1>
        <p>{t("tagline")}</p>
        <div className="row">
          <span className="pill">
            {lv.cur.icon} {lv.cur[lang]}
          </span>
          <span className="pill">⭐ {s.xp} XP</span>
          <span className="pill">
            🔥 {streak} {t("streak")}
          </span>
        </div>
        <div className="bar" style={{ marginTop: 12 }}>
          <span style={{ width: `${Math.round(lv.progress * 100)}%` }} />
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          {lv.next ? `${t("toNext")}: ${xpToNext} XP` : t("maxLevel")}
        </p>
      </div>

      <div className="card hero">
        <h2>🎯 {t("mainMission")}</h2>
        <p>{t("missionHint")}</p>
        <Link className="btn" href="/mission">
          {s.run ? <span style={{ display: "inline-block", transform: lang === "he" ? "scaleX(-1)" : undefined }}>▶️</span> : "🚀"} {t("goMission")}
        </Link>
      </div>

      <div className={`card ${doneToday ? "good" : ""}`}>
        <h2>🎮 {t("warmup")}: {t("todayQuest")}</h2>
        {doneToday ? (
          <>
            <p>{t("questDone")}</p>
            <p className="muted">{t("seeYouTomorrow")}</p>
            <Link className="btn secondary" href="/quest">
              {t("offlineMission")}
            </Link>
          </>
        ) : (
          <Link className="btn" href="/quest">
            {t("startQuest")}
          </Link>
        )}
      </div>

      <div className="card">
        <h2>💰 {t("balance")}</h2>
        <p style={{ fontSize: 32, fontWeight: 800, margin: "0 0 4px" }}>{s.balance} ₪</p>
        <p className="muted">{t("virtualNote")}</p>
      </div>

      <Link className="card" href="/books" style={{ display: "block", textDecoration: "none", color: "inherit", marginTop: 12 }}>
        <b>💡 {lang === "he" ? "רעיון היום" : "Идея дня"}</b>
        <span className="muted"> · {s.ideaDay === todayKey() && s.ideaDone ? (lang === "he" ? "נקרא ✅" : "готово ✅") : lang === "he" ? "רעיון חדש מחכה" : "ждёт новая идея"}</span>
      </Link>

      <Link className="card hero" href="/blitz" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
        <h2>⚡ {lang === "he" ? "בליץ 45 שניות" : "Блиц 45 секунд"}</h2>
        <p className="muted" style={{ margin: 0 }}>{lang === "he" ? "החלטות מהירות, רצפים ובונוס זמן. 3 סיבובים ביום." : "Быстрые решения, серии и бонус времени. 3 раунда в день."}</p>
      </Link>

      <ShareBox />

      <div className="card">
        <h2>🏅 {t("badges")}</h2>
        {s.badges.length === 0 ? (
          <p className="muted">{t("noBadges")}</p>
        ) : (
          <div className="badges">
            {s.badges.map((b) => (
              <span key={b} className="pill">
                {BADGES[b]?.icon} {BADGES[b]?.[lang] ?? b}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
