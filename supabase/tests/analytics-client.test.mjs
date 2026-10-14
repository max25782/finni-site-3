// Клиентский буфер: санитайзер, кольцо 2000, track не бросает, хуки миссии, JSON, sync-заглушка.
const mem = { ls: {}, ss: {} };
globalThis.localStorage = {
  getItem: (k) => mem.ls[k] ?? null,
  setItem: (k, v) => {
    mem.ls[k] = String(v);
  },
  removeItem: (k) => {
    delete mem.ls[k];
  },
};
globalThis.sessionStorage = {
  getItem: (k) => mem.ss[k] ?? null,
  setItem: (k, v) => {
    mem.ss[k] = String(v);
  },
  removeItem: (k) => {
    delete mem.ss[k];
  },
};
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  innerWidth: 1024,
};
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
  });
}

const {
  track,
  readBuffer,
  exportBuffer,
  clearEvents,
  syncEvents,
  configureAnalytics,
  sanitizeProps,
  sanitizeValue,
  replayMissionHooks,
  hookMissionStart,
  hookSceneShown,
  hookSceneDone,
  hookIdleStuck,
  hookHint,
  onTabHidden,
  onTabVisible,
  tickAnalytics,
  setAnalyticsNow,
  advanceAnalyticsNow,
  resetAnalyticsState,
  EVENT_NAMES,
  PROP_KEYS,
  BUF_KEY,
  MAX_EVENTS,
  CODE_RE,
} = await import("../../lib/analytics.ts");

function fail(msg) {
  console.log("НЕ УПАЛО (плохо):", msg);
  process.exitCode = 1;
}

if (PROP_KEYS.includes("message") || PROP_KEYS.includes("content") || PROP_KEYS.includes("text")) fail("PROP_KEYS содержит текст");
if (EVENT_NAMES.includes("returned_next_day")) fail("returned_next_day не должен быть событием");
if (!EVENT_NAMES.includes("reflection_answered") || !EVENT_NAMES.includes("twist_shown")) fail("нет reflection/twist");
if (!EVENT_NAMES.includes("tab_hidden") || !EVENT_NAMES.includes("idle_stuck")) fail("нет tab_hidden/idle_stuck");
if (EVENT_NAMES.includes("recharge_started")) fail("recharge_started не в клиентском списке");

// санитайзер: кириллица, пробелы, длинные строки
if (sanitizeValue("привет") !== null) fail("кириллица не отброшена");
if (sanitizeValue("שלום") !== null) fail("иврит не отброшен");
if (sanitizeValue("whats app") !== null) fail("пробелы не отброшены");
if (sanitizeValue("x".repeat(41)) !== null) fail("длинная строка не отброшена");
if (sanitizeValue("cheaper") !== "cheaper") fail("валидный код отброшен");
if (sanitizeValue(true) !== true) fail("bool");
if (sanitizeValue(4.2) !== 4) fail("число");
const dirty = sanitizeProps({
  reason_id: "нужнее",
  score: 4,
  kind: "whats app",
  message: "привет как дела",
  choice_id: "c0",
});
if (dirty.reason_id != null || dirty.kind != null || dirty.message != null) fail("грязные ключи остались");
if (dirty.score !== 4 || dirty.choice_id !== "c0") fail("чистые props пропали");
if (!CODE_RE.test("c0") || CODE_RE.test("не знаю")) fail("regex");

configureAnalytics({ consent: false, lang: "ru", ageGroup: "unknown" });
clearEvents();
track("session_started");
track("finny_chat_started", { message: "привет как дела" });
track("unknown_event", { lang: "he" });
track("share_clicked", { kind: "whats app" });
track("share_clicked", { kind: "x".repeat(50) });
track("share_clicked", { kind: "whatsapp" });
track("blitz_finished", { score: 4 });
track("reflection_answered", { reason_id: "cheaper", mission_id: "bracelets" });

const buf = readBuffer();
if (!buf.some((e) => e.name === "session_started")) fail("session_started нет");
if (!buf.some((e) => e.name === "finny_chat_started")) fail("finny_chat_started должен писаться без текста");
if (buf.some((e) => e.name === "unknown_event")) fail("неизвестное имя");
if (buf.some((e) => JSON.stringify(e).includes("привет"))) fail("кириллица в буфере");
if (buf.some((e) => e.name === "share_clicked" && e.props.kind === "whatsapp") === false) fail("валидный kind");
if (buf.filter((e) => e.name === "share_clicked").some((e) => typeof e.props.kind === "string" && e.props.kind.includes(" "))) {
  fail("kind с пробелом попал");
}
if (!buf.some((e) => e.name === "blitz_finished" && e.props.score === 4)) fail("blitz score");
if (!buf.some((e) => e.props.age_group === "unknown")) fail("age_group unknown");
if (!buf.every((e) => typeof e.ts === "string" && e.ts.includes("T") && e.session_id && e.app_version)) {
  fail("формат записи: name, props, ts ISO, session_id, app_version");
}

const json = exportBuffer();
try {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length < 1) fail("экспорт не массив");
} catch {
  fail("экспорт не JSON");
}

const sync = await syncEvents();
if (sync.sent !== 0 || sync.reason !== "no_cloud") fail("syncEvents должен быть заглушкой: " + JSON.stringify(sync));

// кольцевой буфер
clearEvents();
for (let i = 0; i < MAX_EVENTS + 17; i++) track("limit_hit", { score: i });
const ring = readBuffer();
if (ring.length > MAX_EVENTS) fail("буфер > 2000: " + ring.length);
if (ring.length !== MAX_EVENTS) fail("буфер должен быть ровно 2000, есть " + ring.length);
if (ring[0].props.score !== 17) fail("кольцо должно отбросить первые записи");

// track не бросает при ошибке localStorage
const realSet = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = () => {
  throw new Error("quota");
};
try {
  track("session_started");
} catch (e) {
  fail("track бросил: " + e);
}
globalThis.localStorage.setItem = realSet;

// хуки одной миссии
clearEvents();
replayMissionHooks("bracelets");
const names = readBuffer().map((e) => e.name);
const expect = [
  "mission_started",
  "scene_shown",
  "scene_completed",
  "scene_skipped_fast",
  "scene_shown",
  "choice_selected",
  "reflection_answered",
  "twist_shown",
  "scene_completed",
  "scene_shown",
  "idle_stuck",
  "hint_used",
  "calculation_answered",
  "scene_completed",
  "scene_shown",
  "debrief_opened",
  "debrief_completed",
  "mission_rating",
  "mission_completed",
];
if (names.join(",") !== expect.join(",")) {
  fail("последовательность хуков:\n  есть: " + names.join(",") + "\n  ждут: " + expect.join(","));
} else console.log("ok хуки миссии");

const dumped = JSON.parse(localStorage.getItem(BUF_KEY));
if (!dumped[0].props.mission_id || dumped.some((e) => e.props.reason_id && e.props.reason_id !== "cheaper")) {
  fail("reason_id / mission_id");
}

clearEvents();
if (readBuffer().length !== 0) fail("clearEvents");

// свёртка 3 мин: нет abandon, hidden вычитается из active_ms
clearEvents();
resetAnalyticsState();
setAnalyticsNow(1_000_000);
configureAnalytics({ consent: false, lang: "ru", ageGroup: "unknown" });
hookMissionStart("bracelets", false);
hookSceneShown("bracelets", "pick", "choice");
onTabHidden();
advanceAnalyticsNow(3 * 60 * 1000);
tickAnalytics();
if (readBuffer().some((e) => e.name === "mission_abandoned")) fail("3 мин скрытия не должны давать abandon");
if (readBuffer().some((e) => e.name === "session_ended")) fail("сворачивание не заканчивает сессию");
onTabVisible();
advanceAnalyticsNow(2000);
hookSceneDone("bracelets", "pick", "choice");
const sc3 = readBuffer().find((e) => e.name === "scene_completed");
if (!sc3) fail("нет scene_completed после 3 мин");
else if (sc3.props.active_ms !== 2000 || sc3.props.duration_ms !== 2000) fail("active_ms после 3 мин: " + sc3.props.active_ms);
else if (sc3.props.hidden_ms !== 180000) fail("hidden_ms 3 мин: " + sc3.props.hidden_ms);
if (!readBuffer().some((e) => e.name === "tab_visible" && e.props.hidden_ms === 180000)) fail("tab_visible hidden_ms");
else console.log("ok скрытие 3 мин без abandon, active_ms без hidden");

// скрыта 11 мин без возврата — abandon
clearEvents();
resetAnalyticsState();
setAnalyticsNow(2_000_000);
hookMissionStart("bracelets", false);
hookSceneShown("bracelets", "pick", "choice");
onTabHidden();
advanceAnalyticsNow(11 * 60 * 1000);
tickAnalytics();
const ab = readBuffer().find((e) => e.name === "mission_abandoned");
if (!ab) fail("11 мин без возврата должны дать mission_abandoned");
else if (ab.props.active_ms !== 0) fail("abandon active_ms должен вычесть hidden: " + ab.props.active_ms);
else if (ab.props.hidden_ms !== 11 * 60 * 1000) fail("abandon hidden_ms: " + ab.props.hidden_ms);
else console.log("ok скрытие 11 мин → mission_abandoned");

// idle_stuck и hint_used раздельно
clearEvents();
resetAnalyticsState();
hookIdleStuck("bracelets", "sum", "calc");
hookHint("bracelets", "sum", "calc", 1);
const split = readBuffer();
if (!split.some((e) => e.name === "idle_stuck" && e.props.scene_id === "sum")) fail("нет idle_stuck");
if (!split.some((e) => e.name === "hint_used" && e.props.attempt === 1)) fail("нет hint_used с attempt");
if (split.some((e) => e.name === "idle_stuck" && e.props.attempt != null)) fail("idle_stuck не должен нести attempt");
if (split.filter((e) => e.name === "hint_used" || e.name === "idle_stuck").length !== 2) fail("idle и hint должны быть двумя событиями");
else console.log("ok idle_stuck и hint_used раздельно");

resetAnalyticsState();
console.log(process.exitCode ? "FAIL client" : "analytics client tests ok");
