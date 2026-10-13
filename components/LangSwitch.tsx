"use client";

import { useGame } from "@/lib/store";

// Порядок фиксированный: сначала иврит, затем русский. Каждая кнопка подписана на своём языке.
export default function LangSwitch() {
  const { lang, update } = useGame();
  return (
    <div className="langs" role="group" aria-label="שפה / Язык">
      <button type="button" lang="he" className={lang === "he" ? "on" : ""} aria-pressed={lang === "he"} aria-label="עברית" onClick={() => update({ lang: "he", langChosen: true })}>
        עברית
      </button>
      <button type="button" lang="ru" className={lang === "ru" ? "on" : ""} aria-pressed={lang === "ru"} aria-label="Русский" onClick={() => update({ lang: "ru", langChosen: true })}>
        Русский
      </button>
    </div>
  );
}
