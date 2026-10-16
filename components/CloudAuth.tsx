"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import { cloudIds, cloudOnline, cloudSignInWithOtp, cloudSignOut, cloudSignUp, setPendingFamilyPrefs } from "@/lib/cloud";
import type { AgeGroup } from "@/lib/analytics";
import Link from "next/link";

function ageFromGroup(g: AgeGroup): number {
  if (g === "7-9") return 8;
  if (g === "12-14") return 13;
  return 11;
}

export function CloudAuth() {
  const { s, lang, update } = useGame();
  const L = (ru: string, he: string) => (lang === "he" ? he : ru);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(
    s.ageGroup === "7-9" || s.ageGroup === "12-14" || s.ageGroup === "10-11" ? s.ageGroup : "10-11"
  );

  useEffect(() => {
    const t = setInterval(() => setOn(cloudOnline()), 800);
    return () => {
      clearInterval(t);
    };
  }, []);

  if (!supabaseConfigured()) return null;

  const go = async (fn: () => Promise<{ error?: string; needConfirm?: boolean }>) => {
    setBusy(true);
    setMsg("");
    const r = await fn();
    setBusy(false);
    if (r.needConfirm) setMsg(L("Откройте ссылку в письме — вы вернётесь в раздел для родителей.", "פתחו את הקישור במייל — תחזרו לאזור ההורים."));
    else if (r.error) setMsg(r.error);
    else setOn(true);
  };

  const ids = cloudIds();

  return (
    <div className="card">
      <h2>☁️ {L("Облако семьи (Supabase)", "ענן המשפחה (Supabase)")}</h2>
      {on && ids ? (
        <>
          <p>
            {L("Семья в облаке подключена.", "המשפחה מחוברת לענן.")} {ids.role === "parent" ? L("Вы — родитель.", "אתם הורה.") : L("Вы — ребёнок.", "אתם ילד/ה.")}
          </p>
          <p className="muted">
            {L("Заказы и журнал пишутся на сервер. Прогресс игры тоже. Без входа всё остаётся только в этом браузере.", "הזמנות והיומן נשמרים בשרת. גם התקדמות המשחק. בלי כניסה הכול נשאר רק בדפדפן הזה.")}
          </p>
          <button className="btn secondary" onClick={() => void cloudSignOut().then(() => setOn(false))}>
            {L("Выйти из облака", "לצאת מהענן")}
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            {L(
              "Чтобы заказы и журнал не пропали при смене телефона, войдите почтой родителя. На этом устройстве вы и родитель, и ребёнок (ПИН по-прежнему закрывает взрослый раздел).",
              "כדי שההזמנות והיומן לא ייעלמו בהחלפת טלפון, היכנסו במייל של ההורה. במכשיר הזה אתם גם הורה וגם ילד/ה (הקוד עדיין סוגר את אזור המבוגרים)."
            )}
          </p>
          <label htmlFor="ce">{L("Почта родителя", "המייל של ההורה")}</label>
          <input id="ce" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="agp">{L("Возрастная группа (без даты рождения)", "קבוצת גיל (בלי תאריך לידה)")}</label>
          <select id="agp" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}>
            <option value="7-9">7–9</option>
            <option value="10-11">10–11</option>
            <option value="12-14">12–14</option>
          </select>
          <p style={{ marginTop: 12 }}>
            <label htmlFor="an" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontWeight: 600 }}>
              <input id="an" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {L(
                  "Помогать улучшать Финни (анонимная статистика игры). Без галочки события остаются только на этом устройстве.",
                  "לעזור לשפר את פיני (סטטיסטיקה אנונימית של המשחק). בלי סימון האירועים נשארים רק במכשיר הזה."
                )}{" "}
                <Link href="/privacy">{L("Политика конфиденциальности", "מדיניות פרטיות")}</Link>
                {" · "}
                <Link href="/principles">{L("Принципы Финни", "עקרונות פיני")}</Link>
              </span>
            </label>
          </p>
          {msg && <p style={{ color: "#c0392b", fontWeight: 700 }}>{msg}</p>}
          <p className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn" disabled={busy || !email.includes("@")} onClick={() => void go(() => cloudSignInWithOtp(email))}>
              {L("Войти по ссылке", "כניסה בקישור")}
            </button>
            <button
              className="btn secondary"
              disabled={busy || !email.includes("@")}
              onClick={() => {
                update({ analyticsOn: consent, ageGroup, age: ageFromGroup(ageGroup) });
                setPendingFamilyPrefs({ analyticsOn: consent, ageGroup });
                void go(() => cloudSignUp(email));
              }}
            >
              {L("Создать семью", "ליצור משפחה")} {s.name ? `(${s.name})` : ""}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
