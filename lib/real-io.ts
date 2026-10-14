// Заказы и журнал: без входа — localStorage (lib/real), со входом — RPC Supabase.
import {
  addEntry,
  applyBridge,
  childClaim,
  childPropose,
  closeJob,
  negotiate,
  parentConfirm,
  parentCreate,
  parentReturn,
  toAgorot,
  type Move,
  type RealState,
  type Res,
} from "./real";
import {
  cloudOnline,
  pullReal,
  rpcBridge,
  rpcClaim,
  rpcClose,
  rpcConfirm,
  rpcLedger,
  rpcNegotiate,
  rpcParentCreate,
  rpcPropose,
  rpcReturn,
} from "./cloud";

const fail = (e: string): Res => ({ ok: false, error: e });

async function after(err: string | null): Promise<Res> {
  if (err) return fail(err);
  const real = await pullReal();
  return real ? { ok: true, real } : fail("bad_state");
}

export async function ioPropose(r: RealState, title: string, done: string, shekel: number): Promise<Res> {
  const local = childPropose(r, title, done, shekel);
  if (!local.ok || !cloudOnline()) return local;
  return after(await rpcPropose(local.job!.title, local.job!.doneWhen, local.job!.price));
}

export async function ioParentCreate(r: RealState, title: string, done: string, shekel: number): Promise<Res> {
  const local = parentCreate(r, title, done, shekel);
  if (!local.ok || !cloudOnline()) return local;
  return after(await rpcParentCreate(local.job!.title, local.job!.doneWhen, local.job!.price));
}

export async function ioNegotiate(r: RealState, id: string, who: "child" | "parent", m: Move): Promise<Res> {
  const local = negotiate(r, id, who, m);
  if (!local.ok || !cloudOnline()) return local;
  const move = m.t === "accept" ? "accept" : m.t === "decline" ? "decline" : "counter";
  const price = m.t === "counter" ? toAgorot(Math.round(m.shekel)) : undefined;
  return after(await rpcNegotiate(id, move, price));
}

export async function ioClaim(r: RealState, id: string): Promise<Res> {
  const local = childClaim(r, id);
  if (!local.ok || !cloudOnline()) return local;
  return after(await rpcClaim(id));
}

export async function ioConfirm(r: RealState, id: string): Promise<Res> {
  const local = parentConfirm(r, id);
  if (!local.ok || !cloudOnline()) return local;
  return after(await rpcConfirm(id));
}

export async function ioReturn(r: RealState, id: string): Promise<Res> {
  const local = parentReturn(r, id);
  if (!local.ok || !cloudOnline()) return local;
  return after(await rpcReturn(id));
}

export async function ioClose(r: RealState, id: string, who: "child" | "parent"): Promise<Res> {
  const local = closeJob(r, id, who);
  if (!local.ok || !cloudOnline()) return local;
  return after(await rpcClose(id));
}

export async function ioLedger(r: RealState, kind: "payout" | "adjust", shekel: number, note: string): Promise<Res> {
  const local = addEntry(r, kind, shekel, note);
  if (!local.ok || !cloudOnline()) return local;
  const agorot = kind === "payout" ? Math.abs(toAgorot(shekel)) : toAgorot(shekel);
  return after(await rpcLedger(kind, agorot, note));
}

export async function ioBridge(r: RealState): Promise<Res> {
  const local = applyBridge(r);
  if (!local.ok || !cloudOnline()) return local;
  const err = await rpcBridge();
  if (err) return fail(err);
  const real = await pullReal();
  return real ? { ok: true, real } : fail("bad_state");
}
