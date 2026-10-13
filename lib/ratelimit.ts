// ТОЛЬКО сервер: простые счётчики в памяти (на Vercel отдельно для каждого инстанса, это базовая защита бюджета).
// Для продакшена нужен общий стор (Upstash/Supabase).
import type { NextRequest } from "next/server";

interface Bucket {
  n: number;
  reset: number;
}
const buckets = new Map<string, Bucket>();

export function ipOf(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "") || "unknown";
}

function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}

/** Пытается списать cost из окна. true: можно, счётчик увеличен. false: лимит, ничего не списано. */
export function take(key: string, cap: number, windowMs: number, cost = 1): boolean {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    if (cost > cap) return false;
    buckets.set(key, { n: cost, reset: now + windowMs });
    return true;
  }
  if (b.n + cost > cap) return false;
  b.n += cost;
  return true;
}

/** Возвращает ранее списанное (например, если запрос к провайдеру не удался). */
export function refund(key: string, cost = 1) {
  const b = buckets.get(key);
  if (b) b.n = Math.max(0, b.n - cost);
}
