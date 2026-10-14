import type { L, Mission } from "./types";

function hasText(x: L | undefined): boolean {
  return Boolean(x && x.ru.trim() && x.he.trim());
}

export function hasChoice(m: Mission): boolean {
  return m.scenes.some((s) => s.kind === "choice");
}

/** Валидатор миссий. Выбор без единственного «правильного» разрешён (open или равный XP). */
export function validateMission(m: Mission): string[] {
  const err: string[] = [];
  if (!m.id || !/^[a-z0-9_-]{2,40}$/.test(m.id)) err.push("bad_id");
  if (!hasText(m.title) || !hasText(m.blurb)) err.push("title");
  if (!m.scenes?.length) err.push("scenes");
  if (hasChoice(m)) {
    if (!hasText(m.reflection)) err.push("reflection");
    if (!hasText(m.twist)) err.push("twist");
  }
  for (const s of m.scenes) {
    if (s.kind !== "choice") continue;
    if (!s.options || s.options.length < 2) err.push(`choice_opts:${s.id}`);
  }
  return err;
}
