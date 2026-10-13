/**
 * Реальные деньги: заказы (дела дома), журнал, мост «игровой ₪ → реальный».
 * Всё — УЧЁТ обещаний родителя. Приложение ничего не переводит: платит родитель сам.
 * Суммы хранятся в агоротах (целые числа), чтобы не было ошибок округления.
 */
import { containsPrivateData } from "./safety";

export type JobStatus = "negotiating" | "agreed" | "claimed" | "paid" | "closed";
export type JobEvent = { who: "child" | "parent"; kind: "propose" | "counter" | "accept" | "claim" | "return" | "confirm" | "close"; price?: number; note?: string; ts: number };
export type Job = {
  id: string;
  title: string;
  doneWhen: string;
  price: number; // агорот, текущая цена «на столе»
  turn: "parent" | "child"; // чей ход в торге
  status: JobStatus;
  created: number;
  events: JobEvent[];
};
export type LedgerKind = "job" | "match" | "bridge" | "payout" | "adjust";
export type LedgerEntry = { id: string; ts: number; kind: LedgerKind; amount: number; note: string; jobId?: string };

export type RealState = {
  rate: number; // агорот реальных за 1 игровой ₪. 0 = выключено
  weeklyCap: number; // агорот в неделю. 0 = мост не работает
  matchPct: number; // надбавка родителя к выплате за дело, %
  ledger: LedgerEntry[];
  jobs: Job[];
  weekKey: string;
  weekGame: number; // игровых ₪, заработанных на этой неделе
  weekBridged: number; // агорот уже зачтено по мосту на этой неделе
};

export const DEFAULT_REAL: RealState = { rate: 0, weeklyCap: 0, matchPct: 0, ledger: [], jobs: [], weekKey: "", weekGame: 0, weekBridged: 0 };

export const LIMITS = { minShekel: 1, maxShekel: 500, maxOpenJobs: 5, maxCounters: 4, titleMax: 60 };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const toAgorot = (shekel: number) => Math.round(shekel * 100);
export function fmt(agorot: number): string {
  const v = agorot / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2)) + " ₪";
}

export function weekKeyOf(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // понедельник = 0
  x.setDate(x.getDate() - dow);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export type Res = { ok: true; real: RealState; job?: Job } | { ok: false; error: string };
const err = (e: string): Res => ({ ok: false, error: e });
const clean = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const open = (j: Job) => j.status === "negotiating" || j.status === "agreed" || j.status === "claimed";
const priceOk = (shekel: number) => Number.isFinite(shekel) && Math.round(shekel) >= LIMITS.minShekel && Math.round(shekel) <= LIMITS.maxShekel;

function patchJob(r: RealState, id: string, f: (j: Job) => Job | null): Res {
  const j = r.jobs.find((x) => x.id === id);
  if (!j) return err("not_found");
  const nj = f(j);
  if (!nj) return err("bad_state");
  return { ok: true, real: { ...r, jobs: r.jobs.map((x) => (x.id === id ? nj : x)) }, job: nj };
}
const ev = (who: JobEvent["who"], kind: JobEvent["kind"], price?: number, note?: string): JobEvent => ({ who, kind, price, note, ts: Date.now() });
const counters = (j: Job) => j.events.filter((e) => e.kind === "counter").length;

/** Ребёнок предлагает заказ и свою цену. */
export function childPropose(r: RealState, title: string, doneWhen: string, shekel: number): Res {
  const t = clean(title, LIMITS.titleMax);
  const d = clean(doneWhen, 120);
  if (t.length < 3) return err("title");
  if (containsPrivateData(t) || containsPrivateData(d)) return err("private");
  if (!priceOk(shekel)) return err("price");
  if (r.jobs.filter(open).length >= LIMITS.maxOpenJobs) return err("too_many");
  const price = toAgorot(Math.round(shekel));
  const job: Job = { id: uid(), title: t, doneWhen: d, price, turn: "parent", status: "negotiating", created: Date.now(), events: [ev("child", "propose", price)] };
  return { ok: true, real: { ...r, jobs: [job, ...r.jobs] }, job };
}

/** Родитель сам предлагает заказ (ход ребёнка). */
export function parentCreate(r: RealState, title: string, doneWhen: string, shekel: number): Res {
  const t = clean(title, LIMITS.titleMax);
  if (t.length < 3) return err("title");
  if (!priceOk(shekel)) return err("price");
  const price = toAgorot(Math.round(shekel));
  const job: Job = { id: uid(), title: t, doneWhen: clean(doneWhen, 120), price, turn: "child", status: "negotiating", created: Date.now(), events: [ev("parent", "propose", price)] };
  return { ok: true, real: { ...r, jobs: [job, ...r.jobs] }, job };
}

export type Move = { t: "accept" } | { t: "counter"; shekel: number } | { t: "decline" };

/** Ход стороны в торге. who — кто ходит; ход принимается только если сейчас его очередь. */
export function negotiate(r: RealState, id: string, who: "child" | "parent", m: Move): Res {
  return patchJob(r, id, (j) => {
    if (j.status !== "negotiating" || j.turn !== who) return null;
    if (m.t === "accept") return { ...j, status: "agreed", events: [...j.events, ev(who, "accept", j.price)] };
    if (m.t === "decline") return { ...j, status: "closed", events: [...j.events, ev(who, "close")] };
    if (!priceOk(m.shekel) || counters(j) >= LIMITS.maxCounters) return null;
    const price = toAgorot(Math.round(m.shekel));
    return { ...j, price, turn: who === "child" ? "parent" : "child", events: [...j.events, ev(who, "counter", price)] };
  });
}

/** Ребёнок: «Сделано!». Только для договорённого заказа. */
export function childClaim(r: RealState, id: string): Res {
  return patchJob(r, id, (j) => (j.status === "agreed" ? { ...j, status: "claimed", events: [...j.events, ev("child", "claim")] } : null));
}

/** Родитель: подтвердить — зачесть в журнал (+ надбавка, если включена). */
export function parentConfirm(r: RealState, id: string): Res {
  const j = r.jobs.find((x) => x.id === id);
  if (!j || j.status !== "claimed") return err("bad_state");
  const now = Date.now();
  const entries: LedgerEntry[] = [{ id: uid(), ts: now, kind: "job", amount: j.price, note: j.title, jobId: j.id }];
  const bonus = Math.round((j.price * r.matchPct) / 100);
  if (r.matchPct > 0 && bonus > 0) entries.push({ id: uid(), ts: now, kind: "match", amount: bonus, note: `+${r.matchPct}% · ${j.title}`, jobId: j.id });
  const nj: Job = { ...j, status: "paid", events: [...j.events, ev("parent", "confirm", j.price)] };
  return { ok: true, real: { ...r, ledger: [...r.ledger, ...entries], jobs: r.jobs.map((x) => (x.id === id ? nj : x)) }, job: nj };
}

export function parentReturn(r: RealState, id: string, note?: string): Res {
  return patchJob(r, id, (j) => (j.status === "claimed" ? { ...j, status: "agreed", events: [...j.events, ev("parent", "return", undefined, note)] } : null));
}
export function closeJob(r: RealState, id: string, who: "child" | "parent"): Res {
  return patchJob(r, id, (j) => (open(j) && j.status !== "claimed" ? { ...j, status: "closed", events: [...j.events, ev(who, "close")] } : null));
}

/* ───── журнал ───── */
export const ledgerBalance = (r: RealState) => r.ledger.reduce((a, e) => a + e.amount, 0);
export const earnedTotal = (r: RealState) => r.ledger.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);

export function addEntry(r: RealState, kind: "payout" | "adjust", shekel: number, note: string): Res {
  if (!Number.isFinite(shekel) || shekel === 0 || Math.abs(shekel) > 100000) return err("price");
  const amount = kind === "payout" ? -Math.abs(toAgorot(shekel)) : toAgorot(shekel);
  return { ok: true, real: { ...r, ledger: [...r.ledger, { id: uid(), ts: Date.now(), kind, amount, note: clean(note, 80) }] } };
}

/** Темп накопления: агорот в неделю по последним 28 дням (только поступления). */
export function weeklyPace(r: RealState, now = Date.now()): number {
  const from = now - 28 * 86400000;
  const sum = r.ledger.filter((e) => e.amount > 0 && e.ts >= from).reduce((a, e) => a + e.amount, 0);
  return Math.round(sum / 4);
}

/* ───── мост: игровые ₪ → реальные (по умолчанию выключен) ───── */
export function addWeekGame(r: RealState, gameShekel: number, now = new Date()): RealState {
  const wk = weekKeyOf(now);
  const base = r.weekKey === wk ? r : { ...r, weekKey: wk, weekGame: 0, weekBridged: 0 };
  return { ...base, weekGame: base.weekGame + Math.max(0, Math.round(gameShekel)) };
}
/** Сколько можно зачесть сейчас (агорот). 0, если мост выключен или лимит не задан. */
export function bridgeable(r: RealState, now = new Date()): number {
  if (r.rate <= 0 || r.weeklyCap <= 0) return 0;
  const cur = r.weekKey === weekKeyOf(now) ? r : { ...r, weekGame: 0, weekBridged: 0 };
  const byRate = Math.floor(cur.weekGame * r.rate) - cur.weekBridged;
  const byCap = r.weeklyCap - cur.weekBridged;
  return Math.max(0, Math.min(byRate, byCap));
}
export function applyBridge(r: RealState, now = new Date()): Res {
  const a = bridgeable(r, now);
  if (a <= 0) return err("nothing");
  const base = r.weekKey === weekKeyOf(now) ? r : { ...r, weekKey: weekKeyOf(now), weekGame: 0, weekBridged: 0 };
  return { ok: true, real: { ...base, weekBridged: base.weekBridged + a, ledger: [...base.ledger, { id: uid(), ts: now.getTime(), kind: "bridge", amount: a, note: `🎮 ${base.weekGame} ₪ × ${fmt(r.rate)}` }] } };
}

/* ───── экспорт ───── */
export function ledgerCsv(r: RealState): string {
  const rows = ["date,kind,amount_ils,note"];
  for (const e of r.ledger) {
    const d = new Date(e.ts);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    rows.push([iso, e.kind, (e.amount / 100).toFixed(2), `"${e.note.replace(/"/g, '""')}"`].join(","));
  }
  rows.push(`,,${(ledgerBalance(r) / 100).toFixed(2)},"balance"`);
  return rows.join("\n");
}

/** Этапы мечты в процентах — для «ступеней». */
export const STEPS = [10, 25, 50, 75, 100];
