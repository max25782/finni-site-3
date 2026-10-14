import type { ChoiceScene, Mission } from "./missions/types";

const MAX_REFLECTIONS = 3;

/** Сцены, после которых можно спросить «почему» (макс. 3 за миссию). */
export function reflectionSceneIds(mission: Mission): string[] {
  const choices = mission.scenes.filter((s): s is ChoiceScene => s.kind === "choice");
  const marked = choices.filter((s) => s.reflect === true);
  if (marked.length > 0) return marked.slice(0, MAX_REFLECTIONS).map((s) => s.id);
  if (choices.length === 0) return [];
  if (choices.length <= MAX_REFLECTIONS) return choices.map((s) => s.id);
  const mid = choices[Math.floor(choices.length / 2)];
  return [choices[0].id, mid.id, choices[choices.length - 1].id];
}

export interface ReflectionRunState {
  shown: number;
  suppress: boolean;
  /** последние исходы: ответ, пропуск или быстрый выбор (<3 с). */
  tail: ("ans" | "skip" | "fast")[];
}

export function newReflectionRunState(): ReflectionRunState {
  return { shown: 0, suppress: false, tail: [] };
}

export function shouldAskReflection(state: ReflectionRunState, sceneId: string, allowed: string[]): boolean {
  if (state.suppress || state.shown >= MAX_REFLECTIONS) return false;
  return allowed.includes(sceneId);
}

export function recordReflectionOutcome(state: ReflectionRunState, kind: "ans" | "skip" | "fast"): ReflectionRunState {
  const tail = [...state.tail, kind].slice(-2);
  const suppress = tail.length === 2 && tail.every((x) => x === "skip" || x === "fast");
  return { shown: state.shown + 1, suppress, tail };
}
