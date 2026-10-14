// Собственная аналитика Финни: только устройство. Без SDK, cookie и облака.
// Ошибка аналитики никогда не ломает игру.

export const EVENT_NAMES = [
  "session_started",
  "session_ended",
  "tab_hidden",
  "tab_visible",
  "mission_started",
  "scene_shown",
  "scene_completed",
  "scene_skipped_fast",
  "choice_selected",
  "calculation_answered",
  "idle_stuck",
  "hint_used",
  "reflection_answered",
  "reflection_skipped",
  "twist_shown",
  "mission_completed",
  "mission_abandoned",
  "debrief_opened",
  "debrief_completed",
  "mission_rating",
  "next_mission_started",
  "blitz_started",
  "blitz_finished",
  "finny_chat_started",
  "finny_voice_started",
  "limit_hit",
  "break_shown",
  "break_accepted",
  "share_clicked",
  "unlock_by_parent",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export const PROP_KEYS = [
  "mission_id",
  "scene_id",
  "scene_kind",
  "lang",
  "age_group",
  "device_class",
  "app_version",
  "duration_ms",
  "active_ms",
  "hidden_ms",
  "choice_id",
  "correct",
  "attempt",
  "last_scene_id",
  "score",
  "kind",
  "rating",
  "reason_id",
  "mission_index",
] as const;

export const REASON_IDS = ["cheaper", "needed", "try", "unknown"] as const;
export type ReasonId = (typeof REASON_IDS)[number];

export const CODE_RE = /^[a-z0-9_.-]{1,40}$/;
export const BUF_KEY = "finni-events-v1";
export const MAX_EVENTS = 2000;
export const APP_VERSION = "0.1.0";
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const ABANDON_HIDDEN_MS = 10 * 60 * 1000;

export type AgeGroup = "7-9" | "10-11" | "12-14";
export type AgeGroupProp = AgeGroup | "unknown";

export type PropValue = string | number | boolean;

export interface BufEvent {
  name: EventName;
  props: Record<string, PropValue>;
  ts: string;
  session_id: string;
  app_version: string;
}

export interface AnalyticsCtx {
  lang: "ru" | "he";
  ageGroup: AgeGroupProp;
  consent: boolean;
}

interface RunHook {
  id: string;
  sceneId: string;
  started: number;
  hiddenMs: number;
}

const NAMES = new Set<string>(EVENT_NAMES);
const KEYS = new Set<string>(PROP_KEYS);
const SID_KEY = "finni-sid";
const SESS_START = "finni-sess-start";
const SESS_LAST = "finni-sess-last";
const SESS_HID = "finni-sess-hid";

let ctx: AnalyticsCtx = { lang: "he", ageGroup: "unknown", consent: false };
let clock: number | null = null;
let sessionStartedAt = 0;
let lastEventAt = 0;
let sessionHiddenMs = 0;
let hiddenAt: number | null = null;
let sceneStartedAt = 0;
let sceneHiddenMs = 0;
let runHook: RunHook | null = null;
let twistSeen = false;
let hideTimer: number | null = null;

export function configureAnalytics(next: Partial<AnalyticsCtx>) {
  ctx = { ...ctx, ...next };
}

/** Тестовые часы. null — системное время. */
export function setAnalyticsNow(ms: number | null) {
  clock = ms;
}

export function advanceAnalyticsNow(delta: number) {
  clock = now() + Math.max(0, delta);
}

export function resetAnalyticsState() {
  sessionStartedAt = 0;
  lastEventAt = 0;
  sessionHiddenMs = 0;
  hiddenAt = null;
  sceneStartedAt = 0;
  sceneHiddenMs = 0;
  runHook = null;
  twistSeen = false;
  clock = null;
  if (hideTimer != null) {
    try {
      clearTimeout(hideTimer);
    } catch {
      /* */
    }
    hideTimer = null;
  }
  try {
    sessionStorage.removeItem(SESS_START);
    sessionStorage.removeItem(SESS_LAST);
    sessionStorage.removeItem(SESS_HID);
  } catch {
    /* */
  }
}

function now(): number {
  return clock ?? Date.now();
}

function sid(): string {
  try {
    let id = sessionStorage.getItem(SID_KEY);
    if (id && CODE_RE.test(id) && id.length >= 8) return id;
    id = (crypto.randomUUID?.() ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 32);
    if (!CODE_RE.test(id)) id = `s${Date.now().toString(36)}`;
    sessionStorage.setItem(SID_KEY, id);
    return id;
  } catch {
    return "sess_offline";
  }
}

function deviceClass(): "mobile" | "desktop" {
  try {
    if (typeof window === "undefined") return "desktop";
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768 ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
}

function loadBuf(): BufEvent[] {
  try {
    const raw = localStorage.getItem(BUF_KEY);
    if (!raw) return [];
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function saveBuf(rows: BufEvent[]) {
  try {
    localStorage.setItem(BUF_KEY, JSON.stringify(rows.slice(-MAX_EVENTS)));
  } catch {
    /* quota / private */
  }
}

export function sanitizeValue(v: unknown): PropValue | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && CODE_RE.test(v)) return v;
  return null;
}

/** Невалидный ключ или значение выбрасываются вместе. Событие при этом остаётся. */
export function sanitizeProps(raw: Record<string, unknown> | undefined): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (!KEYS.has(k)) continue;
    const s = sanitizeValue(v);
    if (s === null) continue;
    out[k] = s;
  }
  return out;
}

function commonProps(extra?: Record<string, unknown>): Record<string, PropValue> {
  return {
    lang: ctx.lang,
    age_group: ctx.ageGroup,
    device_class: deviceClass(),
    app_version: APP_VERSION,
    ...sanitizeProps(extra),
  };
}

function persistSess() {
  try {
    if (!sessionStartedAt) {
      sessionStorage.removeItem(SESS_START);
      sessionStorage.removeItem(SESS_LAST);
      sessionStorage.removeItem(SESS_HID);
      return;
    }
    sessionStorage.setItem(SESS_START, String(sessionStartedAt));
    sessionStorage.setItem(SESS_LAST, String(lastEventAt));
    sessionStorage.setItem(SESS_HID, String(sessionHiddenMs));
  } catch {
    /* */
  }
}

function restoreSess() {
  try {
    if (sessionStartedAt) return;
    const a = Number(sessionStorage.getItem(SESS_START));
    if (!Number.isFinite(a) || a <= 0) return;
    sessionStartedAt = a;
    lastEventAt = Number(sessionStorage.getItem(SESS_LAST)) || a;
    sessionHiddenMs = Number(sessionStorage.getItem(SESS_HID)) || 0;
  } catch {
    /* */
  }
}

function openHiddenMs(acc: number, at = now()): number {
  return acc + (hiddenAt != null ? Math.max(0, at - hiddenAt) : 0);
}

function activeOf(started: number, hiddenAcc: number, at = now()): number {
  return Math.max(0, at - started - openHiddenMs(hiddenAcc, at));
}

function writeEvent(name: EventName, props?: Record<string, unknown>) {
  const row: BufEvent = {
    name,
    props: commonProps(props),
    ts: new Date(now()).toISOString(),
    session_id: sid(),
    app_version: APP_VERSION,
  };
  const buf = loadBuf();
  buf.push(row);
  saveBuf(buf.length > MAX_EVENTS ? buf.slice(-MAX_EVENTS) : buf);
  lastEventAt = now();
  persistSess();
}

function rotateSessionIfIdle() {
  if (!sessionStartedAt || !lastEventAt) return;
  if (now() - lastEventAt < SESSION_IDLE_MS) return;
  endSessionInternal();
  beginSessionInternal();
}

function beginSessionInternal() {
  sessionStartedAt = now();
  sessionHiddenMs = 0;
  writeEvent("session_started");
}

function endSessionInternal() {
  if (!sessionStartedAt) return;
  const at = now();
  const hidden_ms = openHiddenMs(sessionHiddenMs, at);
  const active_ms = activeOf(sessionStartedAt, sessionHiddenMs, at);
  sessionStartedAt = 0;
  sessionHiddenMs = 0;
  writeEvent("session_ended", { duration_ms: active_ms, active_ms, hidden_ms });
}

export function track(name: string, props?: Record<string, unknown>) {
  try {
    if (!NAMES.has(name)) return;
    if (name !== "session_started" && name !== "session_ended") rotateSessionIfIdle();
    writeEvent(name as EventName, props);
  } catch {
    /* never break the game */
  }
}

export function exportBuffer(): string {
  try {
    return JSON.stringify(loadBuf(), null, 2);
  } catch {
    return "[]";
  }
}

export function readBuffer(): BufEvent[] {
  return loadBuf();
}

export function clearEvents() {
  try {
    localStorage.removeItem(BUF_KEY);
  } catch {
    /* */
  }
}

export function downloadAnalyticsJson() {
  try {
    const blob = new Blob([exportBuffer()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "finni-events.json";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    /* */
  }
}

/** Позже: отправка после регистрации родителя и согласия. Сейчас облака нет. */
export async function syncEvents(): Promise<{ sent: number; reason: "no_cloud" }> {
  try {
    return { sent: 0, reason: "no_cloud" };
  } catch {
    return { sent: 0, reason: "no_cloud" };
  }
}

export function startAnalyticsSession() {
  try {
    restoreSess();
    if (sessionStartedAt && lastEventAt && now() - lastEventAt < SESSION_IDLE_MS) return;
    if (sessionStartedAt) endSessionInternal();
    beginSessionInternal();
  } catch {
    /* */
  }
}

export function endAnalyticsSession() {
  try {
    restoreSess();
    endSessionInternal();
    void syncEvents();
  } catch {
    /* */
  }
}

export function setRunHook(h: RunHook | null) {
  runHook = h;
}

export function currentRunHook() {
  return runHook;
}

export function abandonIfOpen() {
  try {
    const r = runHook;
    if (!r) return;
    const at = now();
    const hidden_ms = openHiddenMs(r.hiddenMs, at);
    const active_ms = activeOf(r.started, r.hiddenMs, at);
    writeEvent("mission_abandoned", {
      mission_id: r.id,
      last_scene_id: r.sceneId,
      duration_ms: active_ms,
      active_ms,
      hidden_ms,
    });
    runHook = null;
  } catch {
    /* */
  }
}

function clearHideTimer() {
  if (hideTimer == null) return;
  try {
    clearTimeout(hideTimer);
  } catch {
    /* */
  }
  hideTimer = null;
}

/** Если вкладка всё ещё скрыта ≥ 10 мин — abandon. Вызывать из таймера и из тестов. */
export function tickAnalytics() {
  try {
    if (hiddenAt == null) return;
    if (now() - hiddenAt < ABANDON_HIDDEN_MS) return;
    abandonIfOpen();
  } catch {
    /* */
  }
}

export function onTabHidden() {
  try {
    if (hiddenAt != null) return;
    hiddenAt = now();
    writeEvent("tab_hidden");
    clearHideTimer();
    if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      hideTimer = window.setTimeout(() => tickAnalytics(), ABANDON_HIDDEN_MS) as unknown as number;
    }
  } catch {
    /* */
  }
}

export function onTabVisible() {
  try {
    if (hiddenAt == null) return;
    const hidden_ms = Math.max(0, now() - hiddenAt);
    sessionHiddenMs += hidden_ms;
    if (runHook) runHook.hiddenMs += hidden_ms;
    sceneHiddenMs += hidden_ms;
    hiddenAt = null;
    clearHideTimer();
    rotateSessionIfIdle();
    writeEvent("tab_visible", { hidden_ms });
  } catch {
    /* */
  }
}

/** Закрытие вкладки. persisted (bfcache) = сворачивание, не уход. */
export function onPageHide(persisted = false) {
  try {
    if (persisted) {
      onTabHidden();
      return;
    }
    abandonIfOpen();
    persistSess();
  } catch {
    /* */
  }
}

// --- хуки движка: один вызов на действие, миссии не дублируют track() ---

export function hookMissionStart(missionId: string, isNext: boolean) {
  try {
    if (runHook && runHook.id === missionId && now() - runHook.started < 2000) return;
    twistSeen = false;
    sceneStartedAt = 0;
    sceneHiddenMs = 0;
    if (isNext) writeEvent("next_mission_started", { mission_id: missionId });
    writeEvent("mission_started", { mission_id: missionId });
    setRunHook({ id: missionId, sceneId: "start", started: now(), hiddenMs: 0 });
  } catch {
    /* */
  }
}

export function hookSceneShown(missionId: string, sceneId: string, sceneKind: string) {
  try {
    writeEvent("scene_shown", { mission_id: missionId, scene_id: sceneId, scene_kind: sceneKind });
    sceneStartedAt = now();
    sceneHiddenMs = 0;
    const hook = currentRunHook();
    setRunHook({
      id: missionId,
      sceneId,
      started: hook?.started ?? now(),
      hiddenMs: hook?.hiddenMs ?? 0,
    });
    if (sceneKind === "end") writeEvent("debrief_opened", { mission_id: missionId });
  } catch {
    /* */
  }
}

export function hookSceneDone(missionId: string, sceneId: string, sceneKind: string, _wallMs?: number) {
  try {
    const at = now();
    const started = sceneStartedAt || at;
    const hidden_ms = openHiddenMs(sceneHiddenMs, at);
    const active_ms = Math.max(0, at - started - hidden_ms);
    sceneStartedAt = 0;
    sceneHiddenMs = 0;
    writeEvent("scene_completed", {
      mission_id: missionId,
      scene_id: sceneId,
      scene_kind: sceneKind,
      duration_ms: active_ms,
      active_ms,
      hidden_ms,
    });
    if (active_ms < 2000) {
      writeEvent("scene_skipped_fast", {
        mission_id: missionId,
        scene_id: sceneId,
        scene_kind: sceneKind,
        duration_ms: active_ms,
        active_ms,
        hidden_ms,
      });
    }
  } catch {
    /* */
  }
}

export function hookChoice(missionId: string, sceneId: string, choiceId: string) {
  track("choice_selected", { mission_id: missionId, scene_id: sceneId, scene_kind: "choice", choice_id: choiceId });
}

export function hookCalc(missionId: string, sceneId: string, correct: boolean, attempt: number) {
  track("calculation_answered", {
    mission_id: missionId,
    scene_id: sceneId,
    scene_kind: "calc",
    correct,
    attempt,
  });
}

export function hookIdleStuck(missionId: string, sceneId: string, sceneKind: string) {
  track("idle_stuck", { mission_id: missionId, scene_id: sceneId, scene_kind: sceneKind });
}

export function hookHint(missionId: string, sceneId: string, sceneKind: string, attempt: number) {
  track("hint_used", { mission_id: missionId, scene_id: sceneId, scene_kind: sceneKind, attempt });
}

export function hookReflection(missionId: string, reasonId: ReasonId | null) {
  if (reasonId && REASON_IDS.includes(reasonId)) {
    track("reflection_answered", { mission_id: missionId, reason_id: reasonId });
    return;
  }
  track("reflection_skipped", { mission_id: missionId });
}

export function hookTwistShown(missionId: string) {
  try {
    if (twistSeen) return;
    twistSeen = true;
    track("twist_shown", { mission_id: missionId });
  } catch {
    /* */
  }
}

export function hookDebriefDone(missionId: string) {
  track("debrief_completed", { mission_id: missionId });
}

export function hookMissionDone(missionId: string) {
  try {
    const hook = currentRunHook();
    const at = now();
    const hidden_ms = hook ? openHiddenMs(hook.hiddenMs, at) : 0;
    const active_ms = hook ? activeOf(hook.started, hook.hiddenMs, at) : 0;
    writeEvent("mission_completed", { mission_id: missionId, duration_ms: active_ms, active_ms, hidden_ms });
    setRunHook(null);
  } catch {
    /* */
  }
}

export function hookRating(missionId: string, rating: 1 | 2 | 3) {
  track("mission_rating", { mission_id: missionId, rating });
}

/** Прогон хуков одной миссии — для теста последовательности. */
export function replayMissionHooks(missionId: string) {
  hookMissionStart(missionId, false);
  hookSceneShown(missionId, "intro", "story");
  advanceAnalyticsNow(800);
  hookSceneDone(missionId, "intro", "story");
  hookSceneShown(missionId, "pick", "choice");
  hookChoice(missionId, "pick", "c0");
  hookReflection(missionId, "cheaper");
  hookTwistShown(missionId);
  advanceAnalyticsNow(4500);
  hookSceneDone(missionId, "pick", "choice");
  hookSceneShown(missionId, "sum", "calc");
  hookIdleStuck(missionId, "sum", "calc");
  hookHint(missionId, "sum", "calc", 2);
  hookCalc(missionId, "sum", true, 2);
  advanceAnalyticsNow(9000);
  hookSceneDone(missionId, "sum", "calc");
  hookSceneShown(missionId, "end", "end");
  hookDebriefDone(missionId);
  hookRating(missionId, 2);
  hookMissionDone(missionId);
}
