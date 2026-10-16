import { MISSIONS } from "../../lib/missions/index.ts";
import { tx } from "../../lib/missions/types.ts";
import { IDLE, CALC_LADDER, FAST, SAME, SOFT2 } from "../../lib/nudges.ts";
import { D, tr } from "../../lib/i18n.ts";
import { BLITZ } from "../../lib/blitz.ts";

const CYR = /[\u0400-\u04FF]/;

function fail(msg) {
  console.log("НЕ УПАЛО:", msg);
  process.exitCode = 1;
}

function checkHe(label, text) {
  if (CYR.test(text)) fail(`${label}: кириллица в he → ${text.slice(0, 80)}`);
}

for (const m of MISSIONS) {
  const v = m.initialVars;
  for (const sc of m.scenes) {
    if ("text" in sc && sc.text) checkHe(`${m.id}/${sc.id}/text`, tx(sc.text, v, "he"));
    if (sc.kind === "calc") {
      checkHe(`${m.id}/${sc.id}/ok`, tx(sc.ok, v, "he"));
      checkHe(`${m.id}/${sc.id}/bad`, tx(sc.bad, v, "he"));
    }
    if (sc.kind === "choice") {
      for (const o of sc.options) checkHe(`${m.id}/${sc.id}/opt`, tx(o.label, v, "he"));
    }
    if (sc.kind === "find") {
      for (const it of sc.items) {
        checkHe(`${m.id}/${sc.id}/find`, tx(it.text, v, "he"));
        checkHe(`${m.id}/${sc.id}/why`, it.why.he);
      }
    }
  }
  if (m.reflection) checkHe(`${m.id}/reflection`, m.reflection.he);
  if (m.twist) checkHe(`${m.id}/twist`, m.twist.he);
}

for (const pool of [IDLE.money, IDLE.people, IDLE.mind, IDLE.default, FAST, SAME, SOFT2, ...CALC_LADDER]) {
  for (const s of pool.he) checkHe("nudge", s);
}

for (const key of Object.keys(D)) checkHe(`i18n.${key}`, tr(key, "he"));

for (const b of BLITZ) {
  checkHe("blitz q", b.q.he);
  checkHe("blitz why", b.why.he);
}

console.log(process.exitCode ? "FAIL he-cyrillic" : "he-no-cyrillic tests ok");
