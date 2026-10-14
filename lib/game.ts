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
  /** Родитель открыл миссии до №N (1–14). 0 = только по порядку прохождения. Не заменяет missionsDone. */
  unlockedUpTo: number;
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
  chargeLog: Record<string, string[]>; // YYYY-MM-DD → id вылазок
  chargeOn: boolean;
  chargeXpDay: string; // день, когда уже дали +10 XP за Заряд
  playLimitMin: number; // 0 = без лимита
  bedtime: string; // "" = выкл., "HH:MM"
  playedToday: { day: string; sec: number; extra?: boolean };
  analyticsOn: boolean;
  ageGroup: "7-9" | "10-11" | "12-14" | "unknown";
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
  unlockedUpTo: 0,
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
  chargeLog: {},
  chargeOn: true,
  chargeXpDay: "",
  playLimitMin: 0,
  bedtime: "",
  playedToday: { day: "", sec: 0 },
  analyticsOn: false,
  ageGroup: "unknown",
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
  // тестовый крюк: window.__finniNow — подмена «сейчас» без ломания SSR
  if (typeof window !== "undefined" && typeof (window as Window & { __finniNow?: number }).__finniNow === "number") {
    d = new Date((window as Window & { __finniNow?: number }).__finniNow as number);
  }
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

/** Нормализация сохранённого снимка (localStorage или импорт). real подставляется отдельно. */
export function normalizeGameSnapshot(sv: Record<string, unknown>, real: RealState): GameState {
  const chosen = sv.langChosen === true && (sv.lang === "ru" || sv.lang === "he");
  const lang: Lang = chosen ? (sv.lang as Lang) : "he";
  const limits = [0, 20, 30, 45, 60];
  const playLimitMin = limits.includes(sv.playLimitMin as number) ? (sv.playLimitMin as number) : 0;
  const bedtime =
    typeof sv.bedtime === "string" && (/^\d{2}:\d{2}$/.test(sv.bedtime) || sv.bedtime === "") ? sv.bedtime : "";
  const chargeLog = sv.chargeLog && typeof sv.chargeLog === "object" ? (sv.chargeLog as Record<string, string[]>) : {};
  const pt = sv.playedToday && typeof sv.playedToday === "object" ? (sv.playedToday as Record<string, unknown>) : {};
  const playedToday = {
    day: typeof pt.day === "string" ? pt.day : "",
    sec: typeof pt.sec === "number" && pt.sec >= 0 ? Math.floor(pt.sec) : 0,
    extra: pt.extra === true,
  };
  const unlockN = typeof sv.unlockedUpTo === "number" ? Math.min(14, Math.max(0, Math.floor(sv.unlockedUpTo))) : 0;
  return {
    ...DEFAULT_STATE,
    ...sv,
    lang,
    langChosen: chosen,
    voiceProvider: sv.voiceProvider === "elevenlabs" ? "elevenlabs" : "browser",
    real,
    chargeLog,
    chargeOn: sv.chargeOn !== false,
    chargeXpDay: typeof sv.chargeXpDay === "string" ? sv.chargeXpDay : "",
    playLimitMin,
    bedtime,
    playedToday,
    analyticsOn: sv.analyticsOn === true,
    ageGroup: sv.ageGroup === "7-9" || sv.ageGroup === "12-14" || sv.ageGroup === "10-11" ? (sv.ageGroup as GameState["ageGroup"]) : "unknown",
    unlockedUpTo: unlockN,
  };
}

/** Заблокирована ли миссия по индексу (0-based) в сезоне. */
export function isMissionLocked(s: GameState, missionIndex: number, orderedIds: string[]): boolean {
  const id = orderedIds[missionIndex];
  if (!id) return true;
  if (s.missionsDone.includes(id)) return false;
  if (missionIndex === 0) return s.unlockedUpTo < 1;
  if (s.missionsDone.includes(orderedIds[missionIndex - 1])) return false;
  return s.unlockedUpTo < missionIndex + 1;
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const sv = JSON.parse(raw);
    if (!sv || typeof sv !== "object") return { ...DEFAULT_STATE };
    const merged = sv as Record<string, unknown>;
    const real = { ...DEFAULT_REAL, ...((merged.real as object) ?? {}) };
    return normalizeGameSnapshot(merged, real);
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
  quiet_keeper: { icon: "🌿", ru: "Хранитель тишины", he: "שומרת השקט" },
  morning_raccoon: { icon: "🌅", ru: "Утренний енот", he: "דביבון הבוקר" },
  night_guard: { icon: "🌙", ru: "Ночной страж", he: "שומרת הלילה" },
};
