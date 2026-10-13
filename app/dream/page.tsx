"use client";

import { useState } from "react";
import { useGame } from "@/lib/store";
import Jobs from "@/components/Jobs";
import { fmt, ledgerBalance, STEPS, toAgorot, weeklyPace } from "@/lib/real";

export default function DreamPage() {
  const { s, lang, t, ready, update, addBadge } = useGame();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const L = (ru: string, he: string) => (lang === "he" ? he : ru);

  if (!ready) return null;

  const hasGoal = s.dreamGoal && s.dreamPrice > 0;
  const priceA = toAgorot(s.dreamPrice);
  const realSaved = Math.max(0, ledgerBalance(s.real));
  const realPct = hasGoal ? Math.min(100, Math.floor((realSaved / priceA) * 100)) : 0;
  const gamePct = hasGoal ? Math.min(100, Math.floor((s.dreamSaved / s.dreamPrice) * 100)) : 0;
  const gameLeft = hasGoal ? Math.max(0, s.dreamPrice - s.dreamSaved) : 0;
  const realLeft = Math.max(0, priceA - realSaved);
  const done = !!hasGoal && realSaved >= priceA;
  const pace = weeklyPace(s.real);
  const weeks = pace > 0 && realLeft > 0 ? Math.ceil(realLeft / pace) : 0;

  function create() {
    const p = Math.round(Number(price));
    const n = name.trim().slice(0, 40);
    if (!n || !Number.isFinite(p) || p < 10 || p > 100000) return;
    update({ dreamGoal: n, dreamPrice: p, dreamSaved: 0 });
    addBadge("goal_hunter");
  }

  function put(amount: number) {
    const a = Math.min(amount, s.balance, gameLeft);
    if (a <= 0) return;
    const saved = s.dreamSaved + a;
    update({ balance: s.balance - a, dreamSaved: saved });
    addBadge("first_piggy");
    if (saved >= s.dreamPrice) addBadge("goal_done");
  }

  return (
    <>
      <h1>🐷 {t("dreamTitle")}</h1>

      {!hasGoal ? (
        <div className="card">
          <label htmlFor="dn">{t("dreamName")}</label>
          <input id="dn" type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <label htmlFor="dp">{L("Сколько она стоит в жизни, ₪", "כמה היא עולה באמת, ₪")}</label>
          <input id="dp" type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          <p style={{ marginTop: 16 }}>
            <button className="btn" onClick={create} disabled={!name.trim() || !price}>
              {t("dreamCreate")}
            </button>
          </p>
        </div>
      ) : (
        <div className={`card ${done ? "good" : ""}`}>
          <h2>
            🎯 {s.dreamGoal} · {s.dreamPrice} ₪
          </h2>

          <p style={{ marginBottom: 4 }}>
            💵 <b>{L("По-настоящему", "באמת")}</b>: {fmt(realSaved)} / {s.dreamPrice} ₪ · <b>{realPct}%</b>
          </p>
          <div className="dreambar">
            <span style={{ width: `${realPct}%` }} />
          </div>
          <div className="row" style={{ gap: 6, margin: "6px 0 12px" }}>
            {STEPS.map((p) => (
              <span key={p} className="pill" style={{ opacity: realPct >= p ? 1 : 0.45 }}>
                {realPct >= p ? "✅" : "▫️"} {p}%
              </span>
            ))}
          </div>

          <p style={{ marginBottom: 4 }}>
            🎮 <b>{L("В игре (виртуальные)", "במשחק (וירטואלי)")}</b>: {s.dreamSaved} / {s.dreamPrice} ₪ · <b>{gamePct}%</b>
          </p>
          <div className="dreambar game">
            <span style={{ width: `${gamePct}%` }} />
          </div>

          {done ? (
            <p style={{ marginTop: 12 }}>
              🏆 {L("Нужная сумма собрана! Обсуди с родителями, как и когда её потратить.", "הסכום הנדרש נאסף! דברי עם ההורים איך ומתי להשתמש בו.")}
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>
              {weeks > 0
                ? L(`При твоём темпе (~${fmt(pace)} в неделю) осталось примерно ${weeks} нед.`, `בקצב שלך (~${fmt(pace)} בשבוע) נשארו בערך ${weeks} שבועות.`)
                : L("Настоящих поступлений пока нет. Возьми заказ ниже, и я посчитаю срок.", "עדיין אין הכנסות אמיתיות. קחי הזמנה למטה ואחשב את הזמן.")}
            </p>
          )}
          {s.dreamPrice >= 1000 && !done && (
            <p className="muted">
              🦝 {L("Большая мечта = план. Разбей её на ступени, прикинь, где взять больше заказов, и подумай, нет ли варианта дешевле (б/у, обмен, ремонт).", "חלום גדול = תוכנית. פצלי אותו לשלבים, חשבי איפה עוד הזמנות, ובדקי אם יש אפשרות זולה יותר (יד שנייה, החלפה, תיקון).")}
            </p>
          )}

          <hr style={{ margin: "14px 0", opacity: 0.2 }} />
          <p className="muted">
            {t("balance")}: {s.balance} ₪ ({L("игровые", "משחק")})
          </p>
          <div className="row">
            {[10, 20, 50].map((n) => (
              <button key={n} className="btn secondary" disabled={s.balance < n || gameLeft <= 0} onClick={() => put(n)}>
                {t("dreamPut")} {n} ₪
              </button>
            ))}
            <button className="btn secondary" disabled={s.balance <= 0 || gameLeft <= 0} onClick={() => put(s.balance)}>
              {L("Всё", "הכול")}
            </button>
          </div>
          {s.balance === 0 && <p className="muted" style={{ marginTop: 10 }}>{t("dreamNoMoney")}</p>}

          <p style={{ marginTop: 16 }}>
            <button className="btn secondary" onClick={() => update({ dreamGoal: "", dreamPrice: 0, dreamSaved: 0 })}>
              {t("dreamReset")}
            </button>
          </p>
        </div>
      )}

      <Jobs />

      <p className="muted" style={{ marginTop: 12 }}>
        {L(
          "Игровые ₪ и опыт (XP) — только в игре. Настоящие деньги записывают родители, когда ты сделала дело. Платит родитель сам, приложение ничего не переводит.",
          "שקלי המשחק ונקודות הניסיון (XP) הם רק במשחק. כסף אמיתי נרשם על ידי ההורים כשסיימת משימה. ההורה משלם בעצמו, האפליקציה לא מעבירה כסף."
        )}
      </p>
      <p className="muted">{t("dreamHint")}</p>
    </>
  );
}
