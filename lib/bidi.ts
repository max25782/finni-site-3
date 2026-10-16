import { createElement, type ReactNode } from "react";
import type { Lang } from "./game";

export const MATH_DIR = "ltr" as const;

const LRI = "\u2066";
const PDI = "\u2069";

const OP = "[÷×+\\-−=*/%]";
const NUM = "[+\\-−]?\\d+(?:[.,]\\d+)?";
const H_PREFIX = "[מל]-";
const MATH_RE = new RegExp(
  `(?:${H_PREFIX})?${NUM}(?:\\s*${OP}\\s*(?:${H_PREFIX})?${NUM})*(?:\\s*%)?(?:\\s*₪)?|${NUM}\\s*₪`,
  "g"
);

export function ltr(str: string): string {
  return `${LRI}${str}${PDI}`;
}

function peelTrail(fragment: string): { body: string; trail: string } {
  const m = fragment.match(/^(.+?)([.,):;]+)$/);
  if (!m) return { body: fragment, trail: "" };
  const body = m[1];
  const trail = m[2];
  if (/\d[.,]\d$/.test(body)) return { body: fragment, trail: "" };
  return { body, trail };
}

export function isolateMath(text: string, lang: Lang): string {
  if (lang !== "he" || !text) return text;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(MATH_RE)) {
    const start = m.index ?? 0;
    out += text.slice(last, start);
    const { body, trail } = peelTrail(m[0]);
    if (body) out += ltr(body);
    out += trail;
    last = start + m[0].length;
  }
  out += text.slice(last);
  return out;
}

export function Ltr({ children }: { children: ReactNode }) {
  return createElement("bdi", { dir: MATH_DIR }, children);
}
