"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/lib/store";
import { todayKey } from "@/lib/game";
import { Breathe } from "@/components/Breathe";
import {
  CHARGE_COPY,
  CHARGE_XP,
  batteryPct,
  chargeDaysThisWeek,
  idsToday,
  outingCountAll,
  outingCountWhen,
  sortOutings,
  tx,
  type Outing,
} from "@/lib/wellbeing";

function withChargeBadges(log: Record<string, string[]>, badges: string[]): string[] {
  const next = new Set(badges);
  if (outingCountAll(log, "silence-15") >= 5) next.add("quiet_keeper");
  if (outingCountAll(log, "walk-morning") >= 5) next.add("morning_raccoon");
  if (outingCountWhen(log, "evening") >= 5) next.add("night_guard");
  return [...next];
}

export function Charge() {
  const { s, lang, ready, mutate } = useGame();
  const [hour, setHour] = useState(12);
  const list = useMemo(() => sortOutings(hour), [hour]);
  useEffect(() => {
    setHour(new Date().getHours());
  }, []);
  if (!ready) return null;

  if (!s.chargeOn) {
    return (
      <>
        <h1>🔋 {tx(CHARGE_COPY.title, lang)}</h1>
        <div className="card">
          <p>{tx(CHARGE_COPY.off, lang)}</p>
        </div>
      </>
    );
  }

  const day = todayKey();
  const done = idsToday(s.chargeLog, day);
  const pct = batteryPct(done);
  const weekN = chargeDaysThisWeek(s.chargeLog);

  function mark(o: Outing) {
    mutate((p) => {
      const d = todayKey();
      const cur = idsToday(p.chargeLog, d);
      if (cur.includes(o.id)) return p;
      const nextLog = { ...p.chargeLog, [d]: [...cur, o.id] };
      const first = p.chargeXpDay !== d;
      return {
        ...p,
        chargeLog: nextLog,
        chargeXpDay: first ? d : p.chargeXpDay,
        xp: first ? p.xp + CHARGE_XP : p.xp,
        badges: withChargeBadges(nextLog, p.badges),
      };
    });
  }

  function undo(o: Outing) {
    mutate((p) => {
      const d = todayKey();
      const cur = idsToday(p.chargeLog, d);
      if (!cur.includes(o.id)) return p;
      return { ...p, chargeLog: { ...p.chargeLog, [d]: cur.filter((id) => id !== o.id) } };
    });
  }

  return (
    <>
      <h1>🔋 {tx(CHARGE_COPY.title, lang)}</h1>
      <div className="card charge-head" data-battery={pct}>
        <div className="charge-batt" role="img" aria-label={`${tx(CHARGE_COPY.today, lang)} ${pct}%`}>
          <div className="charge-batt-body">
            <span style={{ width: `${pct}%` }} />
          </div>
          <b>{pct}%</b>
        </div>
        <p>
          <b>{tx(CHARGE_COPY.today, lang)}</b>
        </p>
        <p className="muted">
          {tx(CHARGE_COPY.week, lang)}: {weekN} {tx(CHARGE_COPY.of7, lang)}
        </p>
        <p className="muted">{tx(CHARGE_COPY.trust, lang)}</p>
      </div>

      {list.map((o) => {
        const ok = done.includes(o.id);
        return (
          <article key={o.id} className={`card outing${ok ? " good" : ""}`} data-outing={o.id}>
            <h2>
              {o.emoji} {o.title[lang]}
              <span className="muted"> · {o.minutes} {tx(CHARGE_COPY.min, lang)}</span>
            </h2>
            <p>
              <b>{tx(CHARGE_COPY.how, lang)}:</b> {o.how[lang]}
            </p>
            <p className="muted">
              <b>{tx(CHARGE_COPY.why, lang)}:</b> {o.why[lang]}
            </p>
            {ok ? (
              <div className="row outing-actions">
                <span className="pill">{tx(CHARGE_COPY.marked, lang)}</span>
                <button type="button" className="btn secondary" onClick={() => undo(o)} aria-label={tx(CHARGE_COPY.undo, lang)}>
                  {tx(CHARGE_COPY.undo, lang)}
                </button>
              </div>
            ) : (
              <button type="button" className="btn" data-mark={o.id} onClick={() => mark(o)} aria-label={tx(CHARGE_COPY.done, lang)}>
                {tx(CHARGE_COPY.done, lang)}
              </button>
            )}
          </article>
        );
      })}

      <Breathe lang={lang} />
    </>
  );
}
