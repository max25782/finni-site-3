import { isolateMath } from "./bidi";
import { todayKey } from "./game";
import type { Lang } from "./game";

export type OutingWhen = "morning" | "evening" | "any";

export type Outing = {
  id: string;
  emoji: string;
  minutes: number;
  when: OutingWhen;
  title: { ru: string; he: string };
  how: { ru: string; he: string };
  why: { ru: string; he: string };
};

export const OUTINGS: Outing[] = [
  {
    id: "walk-morning",
    emoji: "🌅",
    minutes: 15,
    when: "morning",
    title: { ru: "Утренняя прогулка", he: "טיול בוקר" },
    how: {
      ru: "Выйди из дома на 15 минут. Телефон оставь дома или в сумке.",
      he: "צאו מהבית ל־15 דקות. את הטלפון השאירו בבית או בתיק.",
    },
    why: {
      ru: "Воздух и шаги помогают голове проснуться. Финни тоже так делает.",
      he: "אוויר וצעדים עוזרים לראש להתעורר. גם פיני עושה ככה.",
    },
  },
  {
    id: "walk-evening",
    emoji: "🌙",
    minutes: 15,
    when: "evening",
    title: { ru: "Вечерняя прогулка", he: "טיול ערב" },
    how: {
      ru: "Пройдись 15 минут без телефона. Можно с кем-то из семьи.",
      he: "לכו 15 דקות בלי טלפון. אפשר עם מישהו מהמשפחה.",
    },
    why: {
      ru: "Вечерняя прогулка помогает телу понять, что день заканчивается.",
      he: "טיול ערב עוזר לגוף להבין שהיום נגמר.",
    },
  },
  {
    id: "silence-15",
    emoji: "🌿",
    minutes: 15,
    when: "any",
    title: { ru: "15 минут тишины", he: "15 דקות של שקט" },
    how: {
      ru: "Сядь или полежи без экрана. Можно смотреть в окно или закрыть глаза.",
      he: "שבו או שכבו בלי מסך. אפשר להסתכל מהחלון או לעצום עיניים.",
    },
    why: {
      ru: "Тишина — это тоже отдых. Голове иногда нужно ничего не решать.",
      he: "שקט הוא גם מנוחה. לפעמים הראש צריך לא להחליט כלום.",
    },
  },
  {
    id: "screen-off-sleep",
    emoji: "🌙",
    minutes: 60,
    when: "evening",
    title: { ru: "Час без экрана перед сном", he: "שעה בלי מסך לפני השינה" },
    how: {
      ru: "За час до сна выключи телефон и телевизор. Можно почитать бумажную книгу или просто полежать.",
      he: "שעה לפני השינה כבו טלפון וטלוויזיה. אפשר לקרוא ספר נייר או פשוט לשכב.",
    },
    why: {
      ru: "Глазам и мозгу легче уснуть, когда экран уже выключен.",
      he: "לעיניים ולראש קל יותר להירדם כשהמסך כבוי.",
    },
  },
  {
    id: "three-good",
    emoji: "✨",
    minutes: 3,
    when: "any",
    title: { ru: "Три хорошие вещи", he: "שלושה דברים טובים" },
    how: {
      ru: "Подумай или скажи вслух три хорошие вещи за сегодня. В приложение ничего писать не нужно.",
      he: "חשבו או אמרו בקול שלושה דברים טובים מהיום. אין צורך לכתוב באפליקציה.",
    },
    why: {
      ru: "Иногда день кажется серым, пока не вспомнишь мелочи. Финни вспоминает печенье.",
      he: "לפעמים היום נראה אפור עד שנזכרים בדברים קטנים. פיני נזכר בעוגיות.",
    },
  },
  {
    id: "dance-5",
    emoji: "💃",
    minutes: 5,
    when: "any",
    title: { ru: "Танцевальная пауза", he: "הפסקת ריקוד" },
    how: {
      ru: "Включи любимую песню и потанцуй 5 минут. Можно просто попрыгать.",
      he: "שימו שיר אהוב ותרקדו 5 דקות. אפשר גם פשוט לקפוץ.",
    },
    why: {
      ru: "Телу нравится двигаться. Это не урок танцев — просто веселье.",
      he: "הגוף אוהב לזוז. זה לא שיעור ריקוד — סתם כיף.",
    },
  },
  {
    id: "water-window",
    emoji: "💧",
    minutes: 2,
    when: "any",
    title: { ru: "Вода и окно", he: "מים וחלון" },
    how: {
      ru: "Выпей стакан воды. Потом две минуты смотри вдаль — в окно или на улицу.",
      he: "שתו כוס מים. אחר כך הסתכלו למרחק שתי דקות — מהחלון או בחוץ.",
    },
    why: {
      ru: "Глазам полезно смотреть далеко. Вода — просто потому что так лучше.",
      he: "לעיניים טוב להסתכל רחוק. מים — פשוט כי ככה יותר נעים.",
    },
  },
];

export const CHARGE_XP = 10;
export const CHARGE_PCT_EACH = 34;

export function outingById(id: string): Outing | undefined {
  return OUTINGS.find((o) => o.id === id);
}

export function idsToday(log: Record<string, string[]>, day: string): string[] {
  return Array.isArray(log[day]) ? log[day] : [];
}

export function batteryPct(ids: string[]): number {
  return Math.min(100, ids.length * CHARGE_PCT_EACH);
}

/** Понедельник текущей недели (локальная дата). */
export function weekStart(now = new Date()): Date {
  const x = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

export function weekDayKeys(now = new Date()): string[] {
  const start = weekStart(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return todayKey(d);
  });
}

/** Дни недели, где была хотя бы одна вылазка. */
export function chargeDaysThisWeek(log: Record<string, string[]>, now = new Date()): number {
  return weekDayKeys(now).filter((k) => idsToday(log, k).length > 0).length;
}

export function outingCountAll(log: Record<string, string[]>, id: string): number {
  return Object.values(log).reduce((n, arr) => n + (Array.isArray(arr) ? arr.filter((x) => x === id).length : 0), 0);
}

export function outingCountWhen(log: Record<string, string[]>, when: OutingWhen): number {
  const ids = new Set(OUTINGS.filter((o) => o.when === when).map((o) => o.id));
  return Object.values(log).reduce((n, arr) => n + (Array.isArray(arr) ? arr.filter((id) => ids.has(id)).length : 0), 0);
}

export function sortOutings(hour: number): Outing[] {
  const rank = (w: OutingWhen): number => {
    if (hour < 12) return w === "morning" ? 0 : w === "any" ? 1 : 2;
    if (hour >= 18) return w === "evening" ? 0 : w === "any" ? 1 : 2;
    return w === "any" ? 0 : w === "morning" ? 1 : 2;
  };
  return [...OUTINGS].sort((a, b) => rank(a.when) - rank(b.when));
}

export function dayPart(hour: number): "morning" | "evening" | "day" {
  if (hour < 12) return "morning";
  if (hour >= 18) return "evening";
  return "day";
}

export const CHARGE_COPY = {
  title: { ru: "Заряд", he: "טעינה" },
  today: { ru: "Заряд сегодня", he: "טעינה היום" },
  week: { ru: "Дней с зарядом на этой неделе", he: "ימים עם טעינה השבוע" },
  of7: { ru: "из 7", he: "מתוך 7" },
  trust: { ru: "Отмечаешь сама, Финни тебе верит.", he: "מסמנים בעצמכם. פיני מאמין לכם." },
  done: { ru: "Сделано!", he: "סומן!" },
  undo: { ru: "Отменить", he: "לבטל" },
  marked: { ru: "Отмечено сегодня", he: "סומן היום" },
  min: { ru: "мин", he: "דק׳" },
  why: { ru: "Зачем", he: "למה" },
  how: { ru: "Как", he: "איך" },
  off: {
    ru: "Этот блок сейчас выключен. Можно спросить родителя, если хочется его вернуть.",
    he: "הבלוק הזה כבוי עכשיו. אפשר לשאול הורה אם רוצים להחזיר אותו.",
  },
  homeMorning: { ru: "Утро — хорошее время для прогулки.", he: "בוקר — זמן טוב לטיול." },
  homeEvening: { ru: "Вечер — можно пройтись или выключить экран.", he: "ערב — אפשר לטייל או לכבות מסך." },
  homeDay: { ru: "Короткий отдых от экрана.", he: "מנוחה קצרה מהמסך." },
  open: { ru: "Открыть Заряд", he: "לפתוח טעינה" },
  breatheTitle: { ru: "Дыхание «Квадрат»", he: "נשימת ריבוע" },
  breatheHint: {
    ru: "Четыре цикла: вдох, пауза, выдох, пауза. Это упражнение, не заработок.",
    he: "ארבעה מחזורים: שאיפה, עצירה, נשיפה, עצירה. זה תרגיל, לא דרך להרוויח XP.",
  },
  inhale: { ru: "Вдох", he: "שאיפה" },
  hold: { ru: "Пауза", he: "עצירה" },
  exhale: { ru: "Выдох", he: "נשיפה" },
  stop: { ru: "Остановить", he: "לעצור" },
  start: { ru: "Начать", he: "להתחיל" },
  after: {
    ru: "Хорошо. Можно дышать чуть медленнее — когда захочешь. За это XP нет, и так нормально.",
    he: "יפה. אפשר לנשום לאט יותר — כשירצו. על זה אין XP, וזה בסדר.",
  },
  cycle: { ru: "цикл", he: "מחזור" },
  restTitle: { ru: "Финни устал, на сегодня хватит! Иди гулять 🌿", he: "פיני עייף, די להיום! לכו לטייל 🌿" },
  restOk: { ru: "Хорошо", he: "בסדר" },
  restMore: { ru: "Ещё 5 минут", he: "עוד 5 דקות" },
  restNote: {
    ru: "Прогресс уже сохранён. Можно выйти и вернуться завтра.",
    he: "ההתקדמות כבר נשמרה. אפשר לצאת ולחזור מחר.",
  },
};

export function tx(copy: { ru: string; he: string }, lang: Lang): string {
  return isolateMath(copy[lang], lang);
}
