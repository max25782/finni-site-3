"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useGame } from "@/lib/store";
import { saveState, todayKey } from "@/lib/game";
import { CHARGE_COPY, tx } from "@/lib/wellbeing";
import { track } from "@/lib/analytics";

function pastBedtime(bed: string, now = new Date()): boolean {
  if (!bed || !/^\d{2}:\d{2}$/.test(bed)) return false;
  const [h, m] = bed.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

type Hook = { addSec: (n: number) => void; getSec: () => number; clearOk: () => void };

export function PlayGuard() {
  const { s, ready, lang, update } = useGame();
  const sRef = useRef(s);
  sRef.current = s;
  const path = usePathname();
  const [show, setShow] = useState(false);
  const [tick, setTick] = useState(0);
  const secRef = useRef(0);
  const extraRef = useRef(false);
  const flushN = useRef(0);
  const pending = useRef(false);
  const lastIdx = useRef<number | null>(null);
  const okUntil = useRef(0);
  const pathRef = useRef(path);
  const showRef = useRef(false);
  const inited = useRef(false);
  pathRef.current = path;
  showRef.current = show;

  useEffect(() => {
    if (!ready) return;
    const day = todayKey();
    const pt = s.playedToday.day === day ? s.playedToday : { day, sec: 0, extra: false };
    if (!inited.current || pt.sec < secRef.current) {
      secRef.current = pt.sec;
      extraRef.current = !!pt.extra;
      inited.current = true;
    } else if (pt.extra) extraRef.current = true;
  }, [ready, s.playedToday.day, s.playedToday.sec, s.playedToday.extra]);

  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      const day = todayKey();
      const playedToday = { day, sec: secRef.current, extra: extraRef.current };
      saveState({ ...sRef.current, playedToday });
      update({ playedToday });
    };
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (pathRef.current === "/parents") return;
      if (showRef.current) return;
      secRef.current += 1;
      flushN.current += 1;
      if (flushN.current >= 15) {
        flushN.current = 0;
        flush();
      }
      setTick((x) => x + 1);
    }, 1000);
    const hook: Hook = {
      addSec: (n) => {
        secRef.current += n;
        flush();
        setTick((x) => x + 1);
      },
      getSec: () => secRef.current,
      clearOk: () => {
        okUntil.current = 0;
        setTick((x) => x + 1);
      },
    };
    (window as unknown as { __finniPlay?: Hook }).__finniPlay = hook;
    return () => {
      window.clearInterval(id);
      flush();
      delete (window as unknown as { __finniPlay?: Hook }).__finniPlay;
    };
  }, [ready, update]);

  useEffect(() => {
    if (!ready) return;
    const day = todayKey();
    const pt = s.playedToday.day === day ? s.playedToday : { day, sec: 0, extra: false };
    const limit = s.playLimitMin > 0 ? s.playLimitMin * 60 + (pt.extra || extraRef.current ? 300 : 0) : 0;
    const hitLimit = limit > 0 && secRef.current >= limit;
    const hitBed = pastBedtime(s.bedtime);
    const should = hitLimit || hitBed;
    const inScene = path.startsWith("/mission") && !!s.run;
    const idx = s.run?.idx ?? null;

    if (!should || Date.now() < okUntil.current || path === "/parents") {
      if (!should) pending.current = false;
      setShow(false);
      lastIdx.current = idx;
      return;
    }

    if (inScene) {
      if (pending.current && lastIdx.current !== null && idx !== lastIdx.current) {
        setShow(true);
      } else {
        pending.current = true;
        setShow(false);
      }
      lastIdx.current = idx;
      return;
    }

    pending.current = false;
    lastIdx.current = idx;
    if (!showRef.current) track("break_shown");
    setShow(true);
  }, [ready, s.playLimitMin, s.bedtime, s.run, s.playedToday, path, tick]);

  if (!ready || !show) return null;

  const extraUsed = extraRef.current || (s.playedToday.day === todayKey() && s.playedToday.extra);

  function ok() {
    track("break_accepted");
    okUntil.current = Date.now() + 10 * 60 * 1000;
    setShow(false);
  }

  function more() {
    if (extraUsed) return;
    extraRef.current = true;
    const day = todayKey();
    update({ playedToday: { day, sec: secRef.current, extra: true } });
    okUntil.current = Date.now() + 5 * 60 * 1000;
    setShow(false);
  }

  return (
    <div className="playrest" role="dialog" aria-modal="true" aria-label={tx(CHARGE_COPY.restTitle, lang)}>
      <div className="playrest-card">
        <p className="playrest-emoji" aria-hidden="true">🦝💤</p>
        <h2>{tx(CHARGE_COPY.restTitle, lang)}</h2>
        <p className="muted">{tx(CHARGE_COPY.restNote, lang)}</p>
        <button type="button" className="btn playrest-ok" onClick={ok} aria-label={tx(CHARGE_COPY.restOk, lang)}>
          {tx(CHARGE_COPY.restOk, lang)}
        </button>
        {!extraUsed ? (
          <button type="button" className="btn secondary playrest-more" onClick={more} aria-label={tx(CHARGE_COPY.restMore, lang)}>
            {tx(CHARGE_COPY.restMore, lang)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
