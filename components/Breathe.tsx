"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/game";
import { CHARGE_COPY, tx } from "@/lib/wellbeing";

const PHASES = ["inhale", "hold", "exhale", "hold"] as const;
const PHASE_SEC = 4;
const CYCLES = 4;
const TOTAL = CYCLES * PHASES.length * PHASE_SEC;

function motionOff(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.getAttribute("data-motion") === "off") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Breathe({ lang }: { lang: Lang }) {
  const [on, setOn] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const t0 = useRef(0);

  useEffect(() => {
    setQuiet(motionOff());
  }, []);

  useEffect(() => {
    if (!on) return;
    t0.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - t0.current) / 1000);
      if (elapsed >= TOTAL) {
        setOn(false);
        setDone(true);
        setStep(0);
        return;
      }
      setStep(elapsed);
    }, quiet ? 250 : 200);
    return () => {
      clearInterval(id);
    };
  }, [on, quiet]);

  function stop() {
    setOn(false);
    setStep(0);
  }

  function start() {
    setDone(false);
    setStep(0);
    setQuiet(motionOff());
    setOn(true);
  }

  const phaseIdx = Math.floor(step / PHASE_SEC) % PHASES.length;
  const cycle = Math.min(CYCLES, Math.floor(step / (PHASES.length * PHASE_SEC)) + 1);
  const left = PHASE_SEC - (step % PHASE_SEC);
  const phase = PHASES[phaseIdx];
  const label = phase === "inhale" ? tx(CHARGE_COPY.inhale, lang) : phase === "exhale" ? tx(CHARGE_COPY.exhale, lang) : tx(CHARGE_COPY.hold, lang);

  return (
    <div className="card breathe">
      <h2>🌬️ {tx(CHARGE_COPY.breatheTitle, lang)}</h2>
      <p className="muted">{tx(CHARGE_COPY.breatheHint, lang)}</p>
      {done && !on ? <p className="breathe-after">{tx(CHARGE_COPY.after, lang)}</p> : null}
      {on ? (
        <div className="breathe-stage" aria-live="polite">
          <div
            className={`breathe-shape ${phase}${quiet ? " still" : ""}`}
            aria-hidden="true"
          />
          <p className="breathe-label">{label}</p>
          <p className="breathe-count">{left}</p>
          <p className="muted">
            {tx(CHARGE_COPY.cycle, lang)} {cycle}/{CYCLES}
          </p>
          <button type="button" className="btn secondary" onClick={stop} aria-label={tx(CHARGE_COPY.stop, lang)}>
            {tx(CHARGE_COPY.stop, lang)}
          </button>
        </div>
      ) : (
        <button type="button" className="btn" onClick={start} aria-label={tx(CHARGE_COPY.start, lang)}>
          {tx(CHARGE_COPY.start, lang)}
        </button>
      )}
    </div>
  );
}
