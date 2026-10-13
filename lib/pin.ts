// PIN родителей. Хранится только хэш (PBKDF2) + соль в localStorage.
// Честное ограничение: это защита от ребёнка, а не от взломщика. Очистка данных браузера сбрасывает PIN.
const K = "finni-parent-pin-v1";
const TTL = 5 * 60 * 1000;

type Stored = { salt: string; hash: string; fails: number; lockUntil: number };

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: 120000, hash: "SHA-256" }, key, 256);
  return b64(bits);
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(K);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function write(s: Stored) {
  try {
    localStorage.setItem(K, JSON.stringify(s));
  } catch {}
}

export const hasPin = () => !!read();

export async function setPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  write({ salt: b64(salt), hash: await derive(pin, salt), fails: 0, lockUntil: 0 });
  unlock();
}

export function lockedForMs(): number {
  const s = read();
  return s ? Math.max(0, s.lockUntil - Date.now()) : 0;
}

export async function checkPin(pin: string): Promise<"ok" | "bad" | "locked"> {
  const s = read();
  if (!s) return "bad";
  if (Date.now() < s.lockUntil) return "locked";
  const salt = Uint8Array.from(atob(s.salt), (c) => c.charCodeAt(0));
  if ((await derive(pin, salt)) === s.hash) {
    write({ ...s, fails: 0, lockUntil: 0 });
    unlock();
    return "ok";
  }
  const fails = s.fails + 1;
  write({ ...s, fails: fails >= 5 ? 0 : fails, lockUntil: fails >= 5 ? Date.now() + 5 * 60 * 1000 : 0 });
  return fails >= 5 ? "locked" : "bad";
}

// Только в памяти: перезагрузка страницы или уход из раздела закрывает доступ.
let unlockedAt = 0;
export function unlock() {
  unlockedAt = Date.now();
}
export function lock() {
  unlockedAt = 0;
}
export function isUnlocked(): boolean {
  return !!unlockedAt && Date.now() - unlockedAt < TTL;
}
export function touch() {
  if (isUnlocked()) unlock();
}
