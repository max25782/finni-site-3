import { braceletsMission } from "./bracelets";
import { monthMission } from "./month";
import { kioskMission } from "./kiosk";
import { detectiveMission } from "./detective";
import { channelMission } from "./channel";
import { attentionMission } from "./attention";
import { inflationMission } from "./inflation";
import { jobMission } from "./job";
import { bigbuyMission } from "./bigbuy";
import { familyMission } from "./family";
import { givingMission } from "./giving";
import { islandMission } from "./island";
import { negotiatorMission } from "./negotiator";
import { finaleMission } from "./finale";
import { L } from "./types";
import type { Mission } from "./types";

const RAW: Mission[] = [braceletsMission, monthMission, kioskMission, detectiveMission, channelMission, attentionMission, inflationMission, jobMission, bigbuyMission, familyMission, givingMission, islandMission, negotiatorMission, finaleMission];
export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

const POOL: Record<string, ReturnType<typeof L>[]> = {
  choice: [
    L("Следующий выбор может всё изменить. Готов(а)? 👀", "הבחירה הבאה עשויה לשנות הכול. מוכנים? 👀"),
    L("Финни прячет сюрприз за следующим шагом. 🎁", "פיני החביא הפתעה מאחורי הצעד הבא. 🎁"),
    L("Вопрос впереди хитрее, чем кажется. 🧠", "השאלה שמקדימה ערמומית ממה שנראה. 🧠"),
  ],
  calc: [
    L("Следующая загадка проверит, поймёшь ли ты цифры. 🔢", "החידה הבאה תבדוק אם הבנתם מספרים. 🔢"),
    L("Посчитай, и откроется новая часть истории. 🔓", "חשבו ותיפתח חלק חדש בסיפור. 🔓"),
  ],
  find: [
    L("Дальше нужен острый глаз детектива. 🔎", "בהמשך צריך עין חדה של בלש. 🔎"),
  ],
  story: [
    L("Что-то случится… и ты узнаешь, как это отразится на деньгах. ⚡", "משהו עומד לקרות… ותגלו איך זה ישפיע על הכסף. ⚡"),
    L("История поворачивается. Не пропусти. 📖", "הסיפור מתהפך. אל תפספסו. 📖"),
  ],
};
const addHooks = (m: Mission): Mission => {
  let i = 0;
  return {
    ...m,
    scenes: m.scenes.map((s) => {
      if (s.kind === "end" || s.kind === "offline" || s.hook) return s;
      const pool = POOL[s.kind] ?? POOL.story;
      return { ...s, hook: pool[i++ % pool.length] };
    }),
  };
};
const TEASERS: Record<string, ReturnType<typeof L>> = {
  bracelets: L("Завтра: целый месяц на 500 игровых ₪. Хватит ли до конца месяца?", "מחר: חודש שלם עם 500 ₪ משחק. האם יספיק עד סוף החודש?"),
  month: L("Завтра: твой собственный киоск. Цены, поставщики и недовольный клиент.", "מחר: הקיוסק שלכם. מחירים, ספקים ולקוח לא מרוצה."),
  kiosk: L("Завтра: дело детектива. Мошенники хитрее, чем кажется.", "מחר: תיק בלשי. נוכלים ערמומיים ממה שנראה."),
  detective: L("Завтра: твой собственный канал. Что быстрее растёт: просмотры или деньги?", "מחר: הערוץ שלכם. מה גדל מהר יותר: צפיות או כסף?"),
};
export const MISSIONS: Mission[] = RAW.map((m) => addHooks({ ...m, teaser: m.teaser ?? TEASERS[m.id] }));
