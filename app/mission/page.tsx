"use client";

import ShareBox from "@/components/ShareBox";
import { useEffect, useRef, useState } from "react";
import { Burst, Stage, Slides, Segments, BonusTimer, BreakOverlay, ResultText } from "@/components/fx";
import { sfx } from "@/lib/fx";
import { music } from "@/lib/music";
import { CALC_LADDER, FAST, IDLE, SAME, SOFT2, nudgePick } from "@/lib/nudges";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { todayKey } from "@/lib/game";
import { MISSIONS, missionById } from "@/lib/missions";
import { firstIndex, nextIndex, tx, V, Scene, L, Mission } from "@/lib/missions/types";
import type { LogEntry } from "@/lib/game";
import { BOOK_LABEL } from "@/lib/quests";

type Result = { outcome: string; patch: Record<string, number>; xp: number; badge?: string; good?: boolean; c: number; a?: number[]; bonus?: number; mood?: "good" | "soft"; notes?: string[] };

const clean = (p: Record<string, number | undefined> | undefined) => {
  const o: Record<string, number> = {};
  Object.entries(p ?? {}).forEach(([k, val]) => {
    if (typeof val === "number" && isFinite(val)) o[k] = val;
  });
  return o;
};

// единицы в данных миссий записаны латиницей: показываем по языку
const UNITS: Record<string, L> = { min: L("мин", "דק׳"), h: L("ч", "ש׳") };
const unitText = (u: string | undefined, lang: "ru" | "he") => (u ? UNITS[u]?.[lang] ?? u : "");

const ui = {
  next: L("Дальше ➜", "הבא ←"),
  check: L("Проверить", "בדיקה"),
  pause: L("⏸️ Пауза (прогресс сохранится)", "⏸️ הפסקה (ההתקדמות נשמרת)"),
  quit: L("Бросить миссию", "לוותר על המשימה"),
  start: L("Начать миссию", "להתחיל משימה"),
  cont: L("Продолжить миссию", "להמשיך משימה"),
  again: L("Пройти ещё раз", "לשחק שוב"),
  limit: L(
    "Лимит миссий на сегодня исчерпан. Лучшее продолжение — настоящий мир: сделай офлайн-задание из миссии. Завтра новая попытка!",
    "מכסת המשימות להיום נגמרה. ההמשך הכי טוב הוא בעולם האמיתי: בצעו את המשימה שמחוץ למסך. מחר יהיה שוב!"
  ),
  decide: L("Выбери:", "בחרו:"),
  yourAnswer: L("Твой ответ", "התשובה שלכם"),
  done: L("Миссия пройдена! 🎉", "המשימה הושלמה! 🎉"),
  cash: L("Касса", "קופה"),
  stock: L("Товар", "סחורה"),
  price: L("Цена", "מחיר"),
  rep: L("Репутация", "מוניטין"),
  xp: L("XP за миссию", "XP במשימה"),
  revenue: L("Выручка", "הכנסות"),
  costs: L("Расходы", "הוצאות"),
  profit: L("Прибыль", "רווח"),
  savings: L("В копилке", "בקופה"),
  lessons: L("Что ты вынес(ла) из миссии", "מה למדתם מהמשימה"),
  toBalance: L("Копилка переходит в игровой баланс", "הקופה עוברת ליתרה במשחק"),
  bonus: L("Бонус за завершение", "בונוס סיום"),
  debrief: L("Разбор: что ты делал(а) и что могло быть", "סיכום: מה עשיתם ומה היה יכול לקרות"),
  debriefNote: L(
    "Здесь нет «хорошо» и «плохо». Есть выбор, у каждого выбора свои последствия. Смотри, что получилось и что было бы при другом выборе.",
    "אין כאן ״טוב״ ו״רע״. יש בחירה, ולכל בחירה יש תוצאות. ראו מה יצא ומה היה קורה בבחירה אחרת."
  ),
  season: L("Сезон: 14 дней", "עונה: 14 ימים"),
  seasonNote: L("Проходи по порядку: каждая миссия открывает следующую", "עברו לפי הסדר: כל משימה פותחת את הבאה"),
  day: L("День", "יום"),
  locked: L("Откроется после предыдущей миссии.", "תיפתח אחרי המשימה הקודמת."),
  tomorrow: L("Следующий эпизод", "הפרק הבא"),
  findNote: L("Нажми на всё подозрительное, потом «Проверить».", "לחצו על כל מה שחשוד ואז ״בדיקה״."),
  findResult: L("Ты нашёл(ла) {h} из {b} тревожных признаков. Ложных тревог: {f}. Смотри разбор:", "מצאתם {h} מתוך {b} סימני אזהרה. אזעקות שווא: {f}. הנה הפירוט:"),
  left: L("Осталось распределить", "נשאר לחלק"),
  youChose: L("Ты выбрал(а)", "בחרתם"),
  happened: L("Что получилось", "מה יצא"),
  ifOther: L("А если бы…", "ואם הייתם…"),
  fromBook: L("Идея из книги", "רעיון מהספר"),
  takeaways: L("Главное из миссии", "העיקר מהמשימה"),
  yourNum: L("Ты выбрал(а) число", "בחרתם מספר"),
  calcGood: L("Ты посчитал(а) верно", "חישבתם נכון"),
  calcTry: L("Расчёт получился не сразу, и это нормально: теперь ты знаешь, как считать.", "החישוב לא יצא מיד, וזה בסדר: עכשיו אתם יודעים איך מחשבים."),
};

const TOPIC = { money: "💰", people: "🤝", mind: "🧠" } as const;

function DebriefCard({ mission, e, lang }: { mission: Mission; e: LogEntry; lang: "ru" | "he" }) {
  const sc = mission.scenes.find((x) => x.id === e.id);
  if (!sc || (sc.kind !== "choice" && sc.kind !== "input" && sc.kind !== "split" && sc.kind !== "find")) return null;
  const title = (sc.title ? sc.title[lang] : sc.id);
  const book = sc.book ? BOOK_LABEL[sc.book as keyof typeof BOOK_LABEL] : null;
  let mid: React.ReactNode = null;
  if (sc.kind === "choice") {
    const chosen = sc.options[e.c];
    const r = chosen.apply(e.v);
    mid = (
      <>
        <p>
          <b>{ui.youChose[lang]}:</b> {tx(chosen.label, e.v, lang)}
        </p>
        <p>
          <b>{ui.happened[lang]}:</b> {r.outcome[lang]}
        </p>
        <p>
          <b>{ui.ifOther[lang]}</b>
        </p>
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {sc.options.map((o, i) =>
            i === e.c || o.disabled?.(e.v) ? null : (
              <li key={i} style={{ marginBottom: 6 }}>
                <b>{tx(o.label, e.v, lang)}</b>: {o.apply(e.v).outcome[lang]}
              </li>
            )
          )}
        </ul>
      </>
    );
  } else if (sc.kind === "split" && e.a) {
    const r = sc.apply(e.a, e.v);
    mid = (
      <>
        <p>
          <b>{ui.youChose[lang]}:</b>{" "}
          {sc.parts.map((p, i) => `${tx(p.label, e.v, lang)} ${e.a![i]}`).join(" · ")}
        </p>
        <p>
          <b>{ui.happened[lang]}:</b> {r.outcome[lang]}
        </p>
      </>
    );
  } else if (sc.kind === "find") {
    mid = (
      <p>
        <b>{ui.happened[lang]}:</b> 🚩 {e.c}/{sc.items.filter((i) => i.bad).length}
      </p>
    );
  } else if (sc.kind === "input") {
    const r = sc.apply(e.c, e.v);
    mid = (
      <>
        <p>
          <b>{ui.yourNum[lang]}:</b> {e.c} {sc.unit ?? ""}
        </p>
        <p>
          <b>{ui.happened[lang]}:</b> {r.outcome[lang]}
        </p>
      </>
    );
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        {sc.topic ? TOPIC[sc.topic] + " " : ""}
        {title}
      </h3>
      {mid}
      {sc.lesson && (
        <p className="muted">
          💡 {book ? `${ui.fromBook[lang]} «${book[lang]}»: ` : ""}
          {sc.lesson[lang]}
        </p>
      )}
    </div>
  );
}

const LESSONS = [
  L("Сначала плати себе: часть денег откладывай сразу.", "קודם משלמים לעצמך: מפרישים חלק מהכסף מיד."),
  L("Выручка ≠ прибыль. Считай расходы.", "הכנסה ≠ רווח. סופרים הוצאות."),
  L("Репутация — невидимый капитал.", "מוניטין הוא הון בלתי נראה."),
  L("Маленькие шаги каждый день сильнее рывка.", "צעדים קטנים כל יום חזקים יותר מקפיצה אחת."),
  L("Не веди себя как зритель: создавай, а не только листай.", "לא רק לצפות: ליצור ולא רק לגלול."),
  L("Слово «пока» превращает ошибку в урок.", "המילה ״עדיין״ הופכת טעות לשיעור."),
];

export default function MissionPage() {
  const { s, lang, ready, startMission, advanceMission, finishMission, abandonMission, addBadge } = useGame();
  const [res, setRes] = useState<Result | null>(null);
  const [num, setNum] = useState<number>(0);
  const [wrong, setWrong] = useState(false);
  const [sel, setSel] = useState<boolean[]>([]);
  const [alloc, setAlloc] = useState<number[]>([]);
  const [combo, setCombo] = useState(0);
  const [breakOpen, setBreakOpen] = useState(false);
  const t0 = useRef(Date.now());
  const [nudge, setNudge] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [slide, setSlide] = useState({ i: 0, n: 1 });
  const picks = useRef<number[]>([]);
  const softRun = useRef(0);
  const [celebrate, setCelebrate] = useState<null | { xp: number; balance: number; v: V; m: Mission }>(null);

  const run = s.run;
  const mission = run ? missionById(run.id) : undefined;
  const scene: Scene | undefined = mission && run ? mission.scenes[run.idx] : undefined;

  // сбрасываем локальное состояние при смене сцены
  useEffect(() => {
    setRes(null);
    setWrong(false);
    setNudge(null);
    setTries(0);
    setSlide({ i: 0, n: 1 });
    t0.current = Date.now();
    if (mission && scene && scene.kind === "input" && run) setNum(scene.initial(run.vars));
    if (scene && scene.kind === "find") setSel(scene.items.map(() => false));
    if (scene && scene.kind === "split" && run) setAlloc(scene.parts.map((p) => p.min ?? 0));
  }, [run?.idx, run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCombo(0);
    picks.current = [];
    softRun.current = 0;
  }, [run?.id]);

  // Если ребёнок завис, Финни задаёт один наводящий вопрос (один раз на сцену).
  useEffect(() => {
    if (!scene || !run || res) return;
    if (!["choice", "calc", "find", "split", "input"].includes(scene.kind)) return;
    const topic = ("topic" in scene && scene.topic ? scene.topic : "default") as "money" | "people" | "mind" | "default";
    const id = setTimeout(() => {
      setNudge((cur) => cur ?? nudgePick(IDLE[topic], lang, (run?.idx ?? 0) * 7 + (run?.xp ?? 0)));
      sfx("tick");
    }, 22000);
    return () => clearTimeout(id);
  }, [run?.idx, run?.id, !!res, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (celebrate) {
      sfx("win");
      music.setMood("win"); // короткое мажорное арпеджио, затем музыка сама вернётся в calm
    }
  }, [celebrate]);

  if (!ready) return null;

  const today = todayKey();
  const usedToday = s.missionDay === today ? s.missionCount : 0;
  const limitReached = usedToday >= s.missionsPerDay;

  if (celebrate && !run) {
    const { m, v } = celebrate;
    return (
      <>
        <div className="card good">
          <Burst emojis={["🏆", "🪙", "🎉", "⭐", "✨"]} count={30} />
          <h1>🏆 {ui.done[lang]}</h1>
          <p>
            {m.summary(v).map((r, i) => (
              <span key={i}>
                {r.label[lang]}: <b>{typeof r.value === "string" ? r.value : r.value[lang]}</b>
                <br />
              </span>
            ))}
          </p>
          <p>
            🐷 {ui.toBalance[lang]}: <b>+{celebrate.balance} ₪</b>
            <br />⭐ {ui.xp[lang]}: <b>{celebrate.xp}</b>
          </p>
        </div>
        <ShareBox title={m.title[lang]} />
        {m.teaser && (
          <div className="card hero">
            <h2>🔜 {ui.tomorrow[lang]}</h2>
            <p>{m.teaser[lang]}</p>
          </div>
        )}
        <Link className="btn" href="/">
          🏠 OK
        </Link>
      </>
    );
  }

  // ---------- список ----------
  if (!run || !mission || !scene) {
    return (
      <>
        <h1>🗺️ {ui.season[lang]}</h1>
        <p className="muted">
          {ui.seasonNote[lang]} · {s.missionsDone.filter((id) => MISSIONS.some((m) => m.id === id)).length}/{MISSIONS.length}
        </p>
        <div className="bar" style={{ marginBottom: 12 }}>
          <span style={{ width: `${Math.round((100 * s.missionsDone.filter((id) => MISSIONS.some((m) => m.id === id)).length) / MISSIONS.length)}%` }} />
        </div>
        {limitReached && <div className="card warn">{ui.limit[lang]}</div>}
        {MISSIONS.map((m, i) => {
          const done = s.missionsDone.includes(m.id);
          const prevDone = i === 0 || s.missionsDone.includes(MISSIONS[i - 1].id);
          const locked = !done && !prevDone;
          return (
            <div key={m.id} className="card" style={locked ? { opacity: 0.55 } : undefined}>
              <p className="muted" style={{ margin: 0 }}>
                {ui.day[lang]} {i + 1} {done ? "✅" : locked ? "🔒" : ""}
              </p>
              <h2 style={{ marginTop: 4 }}>
                {m.icon} {m.title[lang]}
              </h2>
              {!locked && <p>{m.blurb[lang]}</p>}
              <p className="muted">
                ⏱️ ~{m.minutes} {lang === "he" ? "דק׳" : "мин"}
                {!locked && <> · 📚 {m.books.map((b) => BOOK_LABEL[b as keyof typeof BOOK_LABEL]?.[lang] ?? b).join(", ")}</>}
              </p>
              {!locked && (
                <button
                  className="btn"
                  disabled={limitReached}
                  onClick={() => startMission(m.id, m.initialVars, firstIndex(m.scenes, m.initialVars))}
                >
                  {done ? ui.again[lang] : ui.start[lang]}
                </button>
              )}
              {locked && <p className="muted">{ui.locked[lang]}</p>}
            </div>
          );
        })}
      </>
    );
  }

  // ---------- сцена ----------
  const v = run.vars;
  const idx = run.idx;
  const total = mission.scenes.length;
  const pct = Math.round((idx / (total - 1)) * 100);

  const go = (patch: Record<string, number>, xp: number, badge?: string, c?: number, a?: number[]) => {
    if (badge) addBadge(badge);
    const log: LogEntry | undefined = c === undefined ? undefined : { id: scene.id, c, v: { ...v }, ...(a ? { a } : {}) };
    advanceMission(idx, nextIndex(mission.scenes, idx, { ...v, ...patch }), patch, xp, log);
  };

  const comboStep = (good: boolean) => {
    const n = good ? combo + 1 : 0;
    setCombo(n);
    return good && n >= 3 && n % 2 === 1 ? 5 : 0;
  };
  const speedOk = () => s.fxSpeed && Date.now() - t0.current <= 20000;

  const ResultBox = ({ r, cls = "good", children }: { r: Result; cls?: string; children?: React.ReactNode }) => (
    <div className={`card ${cls}`}>
      <Burst emojis={r.mood === "soft" ? ["💡", "✨"] : ["🪙", "✨", "⭐", "🎉"]} count={r.mood === "soft" ? 6 : 16} />
      <ResultText text={r.outcome} lang={lang} />
      {children}
      <div style={{ marginTop: 8 }}>
      <span className="xpfly" key={idx}>
        +{r.xp + (r.bonus ?? 0)} XP
      </span>
      {(r.bonus ?? 0) > 0 && (
        <span className="pill combo" style={{ marginInlineStart: 8 }}>
          {combo >= 3 ? `🔥 x${combo} ` : "⚡ "}+{r.bonus}
        </span>
      )}
      </div>
    </div>
  );

  const Status = () => (
    <div className="row" style={{ marginBottom: 8 }}>
      <span className="pill">💰 {v.cash} ₪</span>
      {v.qty > 0 && <span className="pill">📦 {v.stock}</span>}
      {v.price > 0 && <span className="pill">🏷️ {v.price} ₪</span>}
      <span className="pill pop" key={run.xp}>⭐ +{run.xp} XP</span>
      {combo >= 2 && <span className="pill combo" key={combo}>🔥 x{combo}</span>}
    </div>
  );

  const Head = () => (
    <>
      <Segments total={total} idx={idx} />
      <Status />
      {scene.chapter && (
        <p className="pill" style={{ marginBottom: 8 }}>
          📖 {scene.chapter[lang]}
        </p>
      )}
      <Stage
        kind={scene.kind}
        emoji={"icon" in scene && scene.icon ? scene.icon : "🦝"}
        title={"title" in scene && scene.title ? scene.title[lang] : undefined}
        missionId={mission.id}
        sceneId={scene.id}
        slide={slide.i}
        slides={slide.n}
        hero={s.hero}
        lang={lang}
        seed={idx + (res ? res.xp : 0)}
        say={nudge}
        mood={scene.kind === "end" || scene.kind === "story" || scene.kind === "offline" ? undefined : res ? (res.mood ?? (res.good === false ? "soft" : "good")) : undefined}
        popKey={`${idx}-${res ? 1 : 0}`}
      />
      {breakHint && (
        <p className="pill" style={{ marginBottom: 8 }}>
          🧘 {lang === "he" ? "כבר זמן מה. אולי הפסקה קטנה?" : "Ты уже давно в игре. Может, мини-разминка?"}
        </p>
      )}
    </>
  );

  const breakHint = idx > 0 && idx % 8 === 0 && !res;
  const Footer = () => (
    <div className="row" style={{ marginTop: 14, gap: 8, flexWrap: "wrap" }}>
      <button className="btn secondary" style={{ padding: "10px 14px", fontSize: 15 }} onClick={() => setBreakOpen(true)}>
        🧘 {lang === "he" ? "הפסקה" : "Перерыв"}
      </button>
      <button className="btn secondary" style={{ padding: "10px 14px", fontSize: 15 }} onClick={() => (window.location.href = "/")}>
        ⏸️ {lang === "he" ? "השהיה" : "Пауза"}
      </button>
      <button
        className="btn secondary"
        style={{ padding: "10px 14px", fontSize: 15 }}
        onClick={() => {
          if (confirm(ui.quit[lang] + "?")) abandonMission();
        }}
      >
        ✖
      </button>
    </div>
  );

  const hookText = scene.hook ? tx(scene.hook, v, lang) : "";
  const Hook = () =>
    hookText ? (
      <p className="muted" style={{ margin: "10px 0 4px", fontWeight: 600 }}>
        🔜 {hookText}
      </p>
    ) : null;

  let body: React.ReactNode = null;

  if (scene.kind === "story" || scene.kind === "offline") {
    const patch = scene.kind === "story" && scene.apply ? clean(scene.apply(v)) : {};
    body = (
      <>
        {scene.kind === "offline" ? (
          <>
            <p className="scenario">{tx(scene.text, v, lang)}</p>
            <Hook />
            <button className="btn" onClick={() => go(patch, scene.xp ?? 0)}>
              {ui.next[lang]}
            </button>
          </>
        ) : (
          <>
            <Slides text={tx(scene.text, v, lang)} nextLabel={ui.next[lang]} tapLabel={lang === "he" ? "👆 הקישו להמשך" : "👆 тап, чтобы читать дальше"} onTick={() => sfx("tick")} onIndex={(i, n) => setSlide((o) => (o.i === i && o.n === n ? o : { i, n }))} onDone={() => { sfx("good"); go(patch, scene.xp ?? 0); }} />
            <Hook />
          </>
        )}
      </>
    );
  } else if (scene.kind === "choice") {
    body = res ? (
      <>
        <ResultBox r={res} />
        <Hook />
        <button className="btn" onClick={() => go(res.patch, res.xp + (res.bonus ?? 0), res.badge, res.c)}>
          {ui.next[lang]}
        </button>
      </>
    ) : (
      <>
        <p className="scenario">{tx(scene.text, v, lang)}</p>
        {s.fxSpeed && <BonusTimer seconds={20} resetKey={`${run.id}-${idx}`} lang={lang} />}
        <div className="options">
          {scene.options.map((o, i) => (
            <button
              key={i}
              className="option"
              disabled={o.disabled?.(v)}
              onClick={() => {
                const r = o.apply(v);
                const best = Math.max(...scene.options.filter((x) => !x.disabled?.(v)).map((x) => x.apply(v).xp));
                const good = r.xp >= best * 0.7;
                const bonus = comboStep(good) + (speedOk() ? 5 : 0);
                picks.current = [...picks.current, i].slice(-3);
                softRun.current = good ? 0 : softRun.current + 1;
                const longText = tx(scene.text, v, lang).length > 110;
                if (picks.current.length === 3 && picks.current.every((p) => p === i) && scene.options.length > 2) setNudge(nudgePick(SAME, lang, idx));
                else if (softRun.current >= 2) setNudge(nudgePick(SOFT2, lang, idx));
                else if (longText && Date.now() - t0.current < 2500) setNudge(nudgePick(FAST, lang, idx));
                sfx(bonus >= 5 && good ? "combo" : good ? "good" : "soft");
                setRes({ outcome: r.outcome[lang], patch: clean(r.vars), xp: r.xp, badge: r.badge, c: i, bonus, mood: good ? "good" : "soft" });
              }}
            >
              {tx(o.label, v, lang)}
            </button>
          ))}
        </div>
      </>
    );
  } else if (scene.kind === "calc") {
    const patch = scene.apply ? clean(scene.apply(v)) : {};
    body = res ? (
      <>
        <ResultBox r={res} cls={res.good ? "good" : "warn"} />
        <Hook />
        <button className="btn" onClick={() => go(patch, res.xp + (res.bonus ?? 0), undefined, res.good ? 1 : 0)}>
          {ui.next[lang]}
        </button>
      </>
    ) : (
      <>
        <p className="scenario">{tx(scene.text, v, lang)}</p>
        <label htmlFor="ans">{ui.yourAnswer[lang]}</label>
        <input id="ans" type="number" inputMode="decimal" value={Number.isNaN(num) ? "" : num} onChange={(e) => setNum(e.target.value === "" ? NaN : Number(e.target.value))} />
        <p>
          <button
            className="btn"
            disabled={Number.isNaN(num)}
            onClick={() => {
              const good = num === scene.answer(v);
              if (!good && tries < 2) {
                setTries(tries + 1);
                setNudge(nudgePick(CALC_LADDER[tries], lang, idx + tries));
                sfx("soft");
                return;
              }
              setNudge(null);
              setWrong(!good);
              const bonus = comboStep(good);
              sfx(good ? (bonus ? "combo" : "good") : "soft");
              setRes({
                good,
                outcome: tx(good ? scene.ok : scene.bad, v, lang),
                patch: {},
                xp: good ? scene.xp : 5,
                c: good ? 1 : 0,
                bonus,
                mood: good ? "good" : "soft",
              });
            }}
          >
            {ui.check[lang]}
          </button>
        </p>
      </>
    );
  } else if (scene.kind === "input") {
    const lo = scene.min(v);
    const hi = Math.max(lo, scene.max(v));
    const val = Math.min(hi, Math.max(lo, Number.isNaN(num) ? lo : num));
    body = res ? (
      <>
        <ResultBox r={res} />
        <Hook />
        <button className="btn" onClick={() => go(res.patch, res.xp, undefined, res.c, res.a)}>
          {ui.next[lang]}
        </button>
      </>
    ) : (
      <>
        <p className="scenario">{tx(scene.text, v, lang)}</p>
        <p style={{ fontSize: 32, fontWeight: 800, margin: "8px 0" }}>
          {val} {unitText(scene.unit, lang)}
        </p>
        <input
          type="range"
          min={lo}
          max={hi}
          value={val}
          onChange={(e) => setNum(Number(e.target.value))}
          style={{ width: "100%" }}
          aria-label={lang === "he" ? "ערך" : "Значение"}
        />
        <p>
          <button
            className="btn"
            onClick={() => {
              const r = scene.apply(val, v);
              setRes({ outcome: r.outcome[lang], patch: clean(r.vars), xp: scene.xp, c: val });
            }}
          >
            OK
          </button>
        </p>
      </>
    );
  } else if (scene.kind === "find") {
    const bads = scene.items.filter((i) => i.bad).length;
    body = res ? (
      <>
        <div className="card good">
          <Burst count={14} />
          <p className="headline">{res.outcome}</p>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {scene.items.map((it, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {it.bad ? "🚩" : "✅"} <b>{tx(it.text, v, lang)}</b>: {it.why[lang]}
              </li>
            ))}
          </ul>
          <b>+{res.xp} XP</b>
        </div>
        <Hook />
        <button className="btn" onClick={() => go(res.patch, res.xp, undefined, res.c)}>
          {ui.next[lang]}
        </button>
      </>
    ) : (
      <>
        <p className="scenario">{tx(scene.text, v, lang)}</p>
        <p className="muted">{ui.findNote[lang]}</p>
        <div className="options">
          {scene.items.map((it, i) => (
            <button
              key={i}
              className="option"
              style={sel[i] ? { borderColor: "var(--brand)", background: "#fff4e5" } : undefined}
              onClick={() => setSel((s0) => s0.map((x, j) => (j === i ? !x : x)))}
            >
              {sel[i] ? "🚩 " : "◻️ "}
              {tx(it.text, v, lang)}
            </button>
          ))}
        </div>
        <p>
          <button
            className="btn"
            onClick={() => {
              let hits = 0, falseA = 0, misses = 0;
              scene.items.forEach((it, i) => {
                if (it.bad && sel[i]) hits++;
                else if (it.bad) misses++;
                else if (sel[i]) falseA++;
              });
              const xp = Math.max(4, Math.round((scene.xp * Math.max(0, hits - falseA)) / Math.max(1, bads)));
              const patch = clean(scene.apply?.({ hits, misses, false: falseA }, v));
              setRes({
                outcome: ui.findResult[lang].replace("{h}", String(hits)).replace("{b}", String(bads)).replace("{f}", String(falseA)),
                patch,
                xp,
                c: hits,
              });
            }}
          >
            {ui.check[lang]}
          </button>
        </p>
      </>
    );
  } else if (scene.kind === "split") {
    const total = scene.total(v);
    const used = alloc.reduce((a, b) => a + b, 0);
    const left = total - used;
    body = res ? (
      <>
        <ResultBox r={res} />
        <Hook />
        <button className="btn" onClick={() => go(res.patch, res.xp, undefined, res.c, res.a)}>
          {ui.next[lang]}
        </button>
      </>
    ) : (
      <>
        <p className="scenario">{tx(scene.text, v, lang)}</p>
        <p style={{ fontSize: 22, fontWeight: 800 }}>
          {ui.left[lang]}: {left} {unitText(scene.unit ?? "₪", lang)}
        </p>
        {scene.parts.map((p, i) => {
          const maxP = p.max ? p.max(v) : total;
          return (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <span className="grow">{tx(p.label, v, lang)}</span>
              <button className="btn secondary" disabled={alloc[i] - scene.step < (p.min ?? 0)} onClick={() => setAlloc((a) => a.map((x, j) => (j === i ? x - scene.step : x)))}>
                −
              </button>
              <b style={{ minWidth: 40, textAlign: "center" }}>{alloc[i] ?? 0}</b>
              <button className="btn secondary" disabled={left < scene.step || alloc[i] + scene.step > maxP} onClick={() => setAlloc((a) => a.map((x, j) => (j === i ? x + scene.step : x)))}>
                +
              </button>
            </div>
          );
        })}
        <p>
          <button
            className="btn"
            disabled={left !== 0}
            onClick={() => {
              const r = scene.apply(alloc, v);
              setRes({ outcome: r.outcome[lang], patch: clean(r.vars), xp: scene.xp, c: 0, a: alloc });
            }}
          >
            OK
          </button>
        </p>
      </>
    );
  } else if (scene.kind === "end") {
    const bonus = 30;
    const gain = mission.balanceGain(v);
    body = (
      <>
        <p>
          {mission.summary(v).map((r, i) => (
            <span key={i}>
              {r.label[lang]}: <b>{typeof r.value === "string" ? r.value : r.value[lang]}</b>
              <br />
            </span>
          ))}
        </p>
        <h2>🔍 {ui.debrief[lang]}</h2>
        <p className="muted">{ui.debriefNote[lang]}</p>
        {(run.log ?? []).map((e, i) => (
          <DebriefCard key={i} mission={mission} e={e} lang={lang} />
        ))}
        <div className="card good">
          <h2>🧠 {ui.takeaways[lang]}</h2>
          <p>💰 {mission.takeaways.money[lang]}</p>
          <p>🤝 {mission.takeaways.people[lang]}</p>
        </div>
        <button
          className="btn"
          onClick={() => {
            setCelebrate({ xp: run.xp + bonus, balance: gain, v: { ...v }, m: mission });
            finishMission(mission.id, bonus, gain, mission.badges(v));
          }}
        >
          🏆 {ui.done[lang]}
        </button>
      </>
    );
  }

  return (
    <div className="card">
      {breakOpen && <BreakOverlay lang={lang} onClose={() => setBreakOpen(false)} />}
      <Head />
      {body}
      {scene.kind !== "end" && <Footer />}
    </div>
  );
}
