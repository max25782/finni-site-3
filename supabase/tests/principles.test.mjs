// npx tsx supabase/tests/principles.test.mjs
import { PRINCIPLES } from "../../lib/finni-principles.ts";
import { buildSystemPrompt } from "../../lib/prompt.ts";
import { haggleSystem, debateSystem } from "../../lib/arena-server.ts";
import { MISSIONS, validateMission, draftChoiceMission } from "../../lib/missions/index.ts";

function fail(msg) {
  console.log("НЕ УПАЛО (плохо):", msg);
  process.exitCode = 1;
}

const chat = buildSystemPrompt("ru", 11, false);
const safetyAt = chat.indexOf("БЕЗОПАСНОСТЬ");
const prinAt = chat.indexOf("Принципы Финни");
if (safetyAt < 0) fail("в /api/finni нет блока БЕЗОПАСНОСТЬ");
if (prinAt < 0 || !chat.includes(PRINCIPLES)) fail("в /api/finni нет PRINCIPLES");
if (!(safetyAt < prinAt)) fail("в /api/finni безопасность должна быть раньше PRINCIPLES");
else console.log("ok finni prompt: безопасность раньше PRINCIPLES");

const voice = buildSystemPrompt("he", 8, true);
if (voice.indexOf("БЕЗОПАСНОСТЬ") > voice.indexOf("Принципы Финни")) fail("voice: порядок сломан");
if (!voice.includes(PRINCIPLES)) fail("voice без PRINCIPLES");

const hag = haggleSystem("ru", "bike", 500, 3, false);
const deb = debateSystem("he", "save", 10, 2, false);

if (!hag.includes(PRINCIPLES) || !deb.includes(PRINCIPLES)) fail("арена без PRINCIPLES");
const hagSafe = Math.min(...["не проси личных", "причинить себе вред", "ЭРАН"].map((s) => hag.indexOf(s)).filter((i) => i >= 0));
if (hagSafe < 0 || hagSafe > hag.indexOf("Принципы Финни")) fail("арена: безопасность должна быть раньше PRINCIPLES");
else console.log("ok arena prompt: безопасность раньше PRINCIPLES");

for (const m of MISSIONS) {
  const e = validateMission(m);
  if (e.length) fail(`миссия ${m.id}: ${e.join(",")}`);
}
console.log("ok 14 миссий проходят валидатор");

const broken = draftChoiceMission("broken");
delete broken.reflection;
delete broken.twist;
const be = validateMission(broken);
if (!be.includes("reflection") || !be.includes("twist")) fail("валидатор принял миссию без reflection/twist: " + be);
else console.log("ok валидатор отклоняет миссию без reflection/twist");

const open = draftChoiceMission("open-ok", true);
if (validateMission(open).length) fail("черновик open невалиден");
else console.log("ok генератор: открытый выбор без одного правильного");

let fuzzBad = 0;
for (let i = 0; i < 40; i++) {
  const d = draftChoiceMission(`fuzz${i}`);
  if (i % 2 === 0) {
    if (i % 4 === 0) delete d.reflection;
    else delete d.twist;
    if (!validateMission(d).length) fuzzBad++;
  } else if (validateMission(d).length) fuzzBad++;
}
if (fuzzBad) fail("fuzz провален: " + fuzzBad);
else console.log("ok fuzz: 40 черновиков");

if (MISSIONS.length !== 14) fail("ожидалось 14 миссий, есть " + MISSIONS.length);
console.log(process.exitCode ? "FAIL principles" : "principles tests ok");
