import { DEFAULT_REAL, type RealState } from "./real";

export type Lang = "ru" | "he";

export type GameState = {
  name: string;
  age: number | null;
  lang: Lang;
  langChosen: boolean; // язык выбран вручную (иначе основной — иврит)
  xp: number;
  balance: number; // только игровые ₪
  badges: string[];
  dreamGoal: string;
  dreamPrice: number;
  dreamSaved: number;
  completed: string[];
  streak: number;
  lastDay: string; // YYYY-MM-DD последнего завершённого квеста
  lastQuestDay: string;
  lastQuestId: string;
  chatDay: string;
  chatCount: number;
  chatXp: number;
  dailyChatLimit: number;
  run: MissionRun | null; // миссия в процессе
  missionsDone: string[];
  missionDay: string;
  missionCount: number;
  missionsPerDay: number;
  shareEnabled: boolean;
  shareName: boolean;
  fxSound: boolean;
  fxMotion: boolean;
  fxSpeed: boolean;
  fxBig: boolean;
  musicOn: boolean; // фоновая музыка включена ребёнком (после перезагрузки ждёт первого тапа)
  musicVol: number; // 0..1
  musicAllowed: boolean; // родитель может запретить музыку полностью
  blitzDay: string;
  blitzCount: number;
  blitzBest: number;
  voiceInput: boolean;
  voiceChat: boolean; // голосовой разговор с Финни (включает родитель, нужен voiceInput)
  voiceProvider: "browser" | "elevenlabs"; // чем озвучивается Финни
  hero: "girl" | "boy";
  arenaDay: string;
  arenaRounds: number;
  real: RealState;
  ideaDay: string;
  ideaId: string;
  ideaDone: boolean;
  ideaDid: boolean;
  ideaStreak: number;
  ideaLastDay: string;
  ideasSeen: string[];
};

export type MissionRun = {
  id: string;
  idx: number;
  vars: Record<string, number>;
  xp: number; // XP, заработанный в этой миссии
  log?: LogEntry[]; // решения для итогового разбора
};

/** c: номер выбранного варианта (choice), введённое число (input) или 1/0 (calc верно/нет) */
export type LogEntry = { id: string; c: number; v: Record<string, number>; a?: number[] };

export const DEFAULT_STATE: GameState = {
  name: "",
  age: 11,
  lang: "he",
  langChosen: false,
  xp: 0,
  balance: 0,
  badges: [],
  dreamGoal: "",
  dreamPrice: 0,
  dreamSaved: 0,
  completed: [],
  streak: 0,
  lastDay: "",
  lastQuestDay: "",
  lastQuestId: "",
  chatDay: "",
  chatCount: 0,
  chatXp: 0,
  dailyChatLimit: 12,
  run: null,
  missionsDone: [],
  missionDay: "",
  missionCount: 0,
  missionsPerDay: 1,
  shareEnabled: true,
  shareName: false,
  fxSound: true,
  fxMotion: true,
  fxSpeed: true,
  fxBig: false,
  musicOn: false,
  musicVol: 0.5,
  musicAllowed: true,
  blitzDay: "",
  blitzCount: 0,
  blitzBest: 0,
  voiceInput: false,
  voiceChat: false,
  voiceProvider: "browser",
  hero: "girl",
  arenaDay: "",
  arenaRounds: 0,
  real: DEFAULT_REAL,
  ideaDay: "",
  ideaId: "",
  ideaDone: false,
  ideaDid: false,
  ideaStreak: 0,
  ideaLastDay: "",
  ideasSeen: [],
};

export const LEVELS = [
  { min: 0, ru: "Новичок", he: "מתחילה", icon: "🪙" },
  { min: 100, ru: "Ученик", he: "תלמידה", icon: "🌟" },
  { min: 250, ru: "Хранитель копилки", he: "שומרת הקופה", icon: "🐷" },
  { min: 500, ru: "Мастер бюджета", he: "אשת תקציב", icon: "💰" },
  { min: 800, ru: "Финансовый детектив", he: "בלשית פיננסית", icon: "🔎" },
  { min: 1200, ru: "Капитан капитала", he: "קפטנית ההון", icon: "🚀" },
  { min: 2000, ru: "Мастер Финни", he: "מאסטר פיני", icon: "🦝" },
];

export function levelFor(xp: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].min) idx = i;
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const progress = next ? (xp - cur.min) / (next.min - cur.min) : 1;
  return { idx, cur, next, progress };
}

export function todayKey(d = new Date()): string {
  // локальная дата, не UTC
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

export function dayIndex(d = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

export const STORAGE_KEY = "finni-state-v1";

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const sv = JSON.parse(raw);
    if (!sv || typeof sv !== "object") return { ...DEFAULT_STATE };
    // Миграция: в старых сохранениях "ru" был просто дефолтом. Уважаем язык только при явном langChosen === true.
    const chosen = sv.langChosen === true && (sv.lang === "ru" || sv.lang === "he");
    const lang: Lang = chosen ? sv.lang : "he";
    return { ...DEFAULT_STATE, ...sv, lang, langChosen: chosen, voiceProvider: sv.voiceProvider === "elevenlabs" ? "elevenlabs" : "browser", real: { ...DEFAULT_REAL, ...(sv.real ?? {}) } };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(s: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* приватный режим и т.п. */
  }
}

export const BADGES: Record<string, { icon: string; ru: string; he: string }> = {
  haggler: { icon: "🤝", ru: "Мастер торга", he: "אמן המיקוח" },
  debater: { icon: "🗣️", ru: "Мастер спора", he: "אמן הוויכוח" },
  first_quest: { icon: "🎮", ru: "Первый квест", he: "משימה ראשונה" },
  first_piggy: { icon: "🐷", ru: "Первая копилка", he: "קופה ראשונה" },
  goal_hunter: { icon: "🎯", ru: "Охотник за целью", he: "צייד מטרות" },
  money_guard: { icon: "🛡️", ru: "Защитник денег", he: "שומרת הכסף" },
  streak3: { icon: "🔥", ru: "3 дня подряд", he: "3 ימים ברצף" },
  streak7: { icon: "🏅", ru: "Неделя подряд", he: "שבוע ברצף" },
  cookie_economist: { icon: "🍪", ru: "Печеньковый экономист", he: "כלכלן העוגיות" },
  young_founder: { icon: "🌱", ru: "Маленький предприниматель", he: "יזמית קטנה" },
  goal_done: { icon: "🏆", ru: "Мечта достигнута", he: "החלום הושג" },
  kind_heart: { icon: "❤️", ru: "Доброе сердце", he: "לב טוב" },
  job_dealer: { icon: "💼", ru: "Договорилась с родителями", he: "סגרתי עסקה עם ההורים" },
  first_earn: { icon: "💵", ru: "Первый заработок", he: "ההכנסה הראשונה" },
  idea_week: { icon: "💡", ru: "Идея дня: 7 дней", he: "רעיון היום: 7 ימים" },
  mission1: { icon: "📿", ru: "Ярмарка пройдена", he: "היריד הושלם" },
};
