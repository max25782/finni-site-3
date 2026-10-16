"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { L } from "@/lib/missions/types";
import { isolateMath } from "@/lib/bidi";
import { panelsFor } from "@/lib/comics";
import { Panel } from "@/components/comic/Panel";

type Lang = "ru" | "he";

/** Взрыв эмодзи (конфетти/монеты). Меняй key, чтобы запустить заново. */
export function Burst({ emojis = ["🪙", "✨", "⭐", "🎉"], count = 18 }: { emojis?: string[]; count?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        e: emojis[i % emojis.length],
        dx: Math.round((Math.random() - 0.5) * 520) + "px",
        dy: Math.round(-120 - Math.random() * 360) + "px",
        rot: Math.round((Math.random() - 0.5) * 540) + "deg",
        d: (Math.random() * 0.15).toFixed(2) + "s",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return (
    <div className="burst" aria-hidden>
      {items.map((it, i) => (
        <span key={i} style={{ ["--dx" as string]: it.dx, ["--dy" as string]: it.dy, ["--rot" as string]: it.rot, animationDelay: it.d }}>
          {it.e}
        </span>
      ))}
    </div>
  );
}

const SCENERY: Record<string, string[]> = {
  bracelets: ["🧵", "💎", "📿", "✨"],
  month: ["🛒", "🍕", "🎮", "🚌"],
  kiosk: ["🍋", "🥤", "🍪", "🏷️"],
  detective: ["🔎", "🕵️", "📩", "🚩"],
  channel: ["🎬", "👍", "📱", "🔥"],
  attention: ["📱", "⏱️", "🧠", "🎯"],
  inflation: ["👹", "🍦", "📈", "🏷️"],
  job: ["💼", "⏰", "🧰", "💵"],
  bigbuy: ["🚲", "🔧", "🏷️", "🛞"],
  family: ["🏠", "🧾", "👨‍👩‍👧‍👦", "🔌"],
  giving: ["💛", "🤝", "🌍", "🛠️"],
  island: ["🏝️", "🍕", "🍎", "🌴"],
  negotiator: ["🤝", "🗣️", "📊", "🎯"],
  finale: ["🏆", "🎓", "⭐", "🦝"],
};

const SAY_GOOD: Record<Lang, string[]> = {
  ru: ["Огонь! 🔥", "Ловко!", "Вот это мозг! 🧠", "Так держать!", "Класс-класс!"],
  he: ["אש! 🔥", "חכם!", "איזה מוח! 🧠", "ככה ממשיכים!", "מעולה!"],
};
const SAY_SOFT: Record<Lang, string[]> = {
  ru: ["Хм, интересный поворот…", "Ого, вот что бывает!", "Запомним этот ход 📝", "Любопытно, правда?"],
  he: ["הממ, תפנית מעניינת…", "וואו, ככה זה קורה!", "נזכור את המהלך 📝", "מעניין, נכון?"],
};
const SAY_THINK: Record<Lang, string[]> = {
  ru: ["Твой ход! 👇", "Я с тобой 🦝", "Что выберешь?", "Тик-так… ⏱️"],
  he: ["התור שלך! 👇", "אני איתך 🦝", "מה תבחרו?", "טיק-טק… ⏱️"],
};
export const pick = (a: string[], seed: number) => a[Math.abs(seed) % a.length];

export function Stage({ kind, emoji, title, missionId, sceneId, slide = 0, slides = 1, hero, mood, lang, seed, popKey, say: sayOverride }: { kind: string; emoji: string; title?: string; missionId: string; sceneId: string; slide?: number; slides?: number; hero?: "girl" | "boy"; mood?: "good" | "soft" | "think"; lang: Lang; seed: number; popKey?: string; say?: string | null }) {
  const panels = panelsFor(missionId, sceneId, kind);
  // длинная история — листаем кадры по мере чтения карточек
  const pi = panels.length <= 1 ? 0 : Math.min(panels.length - 1, Math.floor((slide / Math.max(1, slides)) * panels.length));
  const rawSay = sayOverride ? sayOverride : mood === "good" ? pick(SAY_GOOD[lang], seed) : mood === "soft" ? pick(SAY_SOFT[lang], seed) : "";
  const say = rawSay ? isolateMath(rawSay, lang) : "";
  const result = mood === "good" ? "good" : mood === "soft" ? "soft" : null;
  return (
    <div className={`stage2 k-${kind}`}>
      <div className="comic-wrap" key={`${popKey}-${pi}`}>
        <Panel spec={panels[pi]} hero={hero} result={result} lang={lang} seed={seed} />
      </div>
      {title && (
        <div className="stage-cap">
          <span className="stage-ic">{emoji}</span> {isolateMath(title, lang)}
        </div>
      )}
      {say && (
        <div>
          <span className="finni-say">🦝 {say}</span>
        </div>
      )}
    </div>
  );
}

/** Режем длинный текст на короткие «карточки» по одной мысли. */
export function chunkText(text: string, max = 150): string[] {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    if (p.length <= max) {
      out.push(p);
      continue;
    }
    const sentences = p.match(/[^.!?…]+[.!?…]+(\s|$)|[^.!?…]+$/g) ?? [p];
    let cur = "";
    for (const s of sentences) {
      if ((cur + s).length > max && cur) {
        out.push(cur.trim());
        cur = s;
      } else cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  // склеиваем совсем короткие обрывки
  const merged: string[] = [];
  for (const c of out) {
    if (merged.length && (c.length < 40 || merged[merged.length - 1].length < 40) && (merged[merged.length - 1] + " " + c).length <= max) merged[merged.length - 1] += " " + c;
    else merged.push(c);
  }
  return merged.length ? merged : [text];
}

/** Историю читаем по одной карточке: тап — следующая. Последняя — кнопка. */
export function Slides({ text, nextLabel, tapLabel = "👆", onDone, onTick, onIndex, lang = "ru" }: { text: string; nextLabel: string; tapLabel?: string; onDone: () => void; onTick?: () => void; onIndex?: (i: number, n: number) => void; lang?: Lang }) {
  const chunks = useMemo(() => chunkText(text), [text]);
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
  }, [text]);
  useEffect(() => {
    onIndex?.(i, chunks.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, chunks.length]);
  const last = i >= chunks.length - 1;
  const adv = () => {
    onTick?.();
    if (!last) setI(i + 1);
  };
  return (
    <>
      <div className="chunk" key={i} onClick={adv} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && adv()}>
        {isolateMath(chunks[i], lang)}
      </div>
      {chunks.length > 1 && (
        <div className="dots">
          {chunks.map((_, j) => (
            <i key={j} className={j <= i ? "on" : ""} />
          ))}
        </div>
      )}
      {last ? (
        <button className="btn" onClick={onDone}>
          {nextLabel}
        </button>
      ) : (
        <p className="tapnote">{tapLabel}</p>
      )}
    </>
  );
}

export function Segments({ total, idx }: { total: number; idx: number }) {
  return (
    <div className="seg" aria-label={`${idx + 1}/${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < idx ? "on" : i === idx ? "cur" : ""} />
      ))}
    </div>
  );
}

/** Бонусный таймер: только плюс к XP за скорость, штрафов нет. */
export function BonusTimer({ seconds, resetKey, lang }: { seconds: number; resetKey: string; lang: Lang }) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    setOver(false);
    const t = setTimeout(() => setOver(true), seconds * 1000);
    return () => clearTimeout(t);
  }, [resetKey, seconds]);
  return (
    <>
      <div className={`timer ${over ? "over" : ""}`}>
        <span key={resetKey} style={{ animationDuration: `${seconds}s` }} />
      </div>
      <p className="tapnote" style={{ margin: "0 0 6px" }}>
        {isolateMath(over ? (lang === "he" ? "בונוס מהירות נגמר. חשבו בנחת 🧠" : "Бонус за скорость вышел. Думай спокойно 🧠") : lang === "he" ? "⚡ החליטו מהר: בונוס +5 XP" : "⚡ Реши быстро: бонус +5 XP", lang)}
      </p>
    </>
  );
}

const BREAKS: Record<Lang, string[]> = {
  ru: [
    "Сделай 10 прыжков 🏃",
    "Выпей воды 💧",
    "Потянись к потолку 🙆",
    "Сделай 5 глубоких вдохов 🌬️",
    "Пробеги на месте 20 секунд 💨",
    "Посмотри вдаль 20 секунд — в окно или на стену далеко 👀",
    "Выпей воды и потянись к потолку 💧",
    "Потанцуй 30 секунд, как будто играет любимая песня 💃",
    "Пройди по комнате туда-обратно 5 раз 🚶",
    "Покрути плечами и покачай головой медленно 🙆",
  ],
  he: [
    "עשו 10 קפיצות 🏃",
    "שתו מים 💧",
    "התמתחו לתקרה 🙆",
    "קחו 5 נשימות עמוקות 🌬️",
    "רוצו במקום 20 שניות 💨",
    "הסתכלו למרחק 20 שניות — מהחלון או לקיר רחוק 👀",
    "שתו מים והתמתחו לתקרה 💧",
    "תרקדו 30 שניות, כאילו מתנגן שיר אהוב 💃",
    "לכו בחדר הלוך ושוב 5 פעמים 🚶",
    "סובבו כתפיים והניעו את הראש לאט 🙆",
  ],
};
export function BreakOverlay({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [sec, setSec] = useState(90);
  const task = useRef(pick(BREAKS[lang], Math.floor(Math.random() * 100)));
  useEffect(() => {
    const t = setInterval(() => setSec((x) => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="breakov">
      <div className="big">{sec}</div>
      <h2 style={{ color: "#fff" }}>{lang === "he" ? "הפסקת אנרגיה" : "Энергетическая пауза"}</h2>
      <p style={{ fontSize: 24 }}>{task.current}</p>
      <p className="muted" style={{ color: "#d6cfe3" }}>{lang === "he" ? "המוח אוהב תנועה. ההתקדמות נשמרת." : "Мозг любит движение. Прогресс сохранён."}</p>
      <button className="btn" onClick={onClose}>
        {sec === 0 ? (lang === "he" ? "חוזרים למשחק! 🚀" : "Возвращаемся в игру! 🚀") : lang === "he" ? "אני מוכנה, ממשיכים" : "Я готов(а), продолжаем"}
      </button>
    </div>
  );
}

/** Заголовок результата + «Подробнее». */
export function ResultText({ text, lang }: { text: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [text]);
  const m = text.match(/^([\s\S]*?[.!?…])(\s+[\s\S]*)?$/);
  let head = m ? m[1] : text;
  let rest = m && m[2] ? m[2].trim() : "";
  if (head.length < 30 && rest) {
    const m2 = rest.match(/^([\s\S]*?[.!?…])(\s+[\s\S]*)?$/);
    if (m2) {
      head = head + " " + m2[1];
      rest = (m2[2] ?? "").trim();
    } else {
      head = head + " " + rest;
      rest = "";
    }
  }
  return (
    <>
      <p className="headline">{isolateMath(head, lang)}</p>
      {rest && (open ? <p className="scenario">{isolateMath(rest, lang)}</p> : (
        <button className="more" onClick={() => setOpen(true)}>
          {lang === "he" ? "עוד ▾" : "Подробнее ▾"}
        </button>
      ))}
    </>
  );
}

export type { L };
