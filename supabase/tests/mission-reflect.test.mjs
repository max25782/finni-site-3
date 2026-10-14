import { MISSIONS } from "../../lib/missions/index.ts";
import {
  reflectionSceneIds,
  newReflectionRunState,
  recordReflectionOutcome,
  shouldAskReflection,
} from "../../lib/mission-reflect.ts";

function fail(msg) {
  console.log("НЕ УПАЛО:", msg);
  process.exitCode = 1;
}

const m = MISSIONS[0];
const slots = reflectionSceneIds(m);
if (!Array.isArray(slots) || slots.length === 0 || slots.length > 3) fail("slots length " + slots.length);
else console.log("ok reflectionSceneIds len", slots.length);

let st = newReflectionRunState();
if (!shouldAskReflection(st, slots[0], slots)) fail("should ask first");
st = recordReflectionOutcome(st, "skip");
if (!shouldAskReflection(st, slots[1] ?? slots[0], slots)) fail("should ask after one skip");
st = recordReflectionOutcome(st, "fast");
if (shouldAskReflection(st, slots[2] ?? slots[0], slots)) fail("two skip/fast should suppress");
else console.log("ok suppress after two fast/skip");

console.log(process.exitCode ? "FAIL reflect" : "mission-reflect tests ok");
