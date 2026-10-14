import { ChoiceOption, ChoiceScene, Insight, L, Scene, StoryScene, T, V } from "./types";

export const story = (
  id: string,
  icon: string,
  title: L,
  text: T,
  xp = 3,
  apply?: (v: V) => Partial<V>,
  skipIf?: (v: V) => boolean
): StoryScene => ({ id, kind: "story", icon, title, text, xp, apply, skipIf });

export const opt = (
  label: T,
  xp: number,
  outcome: L,
  vars?: (v: V) => Partial<V>,
  extra: { disabled?: (v: V) => boolean; badge?: string } = {}
): ChoiceOption => ({
  label,
  disabled: extra.disabled,
  apply: (v) => ({ vars: vars?.(v), outcome, xp, badge: extra.badge }),
});

export const choice = (
  id: string,
  icon: string,
  title: L,
  text: T,
  ins: Insight,
  options: ChoiceOption[],
  skipIf?: (v: V) => boolean,
  extra?: { open?: boolean; reflect?: boolean }
): ChoiceScene => ({ id, kind: "choice", icon, title, text, ...ins, options, skipIf, open: extra?.open, reflect: extra?.reflect });

export const offline = (title: L, text: L, xp = 5): Scene => ({ id: "offline", kind: "offline", title, text, xp });
export const end: Scene = { id: "end", kind: "end" };
export const stars = (n: number) => "⭐".repeat(Math.max(0, Math.min(5, n)));
export const rd = Math.round;
export const fl = Math.floor;

/** Добавить «крючок» (интригу к следующему шагу) и/или заголовок главы. */
export const H = <S extends Scene>(s: S, hook?: L, chapter?: L): S => ({ ...s, ...(hook ? { hook } : {}), ...(chapter ? { chapter } : {}) });
