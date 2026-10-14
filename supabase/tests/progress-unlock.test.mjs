// Родительское открытие миссий и импорт прогресса (без real и аналитики).
import { DEFAULT_STATE, isMissionLocked, normalizeGameSnapshot } from "../../lib/game.ts";
import { MISSIONS } from "../../lib/missions/index.ts";
import {
  PROGRESS_EXPORT_VERSION,
  exportProgressState,
  parseProgressImport,
  mergeProgressImport,
} from "../../lib/progress.ts";
import { DEFAULT_REAL } from "../../lib/real.ts";

const IDS = MISSIONS.map((m) => m.id);

function fail(msg) {
  console.log("НЕ УПАЛО (плохо):", msg);
  process.exitCode = 1;
}

const base = { ...DEFAULT_STATE, xp: 120, badges: ["first_quest"], missionsDone: ["bracelets"], balance: 50 };

// №2 открыта родителем — xp/badges/completed не меняются
const unlocked = { ...base, unlockedUpTo: 2 };
if (unlocked.xp !== 120 || unlocked.badges.length !== 1 || unlocked.missionsDone.length !== 1) {
  fail("unlockedUpTo не должен менять xp/badges/completed");
}
if (isMissionLocked(unlocked, 0, IDS)) fail("миссия 1 должна быть открыта (пройдена)");
if (isMissionLocked(unlocked, 1, IDS)) fail("миссия 2 должна быть открыта родителем");
if (!isMissionLocked(unlocked, 2, IDS)) fail("миссия 3 должна быть закрыта");
else console.log("ok unlock №2 без наград");

const fresh = { ...DEFAULT_STATE, missionsDone: [], unlockedUpTo: 2 };
if (isMissionLocked(fresh, 1, IDS)) fail("миссия 2 открыта только родителем");
const afterReset = { ...fresh, unlockedUpTo: 0 };
if (!isMissionLocked(afterReset, 1, IDS)) fail("после сброса миссия 2 должна быть закрыта");
else console.log("ok сброс unlockedUpTo");

// экспорт без real
const json = exportProgressState(unlocked);
const parsed = JSON.parse(json);
if (parsed.v !== PROGRESS_EXPORT_VERSION) fail("версия экспорта");
if (parsed.state.real !== undefined) fail("real не должен быть в экспорте");
if (parsed.state.xp !== 120) fail("xp в экспорте");

const deviceReal = { ...DEFAULT_REAL, ledger: [{ id: "x", ts: 1, kind: "manual", amount: 100, note: "test" }] };
const imp = parseProgressImport(json, deviceReal);
if (!imp.ok) fail("валидный импорт");
if (imp.state.real.ledger.length !== 1 || imp.state.real.ledger[0].id !== "x") fail("real должен остаться с устройства");
if (imp.state.xp !== 120) fail("xp после импорта");
const merged = mergeProgressImport({ ...DEFAULT_STATE, real: DEFAULT_REAL }, imp.state);
if (merged.real !== DEFAULT_REAL) fail("merge сохраняет real");
else console.log("ok экспорт/импорт без real");

if (parseProgressImport("{", DEFAULT_REAL).ok) fail("битый JSON");
if (parseProgressImport(JSON.stringify({ v: 999, state: { xp: 1, balance: 0, missionsDone: [], badges: [] } }), DEFAULT_REAL).reason !== "version") {
  fail("чужая версия");
}
if (parseProgressImport(JSON.stringify({ v: 1, state: { xp: "no", balance: 0, missionsDone: [], badges: [] } }), DEFAULT_REAL).ok) {
  fail("битая схема");
} else console.log("ok отклонение битого файла и версии");

console.log(process.exitCode ? "FAIL progress-unlock" : "progress-unlock tests ok");
