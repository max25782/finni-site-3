"use client";

import { useId, useMemo } from "react";
import type { Lang } from "@/lib/game";
import type { PanelSpec } from "@/lib/comics";
import { Backdrop, Finni, Gnome, Person, type Bg, type Mood } from "./art";

const MOODS = ["neutral", "happy", "sad", "think", "wow", "sly"];
const SLOTS: Record<number, number[]> = { 1: [118], 2: [105, 255], 3: [66, 180, 294], 4: [50, 140, 230, 320] };

export type Cast = { who: string; mood: Mood; x: number; scale: number };
export function parseCast(s: string): Cast[] {
  const toks = s.trim().split(/\s+/).filter(Boolean);
  const xs = SLOTS[Math.min(4, Math.max(1, toks.length))];
  return toks.map((t, i) => {
    const [who, m] = t.split(":");
    const mood = (MOODS.includes(m) ? m : "neutral") as Mood;
    return { who, mood, x: xs[i] ?? 180, scale: toks.length >= 4 ? 0.85 : who === "gnome" ? 0.82 : 1 };
  });
}
export type Prop = { e: string; x: number; y: number; size: number };
export function parseProps(s?: string): Prop[] {
  if (!s) return [];
  return s.trim().split(/\s+/).filter(Boolean).map((t) => {
    const k = t.lastIndexOf(":");
    const [x, y, size] = t.slice(k + 1).split(",").map(Number);
    return { e: t.slice(0, k), x, y, size: size || 34 };
  });
}

const SFX_GOOD: Record<Lang, string[]> = { ru: ["ДА!", "БУМ!", "ЕСТЬ!", "КЛАСС!"], he: ["כן!", "בום!", "יש!", "וואו!"] };
const SFX_SOFT: Record<Lang, string[]> = { ru: ["ОЙ!", "ХМ…", "УПС!"], he: ["אוי!", "הממ…", "אופס!"] };

export const KNOWN_WHO = ["hero", "finni", "gnome", "girl", "boy", "adi", "noa", "dani", "mom", "dad", "rose", "seller", "scammer", "teen", "neighbor", "teacher", "kid"];

export function Panel({ spec, hero = "girl", result, lang, seed = 0, tall }: { spec: PanelSpec; hero?: "girl" | "boy"; result?: "good" | "soft" | null; lang: Lang; seed?: number; tall?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cast = useMemo(() => parseCast(spec.cast), [spec.cast]);
  const props = useMemo(() => parseProps(spec.props), [spec.props]);
  const say = spec.say;
  const speaker = say ? cast[Math.min(say[2] ?? 0, cast.length - 1)] : null;
  const bx = speaker ? Math.max(32, Math.min(68, (speaker.x / 360) * 100)) : 50;
  const sfx = result ? (result === "good" ? SFX_GOOD[lang] : SFX_SOFT[lang])[Math.abs(seed) % (result === "good" ? 4 : 3)] : null;
  return (
    <div className={`comic ${tall ? "tall" : ""} ${result ? "r-" + result : ""}`}>
      <svg viewBox="0 0 360 220" role="img" aria-hidden preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`${id}h`} width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill="#2b2140" />
          </pattern>
        </defs>
        <Backdrop bg={spec.bg as Bg} id={id} />
        <rect x="0" y="120" width="360" height="100" fill={`url(#${id}h)`} opacity="0.07" />
        {props.map((p, i) => (
          <text key={i} x={p.x} y={p.y} fontSize={p.size} textAnchor="middle" className="cprop" style={{ animationDelay: `${(i % 4) * 0.35}s` }}>
            {p.e}
          </text>
        ))}
        {cast.map((c, i) => {
          const m: Mood = c.who === "hero" && result ? (result === "good" ? "happy" : "sad") : c.who === "finni" && result ? (result === "good" ? "happy" : "think") : c.mood;
          if (c.who === "finni") return <Finni key={i} mood={m} x={c.x} scale={c.scale} />;
          if (c.who === "gnome") return <Gnome key={i} mood={m} x={c.x} scale={c.scale} />;
          const who = c.who === "hero" ? hero : c.who;
          return <Person key={i} who={who} mood={m} x={c.x} scale={c.scale} />;
        })}
      </svg>
      {spec.cap && <div className="ccap">{spec.cap[lang === "he" ? 1 : 0]}</div>}
      {say && !result && (
        <div className={`cbub ${say[3] ?? "say"}`} style={{ left: `${bx}%` }}>
          {say[lang === "he" ? 1 : 0]}
        </div>
      )}
      {sfx && <div className={`csfx ${result}`}>{sfx}</div>}
    </div>
  );
}
