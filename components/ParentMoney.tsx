"use client";

import { useState } from "react";
import { useGame } from "@/lib/store";
import { addEntry, applyBridge, bridgeable, fmt, ledgerBalance, ledgerCsv, LIMITS, negotiate, parentConfirm, parentCreate, parentReturn, type Job, type LedgerEntry, type Res } from "@/lib/real";

const RATES = [0, 5, 10, 20, 50, 100];

export default function ParentMoney() {
  const { s, lang, update } = useGame();
  const L = (ru: string, he: string) => (lang === "he" ? he : ru);
  const r = s.real;
  const [msg, setMsg] = useState("");
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [nt, setNt] = useState("");
  const [nd, setNd] = useState("");
  const [np, setNp] = useState("");
  const [pay, setPay] = useState("");
  const [payNote, setPayNote] = useState("");
  const [copied, setCopied] = useState(false);

  const run = (res: Res, ok?: () => void) => {
    if ("error" in res) {
      setMsg(res.error === "price" ? L(`Цена от ${LIMITS.minShekel} до ${LIMITS.maxShekel} ₪`, `מחיר בין ${LIMITS.minShekel} ל-${LIMITS.maxShekel} ₪`) : res.error === "title" ? L("Опишите дело (от 3 букв)", "תארו את המשימה (3 אותיות לפחות)") : L("Не получилось", "לא הצליח"));
      return;
    }
    setMsg("");
    update({ real: res.real });
    ok?.();
  };

  const balance = ledgerBalance(r);
  const bridge = bridgeable(r);
  const needsParent = r.jobs.filter((j) => (j.status === "negotiating" && j.turn === "parent") || j.status === "claimed");
  const others = r.jobs.filter((j) => !needsParent.includes(j) && j.status !== "closed" && j.status !== "paid");
  const label = (j: Job) => (j.status === "negotiating" ? (j.turn === "child" ? L("ждём ответ ребёнка", "מחכים לתשובת הילדה") : L("ждёт вас", "מחכה לכם")) : j.status === "agreed" ? L("договорились, выполняется", "סגרנו, בביצוע") : j.status === "claimed" ? L("ребёнок сделал(а): проверьте", "הילדה סיימה: בדקו") : "");

  // подписи типов записей журнала (раньше показывались английские коды)
  const kindLabel = (k: LedgerEntry["kind"]) =>
    k === "job" ? L("заказ", "הזמנה") : k === "match" ? L("надбавка", "תוספת") : k === "bridge" ? L("мост", "גשר") : k === "payout" ? L("выплата", "תשלום") : L("корректировка", "תיקון");
  // старые записи моста хранили русский текст «игр. ₪»: показываем нейтрально
  const noteText = (e: LedgerEntry) => (e.kind === "bridge" ? e.note.replace(/\s*игр\.\s*/, " ") : e.note);

  async function copy() {
    try {
      await navigator.clipboard.writeText(ledgerCsv(r));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg(L("Копирование не удалось. Скачайте файл.", "ההעתקה נכשלה. הורידו קובץ."));
    }
  }
  function download() {
    const blob = new Blob(["﻿" + ledgerCsv(r)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "finni-ledger.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="card">
      <h2>💵 {L("Реальные деньги (по желанию)", "כסף אמיתי (לפי שיקולכם)")}</h2>
      <p className="muted">
        {L(
          "Это только учёт. Приложение ничего не переводит: вы решаете, платить ли и как. Журнал хранится в браузере этого устройства. Очистка данных браузера его удалит, поэтому периодически копируйте журнал ниже.",
          "זה רק רישום. האפליקציה לא מעבירה כסף: אתם מחליטים אם ואיך לשלם. היומן נשמר בדפדפן של המכשיר. ניקוי נתוני הדפדפן ימחק אותו, לכן העתיקו אותו מדי פעם."
        )}
      </p>
      <p>
        <b>{L("В копилке мечты (по журналу)", "בקופת החלומות (לפי היומן)")}: {fmt(balance)}</b>
        {s.dreamGoal && ` · 🎯 ${s.dreamGoal} (${s.dreamPrice} ₪)`}
      </p>

      <h3>{L("Заказы, которые ждут вас", "הזמנות שמחכות לכם")}</h3>
      {needsParent.length === 0 && <p className="muted">{L("Пока ничего.", "אין כרגע.")}</p>}
      {needsParent.map((j) => (
        <div key={j.id} className="card" style={{ background: "#fffaf0", marginTop: 8 }}>
          <b>
            {j.title} · {fmt(j.price)}
          </b>
          {j.doneWhen && <p className="muted">🎯 {j.doneWhen}</p>}
          <p className="muted">{label(j)}</p>
          {j.status === "negotiating" && (
            <>
              <div className="row">
                <button className="btn" onClick={() => run(negotiate(r, j.id, "parent", { t: "accept" }))}>
                  {L("Принять", "לקבל")} {fmt(j.price)}
                </button>
                <button className="btn secondary" onClick={() => run(negotiate(r, j.id, "parent", { t: "decline" }))}>
                  {L("Отклонить", "לדחות")}
                </button>
              </div>
              {j.events.filter((e) => e.kind === "counter").length < LIMITS.maxCounters && (
                <div className="row" style={{ marginTop: 8 }}>
                  <input type="number" inputMode="numeric" style={{ maxWidth: 120 }} placeholder="₪" value={counter[j.id] ?? ""} onChange={(e) => setCounter({ ...counter, [j.id]: e.target.value })} />
                  <button className="btn secondary" disabled={!counter[j.id]} onClick={() => run(negotiate(r, j.id, "parent", { t: "counter", shekel: Number(counter[j.id]) }))}>
                    {L("Предложить свою цену", "להציע מחיר משלכם")}
                  </button>
                </div>
              )}
            </>
          )}
          {j.status === "claimed" && (
            <div className="row">
              <button className="btn" onClick={() => run(parentConfirm(r, j.id))}>
                ✅ {L("Подтвердить и записать", "לאשר ולרשום")} {fmt(j.price)}
                {r.matchPct > 0 ? ` +${r.matchPct}%` : ""}
              </button>
              <button className="btn secondary" onClick={() => run(parentReturn(r, j.id))}>
                {L("Вернуть на доработку", "להחזיר לתיקון")}
              </button>
            </div>
          )}
        </div>
      ))}
      {others.length > 0 && (
        <p className="muted" style={{ marginTop: 8 }}>
          {L("В работе / у ребёнка", "בתהליך / אצל הילדה")}: {others.map((j) => `${j.title} (${fmt(j.price)}, ${label(j)})`).join("; ")}
        </p>
      )}

      <h3 style={{ marginTop: 14 }}>{L("Предложить заказ самим", "להציע הזמנה בעצמכם")}</h3>
      <input type="text" placeholder={L("Что сделать", "מה לעשות")} value={nt} maxLength={LIMITS.titleMax} onChange={(e) => setNt(e.target.value)} />
      <input type="text" placeholder={L("Готово, когда…", "מוכן כש…")} value={nd} maxLength={120} onChange={(e) => setNd(e.target.value)} style={{ marginTop: 6 }} />
      <div className="row" style={{ marginTop: 6 }}>
        <input type="number" inputMode="numeric" placeholder="₪" style={{ maxWidth: 120 }} value={np} onChange={(e) => setNp(e.target.value)} />
        <button
          className="btn secondary"
          disabled={!nt.trim() || !np}
          onClick={() =>
            run(parentCreate(r, nt, nd, Number(np)), () => {
              setNt("");
              setNd("");
              setNp("");
            })
          }
        >
          {L("Предложить", "להציע")}
        </button>
      </div>
      {msg && <p style={{ color: "#c0392b", fontWeight: 700 }}>{msg}</p>}

      <h3 style={{ marginTop: 18 }}>{L("Надбавка к заказам", "תוספת להזמנות")}</h3>
      <select value={r.matchPct} onChange={(e) => update({ real: { ...r, matchPct: Number(e.target.value) } })}>
        {[0, 10, 25, 50, 100].map((p) => (
          <option key={p} value={p}>
            {p === 0 ? L("Нет", "ללא") : `+${p}%`}
            {p === 100 ? L(" (рубль на рубль)", " (שקל על שקל)") : ""}
          </option>
        ))}
      </select>
      <p className="muted">{L("Родитель-инвестор добавляет процент к каждой подтверждённой выплате: ребёнок на практике видит, как работают проценты.", "ההורה־משקיע מוסיף אחוז לכל תשלום מאושר: הילדה רואה בפועל איך עובדים אחוזים.")}</p>

      <h3 style={{ marginTop: 18 }}>🌉 {L("Мост: игровые ₪ → настоящие (выключен)", "גשר: שקלי משחק ← אמיתיים (כבוי)")}</h3>
      <p className="muted">
        {L(
          "По умолчанию игровые ₪ НЕ превращаются в настоящие. Если хотите, задайте курс и недельный лимит. Зачисляете вы сами кнопкой ниже.",
          "כברירת מחדל שקלי המשחק לא הופכים לאמיתיים. אם תרצו, קבעו שער ותקרה שבועית. אתם מזכים בעצמכם בלחיצה."
        )}
      </p>
      <label htmlFor="rt">{L("Курс: за 1 игровой ₪", "שער: לכל שקל משחק")}</label>
      <select id="rt" value={r.rate} onChange={(e) => update({ real: { ...r, rate: Number(e.target.value) } })}>
        {RATES.map((a) => (
          <option key={a} value={a}>
            {a === 0 ? L("0 — выключено", "0 — כבוי") : `${a} ${L("агорот", "אגורות")}`}
          </option>
        ))}
      </select>
      <label htmlFor="cp">{L("Лимит в неделю, ₪ (0 = мост не работает)", "תקרה שבועית, ₪ (0 = הגשר לא פועל)")}</label>
      <input id="cp" type="number" inputMode="numeric" min={0} max={1000} value={r.weeklyCap / 100} onChange={(e) => update({ real: { ...r, weeklyCap: Math.max(0, Math.min(100000, Math.round(Number(e.target.value || 0) * 100))) } })} />
      {r.rate > 0 && r.weeklyCap > 0 && (
        <p>
          {L("На этой неделе заработано игровых", "השבוע הרוויחה במשחק")}: {r.weekGame} ₪ · {L("можно зачесть", "אפשר לזכות")}: <b>{fmt(bridge)}</b>{" "}
          <button className="btn secondary" disabled={bridge <= 0} onClick={() => run(applyBridge(r))}>
            {L("Зачислить", "לזכות")}
          </button>
        </p>
      )}

      <h3 style={{ marginTop: 18 }}>📒 {L("Журнал", "יומן")}</h3>
      {r.ledger.length === 0 && <p className="muted">{L("Пока пусто.", "ריק כרגע.")}</p>}
      <div style={{ maxHeight: 220, overflow: "auto" }}>
        {[...r.ledger].reverse().slice(0, 40).map((e) => (
          <p key={e.id} style={{ margin: "4px 0" }}>
            <span className="muted">{new Date(e.ts).toLocaleDateString(lang === "he" ? "he-IL" : "ru-RU")}</span> · {kindLabel(e.kind)} · <bdi style={{ fontWeight: 700, color: e.amount < 0 ? "#c0392b" : undefined }}>{fmt(e.amount)}</bdi> · <bdi>{noteText(e)}</bdi>
          </p>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input type="number" inputMode="decimal" placeholder="₪" style={{ maxWidth: 110 }} value={pay} onChange={(e) => setPay(e.target.value)} />
        <input type="text" placeholder={L("Заметка", "הערה")} value={payNote} maxLength={80} onChange={(e) => setPayNote(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button
          className="btn secondary"
          disabled={!pay}
          onClick={() =>
            run(addEntry(r, "payout", Number(pay), payNote || L("выплата", "תשלום")), () => {
              setPay("");
              setPayNote("");
            })
          }
        >
          {L("Записать выплату (−)", "לרשום תשלום (−)")}
        </button>
        <button
          className="btn secondary"
          disabled={!pay}
          onClick={() =>
            run(addEntry(r, "adjust", Number(pay), payNote || L("корректировка", "תיקון")), () => {
              setPay("");
              setPayNote("");
            })
          }
        >
          {L("Корректировка (±)", "תיקון (±)")}
        </button>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn secondary" onClick={copy}>
          📋 {copied ? L("Скопировано!", "הועתק!") : L("Скопировать журнал", "להעתיק יומן")}
        </button>
        <button className="btn secondary" onClick={download}>
          ⬇️ CSV
        </button>
      </div>
    </div>
  );
}
