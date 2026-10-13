"use client";

import { useState } from "react";
import { useGame } from "@/lib/store";
import { levelFor } from "@/lib/game";
import { MISSIONS } from "@/lib/missions";
import { cardBlob, clipBlob, download, shareText, whatsappUrl, ShareData } from "@/lib/share";

const tx = {
  ru: { h: "📣 Поделиться", wa: "WhatsApp", card: "Карточка", clip: "Клип для YouTube", making: "Делаю клип…", yt: "YouTube: клип загружает родитель (у детей до 13 лет нет своего аккаунта). Скачай клип и покажи родителю. Лучше ставить «Доступ по ссылке».", fail: "Клип не поддерживается этим браузером. Скачай карточку.", note: "В карточке нет адреса, телефона и фамилии. Все деньги игровые.", progress: "Мой прогресс" },
  he: { h: "📣 שיתוף", wa: "WhatsApp", card: "כרטיס", clip: "קליפ ל-YouTube", making: "מכינה קליפ…", yt: "YouTube: את הקליפ מעלה ההורה (לילדים מתחת לגיל 13 אין חשבון משלהם). הורידו את הקליפ והראו להורה. מומלץ ״גישה עם קישור״.", fail: "הדפדפן לא תומך בקליפ. הורידו את הכרטיס.", note: "בכרטיס אין כתובת, טלפון או שם משפחה. כל הכסף במשחק.", progress: "ההתקדמות שלי" },
};

export default function ShareBox({ title }: { title?: string }) {
  const { s, lang } = useGame();
  const x = tx[lang];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!s.shareEnabled) return null;
  const lv = levelFor(s.xp);
  const d: ShareData = {
    lang,
    name: s.shareName ? s.name.split(" ")[0] : undefined,
    title: title || x.progress,
    progress: !title,
    balance: s.balance,
    xp: s.xp,
    level: lv.cur[lang],
    levelIcon: lv.cur.icon,
    done: s.missionsDone.filter((id) => MISSIONS.some((m) => m.id === id)).length,
    total: MISSIONS.length,
  };

  async function onCard() {
    const b = await cardBlob(d);
    if (!b) return;
    const file = new File([b], "finni.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (o: unknown) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], text: shareText(d) });
        return;
      } catch {}
    }
    download(b, "finni-card.png");
  }
  async function onClip() {
    setBusy(true);
    setErr("");
    try {
      const r = await clipBlob(d);
      if (!r) setErr(x.fail);
      else download(r.blob, `finni-clip.${r.ext}`);
    } catch {
      setErr(x.fail);
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <h2>{x.h}</h2>
      <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="btn" href={whatsappUrl(d)} target="_blank" rel="noopener noreferrer">💬 {x.wa}</a>
        <button className="btn secondary" onClick={onCard}>🖼️ {x.card}</button>
        <button className="btn secondary" onClick={onClip} disabled={busy}>{busy ? x.making : `🎬 ${x.clip}`}</button>
      </p>
      {err && <p style={{ color: "#c0392b" }}>{err}</p>}
      <p className="muted">{x.yt}</p>
      <p className="muted">{x.note}</p>
    </div>
  );
}
