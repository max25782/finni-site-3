"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";
import { MISSIONS as SEASON_MISSIONS } from "@/lib/missions";
import LangSwitch from "@/components/LangSwitch";
import ParentGate from "@/components/ParentGate";
import ParentMoney from "@/components/ParentMoney";
import { CloudAuth } from "@/components/CloudAuth";
import { todayKey, type Lang } from "@/lib/game";
import { CHARGE_COPY, idsToday, tx, weekDayKeys } from "@/lib/wellbeing";
import { cloudOnline, familyEraseCloud, familyPrefsSet } from "@/lib/cloud";
import { clearEvents, downloadAnalyticsJson, track } from "@/lib/analytics";
import type { AgeGroup } from "@/lib/analytics";
import { downloadProgressJson, mergeProgressImport, parseProgressImport } from "@/lib/progress";

const MISSIONS = {
  ru: [
    "Неделя 1: вместе сходите в магазин и сравните цены на одну и ту же вещь в двух местах.",
    "Неделя 2: пусть ребёнок придумает мини-проект (браслеты, печенье, уборка во дворе) и посчитает выручку, расходы и прибыль. Продажа только с вашего разрешения.",
    "Неделя 3: найдите в семье пример «актива» и «пассива» и обсудите их.",
    "Неделя 4: обсудите одно настоящее решение с деньгами (подарок, поход, ремонт) и покажите, как вы взвешиваете варианты.",
  ],
  he: [
    "שבוע 1: לכו יחד לחנות והשוו מחירים של אותו מוצר בשני מקומות.",
    "שבוע 2: הילדה תמציא מיני־פרויקט (צמידים, עוגיות, ניקיון חצר) ותחשב הכנסות, הוצאות ורווח. מכירה רק באישורכם.",
    "שבוע 3: מצאו בבית דוגמה ל״נכס״ ול״התחייבות״ ודונו בהן.",
    "שבוע 4: דונו בהחלטה אמיתית אחת על כסף (מתנה, טיול, תיקון) והראו איך אתם שוקלים אפשרויות.",
  ],
};

const NOTES = {
  ru: [
    "Все деньги в игре виртуальные. Реальных платежей, карт и вкладов нет.",
    "Раздел «Реальные деньги» — только учёт заказов и выплат. Приложение ничего не переводит, а игровые ₪ в настоящие по умолчанию не превращаются.",
    "Прогресс хранится только в браузере устройства. Имя и возраст не отправляются на сервер.",
    "Сообщения Финни отправляются в Claude API. Личные данные (карты, пароли, телефоны, адреса) блокируются до отправки, но проверка не идеальна, поэтому поговорите с ребёнком об этом правиле.",
    "Финни может ошибаться. Иногда читайте переписку вместе с ребёнком.",
    "Чтобы уйти от бесконечной ленты: один квест в день, лимит сообщений, экран «на сегодня всё» и офлайн-миссии.",
  ],
  he: [
    "כל הכסף במשחק וירטואלי. אין תשלומים אמיתיים, כרטיסים או פיקדונות.",
    "פרק ״כסף אמיתי״ הוא רישום בלבד של הזמנות ותשלומים. האפליקציה לא מעבירה כסף, ושקלי המשחק לא הופכים לאמיתיים כברירת מחדל.",
    "ההתקדמות נשמרת רק בדפדפן של המכשיר. שם וגיל לא נשלחים לשרת.",
    "הודעות לפיני נשלחות ל-Claude API. מידע אישי (כרטיסים, סיסמאות, טלפונים, כתובות) נחסם לפני השליחה, אבל הבדיקה אינה מושלמת, לכן דברו עם הילדה על הכלל הזה.",
    "פיני יכול לטעות. מדי פעם קראו את השיחה יחד.",
    "כדי להתרחק מגלילה אינסופית: משימה אחת ביום, הגבלת הודעות, מסך ״זה הכול להיום״ ומשימות בעולם האמיתי.",
  ],
};

const MUSIC_VOLS = [0.3, 0.5, 0.75];
// значение из сохранения может быть любым: показываем ближайший вариант списка
const nearestVol = (v: number) => MUSIC_VOLS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), 0.5);

export default function ParentsPage() {
  return (
    <ParentGate>
      <ParentsInner />
    </ParentGate>
  );
}

function ParentsInner() {
  const { s, lang, t, ready, update, mutate, reset } = useGame();
  const [name, setName] = useState<string | null>(null);
  const progressInputRef = useRef<HTMLInputElement>(null);
  // настроена ли облачная озвучка на сервере (ключ не раскрывается)
  const [ttsCfg, setTtsCfg] = useState(false);

  useEffect(() => {
    fetch("/api/tts/status")
      .then((r) => r.json())
      .then((d) => {
        setTtsCfg(Boolean(d?.configured));
      })
      .catch(() => {
        setTtsCfg(false);
      });
  }, []);

  if (!ready) return null;
  const nameVal = name ?? s.name;

  return (
    <>
      <h1>👪 {t("parentsTitle")}</h1>

      <CloudAuth />
      <ParentMoney />

      <div className="card">
        <h2>🎯 {lang === "he" ? "משימות" : "Миссии"}</h2>
        <p className="muted">
          {lang === "he"
            ? "פותח גישה בלבד — לא מסמן משימה כהושלמה, בלי XP, תגים או ₪ משחקיים."
            : "Только снимает блокировку — миссия не считается пройденной, XP, бейджи и игровые ₪ не начисляются."}
        </p>
        <label htmlFor="munl">{lang === "he" ? "לפתוח משימות עד מס׳" : "Открыть миссии до №"}</label>
        <select
          id="munl"
          value={String(s.unlockedUpTo)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n === s.unlockedUpTo) return;
            update({ unlockedUpTo: n });
            track("unlock_by_parent", { mission_index: n });
          }}
        >
          <option value="0">{lang === "he" ? "ברירת מחדל (לפי הסדר)" : "По умолчанию (по порядку)"}</option>
          {SEASON_MISSIONS.map((m, i) => (
            <option key={m.id} value={String(i + 1)}>
              {i + 1}. {m.title[lang]}
            </option>
          ))}
        </select>
        <p style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              if (s.unlockedUpTo === 0) return;
              update({ unlockedUpTo: 0 });
              track("unlock_by_parent", { mission_index: 0 });
            }}
          >
            {lang === "he" ? "איפוס" : "Сбросить"}
          </button>
        </p>
      </div>

      <div className="card">
        <h2>📊 {lang === "he" ? "נתוני המשחק" : "Данные игры"}</h2>
        <label htmlFor="anl">{lang === "he" ? "לעזור לשפר את פיני (סטטיסטיקה אנונימית)" : "Помогать улучшать Финни (анонимная статистика)"}</label>
        <select
          id="anl"
          value={s.analyticsOn ? "1" : "0"}
          onChange={(e) => {
            const analyticsOn = e.target.value === "1";
            update({ analyticsOn });
            if (s.ageGroup !== "unknown") void familyPrefsSet({ analyticsOn, ageGroup: s.ageGroup });
          }}
        >
          <option value="0">{lang === "he" ? "כבוי (ברירת מחדל)" : "Выкл. (по умолчанию)"}</option>
          <option value="1">{lang === "he" ? "מופעל" : "Вкл."}</option>
        </select>
        <label htmlFor="agg">{lang === "he" ? "קבוצת גיל (בלי תאריך לידה)" : "Возрастная группа (без даты рождения)"}</label>
        <select
          id="agg"
          value={s.ageGroup}
          onChange={(e) => {
            const ageGroup = e.target.value as AgeGroup | "unknown";
            const age = ageGroup === "7-9" ? 8 : ageGroup === "12-14" ? 13 : ageGroup === "10-11" ? 11 : s.age;
            update({ ageGroup, age });
            if (ageGroup !== "unknown") void familyPrefsSet({ analyticsOn: s.analyticsOn, ageGroup });
          }}
        >
          <option value="unknown">{lang === "he" ? "לא הוגדר" : "Не задана"}</option>
          <option value="7-9">7–9</option>
          <option value="10-11">10–11</option>
          <option value="12-14">12–14</option>
        </select>
        <p className="muted" style={{ marginTop: 8 }}>
          {lang === "he"
            ? "נרשם: אילו סצנות נפתחו, איזה כפתור נבחר, כמה זמן לקח. לא נרשם: טקסטים, שמות, תוכן צ׳אט. בלי הסכמה ובלי ענן המשפחה הכול נשאר במכשיר."
            : "Записывается: какие сцены открыты, какой ответ выбран, сколько времени заняло. Не записывается: тексты, имена, чат. Без согласия и без семьи в облаке всё остаётся на устройстве."}{" "}
          <a href="/privacy">{lang === "he" ? "מדיניות פרטיות" : "Политика конфиденциальности"}</a>
        </p>
        <p className="muted" style={{ marginTop: 10 }}>
          {lang === "he"
            ? "ייצוא/ייבוא התקדמות: XP, משימות, הגדרות. בלי יומן כסף אמיתי (ייצוא נפרד) ובלי אירועי אנליטיקה."
            : "Экспорт/импорт прогресса: XP, миссии, настройки. Без журнала реальных денег (отдельный экспорт) и без событий аналитики."}
        </p>
        <p className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn secondary" onClick={() => downloadProgressJson(s)}>
            {lang === "he" ? "ייצוא התקדמות (JSON)" : "Выгрузить прогресс (JSON)"}
          </button>
          <button type="button" className="btn secondary" onClick={() => progressInputRef.current?.click()}>
            {lang === "he" ? "טעינת התקדמות (JSON)" : "Загрузить прогресс (JSON)"}
          </button>
          <input
            ref={progressInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const text = typeof reader.result === "string" ? reader.result : "";
                const parsed = parseProgressImport(text, s.real);
                if (parsed.ok === false) {
                  const msg =
                    parsed.reason === "version"
                      ? lang === "he"
                        ? "גרסת הקובץ לא מתאימה."
                        : "Неверная версия файла."
                      : lang === "he"
                        ? "הקובץ פגום או לא מתאים."
                        : "Файл повреждён или не подходит.";
                  alert(msg);
                  return;
                }
                const ok = lang === "he"
                  ? confirm("ההתקדמות במכשיר הזה תוחלף. יומן הכסף האמיתי נשאר כאן. להמשיך?")
                  : confirm("Текущий прогресс на этом устройстве будет заменён. Журнал реальных денег останется здесь. Продолжить?");
                if (!ok) return;
                const imported = parsed.state;
                mutate((p) => mergeProgressImport(p, imported));
              };
              reader.readAsText(file);
            }}
          />
          <button type="button" className="btn secondary" onClick={() => downloadAnalyticsJson()}>
            {lang === "he" ? "ייצוא אירועים (JSON)" : "Выгрузить события (JSON)"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              const ok = lang === "he" ? confirm("למחוק את אירועי המכשיר?") : confirm("Очистить события на этом устройстве?");
              if (ok) clearEvents();
            }}
          >
            {lang === "he" ? "ניקוי אירועים" : "Очистить события"}
          </button>
        </p>
      </div>

      <div className="card">
        <h2>⚙️ {t("settings")}</h2>
        <label htmlFor="nm">{t("nameLabel")}</label>
        <input
          id="nm"
          type="text"
          value={nameVal}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => update({ name: nameVal.replace(/[<>]/g, "").trim() })}
        />
        <label htmlFor="ag">{t("ageLabel")}</label>
        <select id="ag" value={s.age ?? 11} onChange={(e) => update({ age: Number(e.target.value) })}>
          {[7, 8, 9, 10, 11, 12, 13, 14].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label htmlFor="lm">{t("limitLabel")}</label>
        <select id="lm" value={s.dailyChatLimit} onChange={(e) => update({ dailyChatLimit: Number(e.target.value) })}>
          {[0, 6, 12, 20].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label htmlFor="mp">{t("missionsPerDayLabel")}</label>
        <select id="mp" value={s.missionsPerDay} onChange={(e) => update({ missionsPerDay: Number(e.target.value) })}>
          {[1, 2, 3].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label htmlFor="sh">{lang === "he" ? "כפתורי שיתוף (WhatsApp, קליפ)" : "Кнопки «Поделиться» (WhatsApp, клип)"}</label>
        <select id="sh" value={s.shareEnabled ? "1" : "0"} onChange={(e) => update({ shareEnabled: e.target.value === "1" })}>
          <option value="1">{lang === "he" ? "מופעל" : "Включены"}</option>
          <option value="0">{lang === "he" ? "כבוי" : "Выключены"}</option>
        </select>
        <label htmlFor="sn">{lang === "he" ? "לכלול שם בכרטיס השיתוף" : "Включать имя в карточку"}</label>
        <select id="sn" value={s.shareName ? "1" : "0"} onChange={(e) => update({ shareName: e.target.value === "1" })}>
          <option value="0">{lang === "he" ? "לא (מומלץ)" : "Нет (рекомендуется)"}</option>
          <option value="1">{lang === "he" ? "כן, השם הפרטי בלבד" : "Да, только имя"}</option>
        </select>
        <label htmlFor="hr">{lang === "he" ? "גיבור/ת הקומיקס" : "Герой комикса"}</label>
        <select id="hr" value={s.hero} onChange={(e) => update({ hero: e.target.value === "boy" ? "boy" : "girl" })}>
          <option value="girl">{lang === "he" ? "ילדה" : "Девочка"}</option>
          <option value="boy">{lang === "he" ? "ילד" : "Мальчик"}</option>
        </select>
        <label htmlFor="vi">{lang === "he" ? "קלט קולי בזירה (המיקרופון)" : "Голосовой ввод на арене (микрофон)"}</label>
        <select id="vi" value={s.voiceInput ? "1" : "0"} onChange={(e) => update({ voiceInput: e.target.value === "1" })}>
          <option value="0">{lang === "he" ? "כבוי (מומלץ כברירת מחדל)" : "Выключен (по умолчанию)"}</option>
          <option value="1">{lang === "he" ? "מופעל" : "Включён"}</option>
        </select>
        <p className="muted" style={{ marginTop: 4 }}>
          {lang === "he"
            ? "זיהוי הקול נעשה בדפדפן ובכרום/אדג׳ האודיו נשלח לשרתי יצרן הדפדפן. התמלול עובר מסנן מידע אישי לפני השליחה לפיני."
            : "Распознавание речи делает браузер. В Chrome/Edge звук обрабатывается на серверах производителя браузера. Текст проходит фильтр личных данных перед отправкой Финни."}
        </p>
        <p className="muted" style={{ marginTop: 4 }}>
          {lang === "he"
            ? "עובד ב-Chrome/Edge/Safari. הצליל מעובד על ידי שירות הדפדפן. נדרש HTTPS."
            : "Работает в Chrome/Edge/Safari. Звук обрабатывается сервисом браузера. Для работы нужен HTTPS."}
        </p>
        {s.voiceInput && (
          <>
            <label htmlFor="vc">{lang === "he" ? "שיחה קולית עם פיני" : "Голосовой разговор с Финни"}</label>
            <select id="vc" value={s.voiceChat ? "1" : "0"} onChange={(e) => update({ voiceChat: e.target.value === "1" })}>
              <option value="0">{lang === "he" ? "כבויה" : "Выключен"}</option>
              <option value="1">{lang === "he" ? "מופעלת" : "Включён"}</option>
            </select>
            <label htmlFor="vp">{lang === "he" ? "הקול של פיני" : "Голос Финни"}</label>
            <select id="vp" value={s.voiceProvider === "elevenlabs" && ttsCfg ? "elevenlabs" : "browser"} onChange={(e) => update({ voiceProvider: e.target.value === "elevenlabs" ? "elevenlabs" : "browser" })}>
              <option value="browser">{lang === "he" ? "רגיל (הדפדפן)" : "Стандартный (браузер)"}</option>
              {ttsCfg && <option value="elevenlabs">{lang === "he" ? "משופר" : "Улучшенный"}</option>}
            </select>
            <p className="muted" style={{ marginTop: 4 }}>
              {lang === "he"
                ? "זיהוי הדיבור מתבצע בדפדפן (Google/Apple). בקול המשופר לשירות ההקראה נשלח רק הטקסט של תשובות פיני, לא הקול של הילד. מצב הקול נכבה אוטומטית אחרי 10 דקות."
                : "Распознавание речи выполняет браузер (Google/Apple). При улучшенном голосе на сервис озвучки уходит только текст ответов Финни, не голос ребёнка. Голосовой режим автоматически выключается через 10 минут."}
            </p>
          </>
        )}
        <label htmlFor="fs">{lang === "he" ? "בונוס מהירות (טיימר ללא עונש)" : "Бонус за скорость (таймер без штрафов)"}</label>
        <select id="fs" value={s.fxSpeed ? "1" : "0"} onChange={(e) => update({ fxSpeed: e.target.value === "1" })}>
          <option value="1">{lang === "he" ? "מופעל" : "Включён"}</option>
          <option value="0">{lang === "he" ? "כבוי (לילדים שלחוצים מטיימרים)" : "Выключен (если таймер вызывает стресс)"}</option>
        </select>
        <label htmlFor="fx1">{lang === "he" ? "צלילים" : "Звуки"}</label>
        <select id="fx1" value={s.fxSound ? "1" : "0"} onChange={(e) => update({ fxSound: e.target.value === "1" })}>
          <option value="1">{lang === "he" ? "מופעלים" : "Включены"}</option>
          <option value="0">{lang === "he" ? "כבויים" : "Выключены"}</option>
        </select>
        <label htmlFor="ma">{lang === "he" ? "מוזיקת רקע" : "Фоновая музыка"}</label>
        <select id="ma" value={s.musicAllowed ? "1" : "0"} onChange={(e) => update({ musicAllowed: e.target.value === "1" })}>
          <option value="1">{lang === "he" ? "מותרת" : "Разрешена"}</option>
          <option value="0">{lang === "he" ? "אסורה" : "Запрещена"}</option>
        </select>
        <label htmlFor="mv">{lang === "he" ? "עוצמת המוזיקה" : "Громкость музыки"}</label>
        <select id="mv" value={String(nearestVol(s.musicVol))} onChange={(e) => update({ musicVol: Number(e.target.value) })}>
          <option value="0.3">{lang === "he" ? "שקט" : "Тихо"}</option>
          <option value="0.5">{lang === "he" ? "בינוני" : "Средне"}</option>
          <option value="0.75">{lang === "he" ? "חזק יותר" : "Громче"}</option>
        </select>
        <label htmlFor="fx2">{lang === "he" ? "אנימציות" : "Анимации"}</label>
        <select id="fx2" value={s.fxMotion ? "1" : "0"} onChange={(e) => update({ fxMotion: e.target.value === "1" })}>
          <option value="1">{lang === "he" ? "מופעלות" : "Включены"}</option>
          <option value="0">{lang === "he" ? "כבויות (פחות גירויים)" : "Выключены (меньше раздражителей)"}</option>
        </select>
        <label htmlFor="fx3">{lang === "he" ? "טקסט גדול" : "Крупный текст"}</label>
        <select id="fx3" value={s.fxBig ? "1" : "0"} onChange={(e) => update({ fxBig: e.target.value === "1" })}>
          <option value="0">{lang === "he" ? "רגיל" : "Обычный"}</option>
          <option value="1">{lang === "he" ? "גדול" : "Крупный"}</option>
        </select>
        <label>{t("langLabel")}</label>
        <LangSwitch />

        <h3 style={{ marginTop: 22 }}>🔋 {tx(CHARGE_COPY.title, lang)}</h3>
        <label htmlFor="ch">{lang === "he" ? "בלוק טעינה" : "Блок Заряд"}</label>
        <select id="ch" value={s.chargeOn ? "1" : "0"} onChange={(e) => update({ chargeOn: e.target.value === "1" })}>
          <option value="1">{lang === "he" ? "מופעל" : "Включён"}</option>
          <option value="0">{lang === "he" ? "כבוי" : "Выключен"}</option>
        </select>
        <label htmlFor="pl">{lang === "he" ? "מגבלת משחק" : "Лимит игры"}</label>
        <select id="pl" value={String(s.playLimitMin)} onChange={(e) => update({ playLimitMin: Number(e.target.value) })}>
          <option value="0">{lang === "he" ? "בלי הגבלה" : "Без лимита"}</option>
          <option value="20">20 {lang === "he" ? "דק׳" : "мин"}</option>
          <option value="30">30 {lang === "he" ? "דק׳" : "мин"}</option>
          <option value="45">45 {lang === "he" ? "דק׳" : "мин"}</option>
          <option value="60">60 {lang === "he" ? "דק׳" : "мин"}</option>
        </select>
        <label htmlFor="bd">{lang === "he" ? "שעת שינה" : "Время сна"}</label>
        <select id="bd" value={s.bedtime} onChange={(e) => update({ bedtime: e.target.value })}>
          <option value="">{lang === "he" ? "כבוי" : "Выкл."}</option>
          <option value="20:00">20:00</option>
          <option value="20:30">20:30</option>
          <option value="21:00">21:00</option>
          <option value="21:30">21:30</option>
          <option value="22:00">22:00</option>
        </select>
        <p style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() => update({ playedToday: { day: todayKey(), sec: 0, extra: false } })}
          >
            {lang === "he" ? "לאפס את המגבלה להיום" : "Сбросить лимит на сегодня"}
          </button>
        </p>
        <p className="muted" style={{ marginTop: 10 }}>
          {lang === "he"
            ? "האפליקציה לא בודקת ולא עוקבת. את היציאות מסמנת הילדה. אם משהו מדאיג אתכם לגבי הרגשה או קשב, דונו בזה עם מומחה."
            : "Приложение ничего не проверяет и не следит. Вылазки отмечает ребёнок. Если вас что-то беспокоит в самочувствии или внимании ребёнка, обсудите это со специалистом."}
        </p>
        <ChargeWeek lang={lang} log={s.chargeLog} />

        <p style={{ marginTop: 18 }}>
          <button
            className="btn secondary"
            onClick={() => {
              if (confirm(t("resetConfirm"))) reset();
            }}
          >
            {t("resetAll")}
          </button>
        </p>
        {cloudOnline() && (
          <p style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                const ok =
                  lang === "he"
                    ? confirm("למחוק את נתוני המשפחה בענן? ההזמנות והיומן יימחקו. החשבון יישאר.")
                    : confirm("Стереть данные семьи в облаке? Заказы и журнал удалятся. Аккаунт останется.");
                if (!ok) return;
                void familyEraseCloud();
              }}
            >
              {lang === "he" ? "מחיקת נתוני הענן" : "Стереть данные семьи в облаке"}
            </button>
          </p>
        )}
      </div>

      <div className="card warn">
        <h2>🌍 {lang === "he" ? "משימות משפחתיות" : "Семейные миссии"}</h2>
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {MISSIONS[lang].map((m, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              {m}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>🛡️ {lang === "he" ? "חשוב לדעת" : "Важно знать"}</h2>
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {NOTES[lang].map((m, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              {m}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

const WEEKDAYS: Record<Lang, string[]> = {
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  he: ["ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳", "א׳"],
};

function ChargeWeek({ lang, log }: { lang: Lang; log: Record<string, string[]> }) {
  const keys = weekDayKeys();
  const total = keys.reduce((n, k) => n + idsToday(log, k).length, 0);
  return (
    <div className="charge-week" style={{ marginTop: 14 }}>
      <p>
        <b>{lang === "he" ? "יציאות השבוע" : "Вылазки за неделю"}:</b> {total}
      </p>
      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
        {keys.map((k, i) => (
          <li key={k}>
            {WEEKDAYS[lang][i]}: {idsToday(log, k).length}
          </li>
        ))}
      </ul>
    </div>
  );
}
