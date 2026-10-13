"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { checkPin, hasPin, isUnlocked, lock, lockedForMs, setPin, touch } from "@/lib/pin";

const tx = {
  ru: {
    title: "Раздел для родителей", create: "Придумайте PIN из 4–6 цифр. Ребёнок его знать не должен.", repeat: "Повторите PIN", enter: "Введите PIN",
    save: "Сохранить PIN", open: "Открыть", bad: "Неверный PIN", mismatch: "PIN не совпадает", short: "Нужно 4–6 цифр", locked: "Слишком много попыток. Подождите",
    min: "мин.", lockNow: "🔒 Закрыть раздел", note: "Если забыли PIN: очистите данные сайта в браузере (но сбросится и прогресс).",
  },
  he: {
    title: "אזור להורים", create: "בחרו PIN של 4–6 ספרות. הילדה לא צריכה לדעת אותו.", repeat: "חזרו על ה-PIN", enter: "הכניסו PIN",
    save: "שמירת PIN", open: "פתיחה", bad: "PIN שגוי", mismatch: "ה-PIN לא תואם", short: "נדרשות 4–6 ספרות", locked: "יותר מדי ניסיונות. המתינו",
    min: "דק׳", lockNow: "🔒 נעילת האזור", note: "אם שכחתם PIN: נקו נתוני אתר בדפדפן (גם ההתקדמות תתאפס).",
  },
};

export default function ParentGate({ children }: { children: React.ReactNode }) {
  const { lang } = useGame();
  const x = tx[lang];
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setPinSet(hasPin());
    setOpen(isUnlocked());
    setReady(true);
  }, []);

  // авто-закрытие через 5 минут бездействия и при уходе со страницы
  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => {
      if (!isUnlocked()) setOpen(false);
    }, 10000);
    const ping = () => touch();
    window.addEventListener("pointerdown", ping);
    window.addEventListener("keydown", ping);
    return () => {
      clearInterval(iv);
      window.removeEventListener("pointerdown", ping);
      window.removeEventListener("keydown", ping);
      lock();
    };
  }, [open]);

  if (!ready) return null;

  if (open)
    return (
      <>
        <p>
          <button className="btn secondary" onClick={() => { lock(); setOpen(false); setA(""); }}>{x.lockNow}</button>
        </p>
        {children}
      </>
    );

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  async function submit() {
    setMsg("");
    if (!pinSet) {
      if (a.length < 4) return setMsg(x.short);
      if (a !== b) return setMsg(x.mismatch);
      await setPin(a);
      setPinSet(true);
      setOpen(true);
      return;
    }
    const r = await checkPin(a);
    if (r === "ok") setOpen(true);
    else if (r === "locked") setMsg(`${x.locked} ${Math.ceil(lockedForMs() / 60000)} ${x.min}`);
    else setMsg(x.bad);
    setA("");
  }

  return (
    <div className="card">
      <h1>🔒 {x.title}</h1>
      <p>{pinSet ? x.enter : x.create}</p>
      <input type="password" inputMode="numeric" autoComplete="off" value={a} onChange={(e) => setA(digits(e.target.value))} aria-label="PIN" />
      {!pinSet && <input type="password" inputMode="numeric" autoComplete="off" value={b} placeholder={x.repeat} onChange={(e) => setB(digits(e.target.value))} style={{ marginTop: 8 }} />}
      {msg && <p style={{ color: "#c0392b" }}>{msg}</p>}
      <p>
        <button className="btn" onClick={submit}>{pinSet ? x.open : x.save}</button>
      </p>
      <p className="muted">{x.note}</p>
    </div>
  );
}
