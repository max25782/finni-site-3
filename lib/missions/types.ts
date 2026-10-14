import type { Lang } from "../game";

export type L = { ru: string; he: string };
export const L = (ru: string, he: string): L => ({ ru, he });

/** Переменные миссии: деньги, склад, репутация и т.д. Всё числа, чтобы легко сохранять. */
export type V = Record<string, number>;

/** Текст: либо фиксированный, либо зависит от переменных. */
export type T = L | ((v: V) => L);
export const tx = (t: T, v: V, lang: Lang): string => (typeof t === "function" ? t(v)[lang] : t[lang]);

type Base = { id: string; skipIf?: (v: V) => boolean; hook?: T; chapter?: L };

export type StoryScene = Base & {
  kind: "story";
  icon?: string;
  title?: L;
  text: T;
  xp?: number;
  apply?: (v: V) => Partial<V>; // применяется при нажатии «Дальше»
};

export type ChoiceOption = {
  label: T;
  disabled?: (v: V) => boolean;
  apply: (v: V) => { vars?: Partial<V>; outcome: L; xp: number; badge?: string };
};

/** Метки для итогового разбора: из какой книги идея и о чём урок. */
export type Insight = { book?: string; topic?: "money" | "people" | "mind"; lesson?: L };

export type ChoiceScene = Base & Insight & {
  kind: "choice";
  icon?: string;
  title?: L;
  text: T;
  options: ChoiceOption[];
  /** Несколько разумных вариантов, без одного «правильного». */
  open?: boolean;
};

export type CalcScene = Base & Insight & {
  kind: "calc";
  icon?: string;
  title?: L;
  text: T;
  answer: (v: V) => number;
  ok: T;
  bad: T;
  xp: number;
  apply?: (v: V) => Partial<V>;
};

export type InputScene = Base & Insight & {
  kind: "input";
  icon?: string;
  title?: L;
  text: T;
  unit?: string;
  min: (v: V) => number;
  max: (v: V) => number;
  initial: (v: V) => number;
  apply: (n: number, v: V) => { vars: Partial<V>; outcome: L };
  xp: number;
};

/** Найди подозрительное: отметь всё, что вызывает сомнения. */
export type FindItem = { text: T; bad: boolean; why: L };
export type FindScene = Base & Insight & {
  kind: "find";
  icon?: string;
  title?: L;
  text: T;
  items: FindItem[];
  xp: number;
  apply?: (r: { hits: number; misses: number; false: number }, v: V) => Partial<V>;
};

/** Раздели сумму между статьями. */
export type SplitPart = { label: T; min?: number; max?: (v: V) => number };
export type SplitScene = Base & Insight & {
  kind: "split";
  icon?: string;
  title?: L;
  text: T;
  total: (v: V) => number;
  step: number;
  parts: SplitPart[];
  xp: number;
  unit?: string;
  apply: (a: number[], v: V) => { vars: Partial<V>; outcome: L };
};

export type OfflineScene = Base & { kind: "offline"; title?: L; text: T; xp?: number };

export type EndScene = Base & { kind: "end" };

export type Scene = StoryScene | ChoiceScene | CalcScene | InputScene | FindScene | SplitScene | OfflineScene | EndScene;

export type Mission = {
  id: string;
  icon: string;
  minutes: number;
  title: L;
  blurb: L;
  books: string[];
  initialVars: V;
  scenes: Scene[];
  /** Что считать в итоговой сводке и сколько ₪ перенести в игровой баланс */
  balanceGain: (v: V) => number;
  /** Строки итоговой сводки */
  summary: (v: V) => { label: L; value: string | L }[];
  /** Значки за прохождение */
  badges: (v: V) => string[];
  /** Главные выводы: про деньги и про людей */
  takeaways: { money: L; people: L };
  /** Заманивалка к следующему эпизоду */
  teaser?: L;
  /** Обязательно, если в миссии есть выбор: «почему ты так выбрал?» */
  reflection?: L;
  /** Обязательно, если в миссии есть выбор: смена условий для второго круга */
  twist?: L;
};

/** Индекс следующей сцены после `from`, с учётом skipIf. Возвращает scenes.length, если сцен больше нет. */
export function nextIndex(scenes: Scene[], from: number, v: V): number {
  let i = from + 1;
  while (i < scenes.length && scenes[i].skipIf?.(v)) i++;
  return i;
}

export function firstIndex(scenes: Scene[], v: V): number {
  let i = 0;
  while (i < scenes.length && scenes[i].skipIf?.(v)) i++;
  return i;
}
