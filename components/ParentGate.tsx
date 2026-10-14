"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { checkPin, hasPin, isUnlocked, lock, lockedForMs, setPin, touch } from "@/lib/pin";
import { supabaseConfigured } from "@/lib/supabase";
import {
  cloudBootDone,
  cloudOnline,
  pinLockCloud,
  pinSetCloud,
  pinStatus,
  pinUnlockCloud,
} from "@/lib/cloud";

const tx = {
  ru: {
    title: "Раздел для родителей", create: "Придумайте PIN из 4–8 цифр. Ребёнок его знать не должен.", repeat: "Повторите PIN", enter: "Введите PIN",
    save: "Сохранить PIN", open: "Открыть", bad: "Неверный PIN", mismatch: "PIN не совпадает", short: "Нужно 4–8 цифр", locked: "Слишком много попыток. Подождите",
    min: "мин.", lockNow: "🔒 Закрыть раздел",
    noteLocal: "Если забыли PIN: очистите данные сайта в браузере (но сбросится и прогресс).",
    noteCloud: "PIN проверяет сервер. 5 ошибок — пауза 15 минут. Разблокировка на 10 минут. Забытый облачный PIN нельзя сбросить из приложения.",
  },
  he: {
    title: "אזור להורים", create: "בחרו PIN של 4–8 ספרות. הילדה לא צריכה לדעת אותו.", repeat: "חזרו על ה-PIN", enter: "הכניסו PIN",
    save: "שמירת PIN", open: "פתיחה", bad: "PIN שגוי", mismatch: "ה-PIN לא תואם", short: "נדרשות 4–8 ספרות", locked: "יותר מדי ניסיונות. המתינו",
    min: "דק׳", lockNow: "🔒 נעילת האזור",
    noteLocal: "אם שכחתם PIN: נקו נתוני אתר בדפדפן (גם ההתקדמות תתאפס).",
    noteCloud: "השרת בודק את ה-PIN. 5 טעויות — המתנה 15 דקות. פתיחה ל־10 דקות. PIN בענן אי אפשר לאפס מהאפליקציה.",
  },
};

export default function ParentGate({ children }: { children: React.ReactNode }) {
  const { lang } = useGame();
  const x = tx[lang];
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let n = 0;
    const boot = async () => {
      if (supabaseConfigured() && !cloudBootDone()) {
        n += 1;
        if (n < 40) return;
      }
      window.clearInterval(iv);
      if (cloudOnline()) {
        const st = await pinStatus();
        setCloud(true);
        setPinSet(!!st?.has_pin);
        setOpen(!!st?.unlocked_until && Date.parse(st.unlocked_until) > Date.now());
      } else {
        setCloud(false);
        setPinSet(hasPin());
        setOpen(isUnlocked());
      }
      setReady(true);
    };
    const iv = window.setInterval(() => {
      void boot();
    }, 80);
    void boot();
    return () => {
      window.clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => {
      if (cloud) {
        void pinStatus().then((st) => {
          if (!st?.unlocked_until || Date.parse(st.unlocked_until) <= Date.now()) setOpen(false);
        });
      } else if (!isUnlocked()) setOpen(false);
    }, 10000);
    const ping = () => {
      if (!cloud) touch();
    };
    window.addEventListener("pointerdown", ping);
    window.addEventListener("keydown", ping);
    return () => {
      clearInterval(iv);
      window.removeEventListener("pointerdown", ping);
      window.removeEventListener("keydown", ping);
      if (cloud) void pinLockCloud();
      else lock();
    };
  }, [open, cloud]);

  if (!ready) return null;

  if (open)
    return (
      <>
        <p>
          <button
            className="btn secondary"
            onClick={() => {
              if (cloud) void pinLockCloud();
              else lock();
              setOpen(false);
              setA("");
            }}
          >
            {x.lockNow}
          </button>
        </p>
        {children}
      </>
    );

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  async function submit() {
    setMsg("");
    if (!pinSet) {
      if (a.length < 4) return setMsg(x.short);
      if (a !== b) return setMsg(x.mismatch);
      if (cloud) {
        const err = await pinSetCloud(a);
        if (err) return setMsg(err === "locked" ? x.locked : x.bad);
        const un = await pinUnlockCloud(a);
        if (un.error) return setMsg(un.error === "locked" ? x.locked : x.bad);
      } else await setPin(a);
      setPinSet(true);
      setOpen(true);
      return;
    }
    if (cloud) {
      const un = await pinUnlockCloud(a);
      if (un.error === "locked") setMsg(`${x.locked} ${x.min}`);
      else if (un.error) setMsg(x.bad);
      else setOpen(true);
    } else {
      const r = await checkPin(a);
      if (r === "ok") setOpen(true);
      else if (r === "locked") setMsg(`${x.locked} ${Math.ceil(lockedForMs() / 60000)} ${x.min}`);
      else setMsg(x.bad);
    }
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
        <button className="btn" onClick={() => void submit()}>{pinSet ? x.open : x.save}</button>
      </p>
      <p className="muted">{cloud ? x.noteCloud : x.noteLocal}</p>
    </div>
  );
}
