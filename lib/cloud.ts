// Облако семьи: вход, заказы и журнал. Без сессии сайт работает как раньше — localStorage.
import type { GameState } from "./game";
import type { AgeGroup } from "./analytics";
import { DEFAULT_REAL, type Job, type JobEvent, type JobStatus, type LedgerEntry, type RealState, weekKeyOf } from "./real";
import { supabase } from "./supabase";

export type FamilyPrefs = { analyticsOn: boolean; ageGroup: AgeGroup };

let pendingPrefs: FamilyPrefs | null = null;
export function setPendingFamilyPrefs(p: FamilyPrefs) {
  pendingPrefs = p;
}
export function takePendingFamilyPrefs(): FamilyPrefs | null {
  const p = pendingPrefs;
  pendingPrefs = null;
  return p;
}

export type CloudIds = { familyId: string; childId: string; role: "parent" | "child" };

let ids: CloudIds | null = null;
export const cloudIds = () => ids;
export const cloudOnline = () => Boolean(supabase() && ids);

let bootDone = false;
export const cloudBootDone = () => bootDone;
export function markCloudBoot() {
  bootDone = true;
}

function rpcErr(e: { message?: string } | null): string {
  const m = (e?.message ?? "").toLowerCase();
  if (m.includes("locked")) return "locked";
  if (m.includes("bad pin") || m.includes("no pin") || m.includes("pin format")) return "pin";
  if (m.includes("too many")) return "too_many";
  if (m.includes("not found")) return "not_found";
  if (m.includes("title") || m.includes("check")) return "title";
  if (m.includes("price") || m.includes("bad price")) return "price";
  if (m.includes("turn") || m.includes("forbidden") || m.includes("limit") || m.includes("state")) return "bad_state";
  return "bad_state";
}

export type PinStatus = { has_pin: boolean; unlocked_until: string | null; locked_until: string | null };

export async function pinStatus(): Promise<PinStatus | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("pin_status");
  if (error || !data) return null;
  const d = data as PinStatus;
  return { has_pin: !!d.has_pin, unlocked_until: d.unlocked_until ?? null, locked_until: d.locked_until ?? null };
}

export async function pinSetCloud(pin: string, old?: string): Promise<string | null> {
  const { data, error } = await supabase()!.rpc("pin_set", { p_new: pin, p_old: old ?? null });
  if (error) return rpcErr(error);
  const d = data as { ok?: boolean; error?: string } | null;
  if (d && d.ok === false) return d.error === "locked" ? "locked" : "pin";
  return null;
}

export async function pinUnlockCloud(pin: string): Promise<{ until?: string; error?: string }> {
  const { data, error } = await supabase()!.rpc("pin_unlock", { p_pin: pin });
  if (error) return { error: rpcErr(error) };
  const d = data as { ok?: boolean; until?: string; error?: string } | null;
  if (!d || d.ok === false) return { error: d?.error === "locked" ? "locked" : "pin" };
  return { until: d.until ? String(d.until) : undefined };
}

export async function pinLockCloud() {
  await supabase()?.rpc("pin_lock");
}

export async function familyEraseCloud(): Promise<string | null> {
  const { error } = await supabase()!.rpc("family_erase");
  if (!error) ids = null;
  return error ? rpcErr(error) : null;
}

/** Redirect для писем Supabase Auth — только текущий origin (без localhost/env). */
export function authEmailRedirectTo(path = "/parents"): string {
  if (typeof window === "undefined") return "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${p}`;
}

function parentEmailRedirectOptions() {
  return { emailRedirectTo: authEmailRedirectTo("/parents") };
}

export async function cloudSignInWithOtp(email: string): Promise<{ error?: string; needConfirm?: boolean }> {
  const sb = supabase();
  if (!sb) return { error: "not_configured" };
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: parentEmailRedirectOptions(),
  });
  if (error) return { error: error.message };
  return { needConfirm: true };
}

/** Регистрация по magic link: signUp с redirect (пароль не используется — вход только по ссылке). */
export async function cloudSignUp(email: string): Promise<{ error?: string; needConfirm?: boolean }> {
  const sb = supabase();
  if (!sb) return { error: "not_configured" };
  const secret =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `${crypto.randomUUID()}${crypto.randomUUID()}`
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password: secret,
    options: parentEmailRedirectOptions(),
  });
  if (error) return { error: error.message };
  if (!data.session) return { needConfirm: true };
  return {};
}

export async function cloudSignOut() {
  ids = null;
  await supabase()?.auth.signOut();
}

export async function ensureFamily(lang: "ru" | "he", display: string): Promise<CloudIds | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("family_init", { p_lang: lang, p_display: display.slice(0, 40) });
  if (error || !data) return null;
  const d = data as { family_id: string; child_id: string; role: "parent" | "child" };
  ids = { familyId: d.family_id, childId: d.child_id, role: d.role };
  return ids;
}

function evKind(k: string): JobEvent["kind"] {
  return k === "propose" || k === "counter" || k === "accept" || k === "claim" || k === "return" || k === "confirm" || k === "close" ? k : "propose";
}

export async function pullReal(): Promise<RealState | null> {
  const sb = supabase();
  if (!sb || !ids) return null;
  const [jobsR, evR, ledR, stR, bwR] = await Promise.all([
    sb.from("jobs").select("*").eq("child_id", ids.childId).order("created_at", { ascending: false }),
    sb.from("job_events").select("*").order("id", { ascending: true }),
    sb.from("ledger_entries").select("*").eq("child_id", ids.childId).order("created_at", { ascending: true }),
    sb.from("family_settings").select("bridge_rate_agorot, bridge_weekly_cap_agorot, match_pct").eq("family_id", ids.familyId).maybeSingle(),
    sb.from("bridge_weeks").select("*").eq("child_id", ids.childId).eq("week_start", weekKeyOf()),
  ]);
  if (jobsR.error) return null;
  const eventsByJob = new Map<string, JobEvent[]>();
  for (const e of evR.data ?? []) {
    const list = eventsByJob.get(e.job_id) ?? [];
    list.push({
      who: e.actor_role === "parent" ? "parent" : "child",
      kind: evKind(e.kind),
      price: e.price_agorot ?? undefined,
      note: e.note ?? undefined,
      ts: new Date(e.created_at).getTime(),
    });
    eventsByJob.set(e.job_id, list);
  }
  const jobs: Job[] = (jobsR.data ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    doneWhen: j.done_when ?? "",
    price: Number(j.price_agorot),
    turn: j.turn === "parent" ? "parent" : "child",
    status: j.status as JobStatus,
    created: new Date(j.created_at).getTime(),
    events: eventsByJob.get(j.id) ?? [],
  }));
  const ledger: LedgerEntry[] = (ledR.data ?? []).map((e) => ({
    id: String(e.id),
    ts: new Date(e.created_at).getTime(),
    kind: e.kind,
    amount: Number(e.amount_agorot),
    note: e.note ?? "",
    jobId: e.job_id ?? undefined,
  }));
  const st = stR.data;
  const bw = (bwR.data ?? [])[0];
  return {
    ...DEFAULT_REAL,
    rate: Number(st?.bridge_rate_agorot ?? 0),
    weeklyCap: Number(st?.bridge_weekly_cap_agorot ?? 0),
    matchPct: Number(st?.match_pct ?? 0),
    ledger,
    jobs,
    weekKey: weekKeyOf(),
    weekGame: Number(bw?.game_earned ?? 0),
    weekBridged: Number(bw?.bridged_agorot ?? 0),
  };
}

export async function familyPrefsSet(prefs: FamilyPrefs): Promise<boolean> {
  const sb = supabase();
  if (!sb || !ids) return false;
  const { data, error } = await sb.rpc("family_prefs_set", {
    p_analytics_on: prefs.analyticsOn,
    p_age_group: prefs.ageGroup,
  });
  if (error) return false;
  const d = data as { ok?: boolean } | null;
  return d?.ok === true;
}

export async function pullFamilyPrefs(): Promise<FamilyPrefs | null> {
  const sb = supabase();
  if (!sb || !ids) return null;
  const { data, error } = await sb.from("family_settings").select("analytics_on, age_group").eq("family_id", ids.familyId).maybeSingle();
  if (error || !data) return null;
  const ag = data.age_group;
  const ageGroup: AgeGroup = ag === "7-9" || ag === "12-14" || ag === "10-11" ? ag : "10-11";
  return { analyticsOn: data.analytics_on === true, ageGroup };
}

export async function saveSettings(patch: { matchPct?: number; rate?: number; weeklyCap?: number }): Promise<boolean> {
  const sb = supabase();
  if (!sb || !ids) return false;
  const row: Record<string, number> = {};
  if (patch.matchPct !== undefined) row.match_pct = patch.matchPct;
  if (patch.rate !== undefined) row.bridge_rate_agorot = patch.rate;
  if (patch.weeklyCap !== undefined) row.bridge_weekly_cap_agorot = patch.weeklyCap;
  const { error } = await sb.from("family_settings").update(row).eq("family_id", ids.familyId);
  return !error;
}

export async function pushGame(s: GameState): Promise<void> {
  const sb = supabase();
  if (!sb || !ids) return;
  await sb.from("game_state").upsert({
    child_id: ids.childId,
    xp: s.xp,
    game_balance: s.balance,
    badges: s.badges,
    streak: s.streak,
    last_day: s.lastDay || null,
    missions_done: s.missionsDone,
    active_run: s.run,
    idea_streak: s.ideaStreak,
    idea_last_day: s.ideaLastDay || null,
    ideas_seen: s.ideasSeen,
    updated_at: new Date().toISOString(),
  });
  await sb.rpc("bridge_add_game", { p_child: ids.childId });
  await sb.from("child_profiles").update({ lang: s.lang, hero: s.hero }).eq("child_id", ids.childId);
  if (s.dreamGoal && s.dreamPrice > 0) {
    const { data: cur } = await sb.from("dreams").select("id").eq("child_id", ids.childId).eq("active", true).maybeSingle();
    const row = { title: s.dreamGoal.slice(0, 40), price_agorot: Math.round(s.dreamPrice * 100), game_saved: s.dreamSaved, active: true };
    if (cur?.id) await sb.from("dreams").update(row).eq("id", cur.id);
    else await sb.from("dreams").insert({ child_id: ids.childId, ...row });
  }
}

export async function pullGame(): Promise<Partial<GameState> | null> {
  const sb = supabase();
  if (!sb || !ids) return null;
  const { data: gs } = await sb.from("game_state").select("*").eq("child_id", ids.childId).maybeSingle();
  if (!gs) return null;
  const { data: dream } = await sb.from("dreams").select("*").eq("child_id", ids.childId).eq("active", true).maybeSingle();
  const empty = gs.xp === 0 && (gs.missions_done ?? []).length === 0;
  if (empty) return null; // облако пустое — оставляем локальный прогресс и потом зальём его
  return {
    xp: gs.xp,
    balance: gs.game_balance,
    badges: gs.badges ?? [],
    streak: gs.streak ?? 0,
    lastDay: gs.last_day ?? "",
    missionsDone: gs.missions_done ?? [],
    run: gs.active_run ?? null,
    ideaStreak: gs.idea_streak ?? 0,
    ideaLastDay: gs.idea_last_day ?? "",
    ideasSeen: gs.ideas_seen ?? [],
    dreamGoal: dream?.title ?? "",
    dreamPrice: dream ? Math.round(Number(dream.price_agorot) / 100) : 0,
    dreamSaved: dream?.game_saved ?? 0,
  };
}

export async function noteBridgeGame() {
  const sb = supabase();
  if (!sb || !ids) return;
  await sb.rpc("bridge_add_game", { p_child: ids.childId });
}

export async function rpcPropose(title: string, doneWhen: string, agorot: number) {
  const { error } = await supabase()!.rpc("job_propose", { p_title: title, p_done_when: doneWhen, p_price_agorot: agorot });
  return error ? rpcErr(error) : null;
}
export async function rpcParentCreate(title: string, doneWhen: string, agorot: number) {
  if (!ids) return "bad_state";
  const { error } = await supabase()!.rpc("job_create_by_parent", { p_child: ids.childId, p_title: title, p_done_when: doneWhen, p_price_agorot: agorot });
  return error ? rpcErr(error) : null;
}
export async function rpcNegotiate(jobId: string, move: "accept" | "counter" | "decline", agorot?: number) {
  const { error } = await supabase()!.rpc("job_negotiate", { p_job: jobId, p_move: move, p_price_agorot: agorot ?? null });
  return error ? rpcErr(error) : null;
}
export async function rpcClaim(jobId: string) {
  const { error } = await supabase()!.rpc("job_claim", { p_job: jobId });
  return error ? rpcErr(error) : null;
}
export async function rpcConfirm(jobId: string) {
  const { error } = await supabase()!.rpc("job_confirm", { p_job: jobId });
  return error ? rpcErr(error) : null;
}
export async function rpcReturn(jobId: string) {
  const { error } = await supabase()!.rpc("job_return", { p_job: jobId, p_note: null });
  return error ? rpcErr(error) : null;
}
export async function rpcClose(jobId: string) {
  const { error } = await supabase()!.rpc("job_close", { p_job: jobId });
  return error ? rpcErr(error) : null;
}
export async function rpcLedger(kind: "payout" | "adjust", agorot: number, note: string) {
  if (!ids) return "bad_state";
  const { error } = await supabase()!.rpc("ledger_add", { p_child: ids.childId, p_kind: kind, p_amount_agorot: agorot, p_note: note });
  return error ? rpcErr(error) : null;
}
export async function rpcBridge() {
  if (!ids) return "bad_state";
  const { error } = await supabase()!.rpc("bridge_apply", { p_child: ids.childId });
  return error ? rpcErr(error) : null;
}

export function resetCloudIds() {
  ids = null;
}
