import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Только origin проекта: без /rest/v1 и без склеенных дублей из буфера. */
export function normalizeSupabaseUrl(raw: string): string | null {
  const t = raw.trim();
  const origin = t.match(/https:\/\/[a-z0-9]+\.supabase\.co/i)?.[0];
  if (origin) return origin;
  const bare = t.replace(/^https?:\/\//i, "").split("/")[0]?.split(".")[0] ?? "";
  if (/^[a-z0-9]{10,30}$/i.test(bare)) return `https://${bare}.supabase.co`;
  return null;
}

export function supabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(url && normalizeSupabaseUrl(url) && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/** Браузерный клиент. На сервере и без ключей — null (сайт остаётся на localStorage). */
export function supabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
