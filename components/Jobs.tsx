"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { childClaim, childPropose, closeJob, fmt, LIMITS, negotiate, type Job, type Res } from "@/lib/real";

const ERR: Record<string, { ru: string; he: string }> = {
  title: { ru: "Напиши, что именно сделаешь (хотя бы 3 буквы).", he: "כתבי מה בדיוק תעשי (לפחות 3 אותיות)." },
  price: { ru: `Цена от ${LIMITS.minShekel} до ${LIMITS.maxShekel} ₪.`, he: `מחיר בין ${LIMITS.minShekel} ל-${LIMITS.maxShekel} ₪.` },
  private: { ru: "Тут нельзя писать телефон, адрес и другие личные данные. Опиши дело словами.", he: "אסור לכתוב כאן טלפון, כתובת או מידע אישי. תארי את המשימה במילים." },
  too_many: { ru: "Сначала доведи до конца открытые заказы (не больше 5).", he: "קודם סיימי את ההזמנות הפתוחות (עד 5)." },
  bad_state: { ru: "Сейчас так нельзя: обновись и попробуй ещё раз.", he: "כרגע אי אפשר: רעננו ונסו שוב." },
  not_found: { ru: "Заказ не найден.", he: "ההזמנה לא נמצאה." },
};

export default function Jobs() {
  const { s, lang, update, addXp, addBadge } = useGame();
  const L = (ru: string, he: string) => (lang === "he" ? he : ru);
  const [title, setTitle] = useState("");
  const [done, setDone] = useState("");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");
  const [counter, setCounter] = useState<Record<string, string>>({});
  const jobs = s.real.jobs;
  const opened = jobs.filter((j) => j.status !== "paid" && j.status !== "closed");
  const history = jobs.filter((j) => j.status === "paid" || j.status === "closed");

  useEffect(() => {
    if (jobs.some((j) => j.status === "paid")) addBadge("first_earn");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.map((j) => j.status).join()]);

  const run = (res: Res, onOk?: (j?: Job) => void) => {
    if ("error" in res) {
      const e = ERR[res.error];
      setMsg(e ? e[lang] : res.error);
      return;
    }
    setMsg("");
    update({ real: res.real });
    onOk?.(res.job);
  };

  const propose = () => {
    run(childPropose(s.real, title, done, Number(price)), () => {
      addXp(5);
      setTitle("");
      setDone("");
      setPrice("");
    });
  };

  const statusLine = (j: Job) => {
    if (j.status === "negotiating" && j.turn === "parent") return `⏳ ${L("Ждём ответа родителей", "מחכים לתשובת ההורים")}`;
    if (j.status === "negotiating") return `🤝 ${L("Родители предлагают", "ההורים מציעים")}: ${fmt(j.price)}`;
    if (j.status === "agreed") return `✅ ${L("Договорились", "סגרנו")}: ${fmt(j.price)}`;
    if (j.status === "claimed") return `🕐 ${L("Ждём проверки родителя", "מחכים לבדיקת ההורים")}`;
    return "";
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>💼 {L("Заработать по-настоящему", "להרוויח באמת")}</h2>
      <p className="muted">
        {L(
          "Игровые ₪ виртуальные. Настоящие деньги — за настоящие дела. Назови своё дело и цену. Родители могут согласиться или предложить другую: торгуйся честно!",
          "שקלי המשחק וירטואליים. כסף אמיתי הוא על מעשים אמיתיים. כתבי מה תעשי ובכמה. ההורים יכולים להסכים או להציע מחיר אחר: תתמקחי בהגינות!"
        )}
      </p>

      <label htmlFor="jt">{L("Что сделаю", "מה אעשה")}</label>
      <input id="jt" type="text" value={title} maxLength={LIMITS.titleMax} onChange={(e) => setTitle(e.target.value)} placeholder={L("например: помою машину", "למשל: ארחץ את האוטו")} />
      <label htmlFor="jd">{L("Готово, когда… (необязательно)", "מוכן כש… (לא חובה)")}</label>
      <input id="jd" type="text" value={done} maxLength={120} onChange={(e) => setDone(e.target.value)} placeholder={L("например: снаружи и внутри чисто", "למשל: נקי מבחוץ ומבפנים")} />
      <label htmlFor="jp">{L("Моя цена, ₪", "המחיר שלי, ₪")}</label>
      <input id="jp" type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
      <p style={{ marginTop: 12 }}>
        <button className="btn" onClick={propose} disabled={!title.trim() || !price}>
          {L("Предложить родителям", "להציע להורים")}
        </button>
      </p>
      {msg && <p style={{ color: "#c0392b", fontWeight: 700 }}>{msg}</p>}

      {opened.map((j) => {
        const n = j.events.filter((e) => e.kind === "counter").length;
        const canCounter = n < LIMITS.maxCounters;
        return (
          <div key={j.id} className="card" style={{ marginTop: 12, background: "#fffaf0" }}>
            <b>
              {j.title} · {fmt(j.price)}
            </b>
            {j.doneWhen && <p className="muted">🎯 {j.doneWhen}</p>}
            <p>{statusLine(j)}</p>
            {j.status === "negotiating" && j.turn === "child" && (
              <>
                <div className="row">
                  <button
                    className="btn"
                    onClick={() =>
                      run(negotiate(s.real, j.id, "child", { t: "accept" }), () => {
                        addXp(10);
                        addBadge("job_dealer");
                      })
                    }
                  >
                    {L("Согласна", "מסכימה")}
                  </button>
                  <button className="btn secondary" onClick={() => run(negotiate(s.real, j.id, "child", { t: "decline" }))}>
                    {L("Отказаться", "לוותר")}
                  </button>
                </div>
                {canCounter ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <input type="number" inputMode="numeric" style={{ maxWidth: 120 }} value={counter[j.id] ?? ""} onChange={(e) => setCounter({ ...counter, [j.id]: e.target.value })} placeholder="₪" />
                    <button className="btn secondary" disabled={!counter[j.id]} onClick={() => run(negotiate(s.real, j.id, "child", { t: "counter", shekel: Number(counter[j.id]) }))}>
                      {L("Предложить свою цену", "להציע מחיר משלי")}
                    </button>
                  </div>
                ) : (
                  <p className="muted">{L("Торг окончен: можно согласиться или отказаться.", "המיקוח נגמר: אפשר להסכים או לוותר.")}</p>
                )}
              </>
            )}
            {j.status === "negotiating" && j.turn === "parent" && (
              <button className="btn secondary" onClick={() => run(closeJob(s.real, j.id, "child"))}>
                {L("Отозвать", "לבטל")}
              </button>
            )}
            {j.status === "agreed" && (
              <div className="row">
                <button className="btn" onClick={() => run(childClaim(s.real, j.id))}>
                  ✅ {L("Сделано!", "עשיתי!")}
                </button>
                <button className="btn secondary" onClick={() => run(closeJob(s.real, j.id, "child"))}>
                  {L("Отменить", "לבטל")}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {history.length > 0 && (
        <p className="muted" style={{ marginTop: 10 }}>
          {L("Выполнено и закрыто", "הושלמו ונסגרו")}: {history.filter((j) => j.status === "paid").length} / {history.length}
        </p>
      )}
    </div>
  );
}
