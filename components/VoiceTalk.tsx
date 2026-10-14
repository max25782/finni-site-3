"use client";

import { VOICE_MSG } from "@/lib/voice";
import type { VoiceChat } from "@/lib/voicechat";
import { track } from "@/lib/analytics";

type Lang = "ru" | "he";

const T = {
  ru: {
    talk: "🎙️ Говорить с Финни",
    stop: "⏹️ Стоп",
    listening: "Слушаю…",
    thinking: "Думаю…",
    speaking: "Финни говорит…",
    tip: "Лучше в наушниках: Финни не слышит сам себя.",
    noTts: "На этом устройстве нет голоса для этого языка, читай ответ глазами.",
    resume: "Нажми, когда захочешь продолжить.",
    timeout: "Голосовой режим выключился через 10 минут. Нажми, чтобы продолжить.",
    hidden: "Голосовой режим остановлен, пока вкладка была в фоне.",
    parents: "Голосовой разговор включают родители.",
    unsupported: "Голос недоступен в этом браузере, напиши текстом.",
    region: "Голосовой разговор с Финни",
  },
  he: {
    talk: "🎙️ מדברים עם פיני",
    stop: "⏹️ עצור",
    listening: "מקשיב…",
    thinking: "חושב…",
    speaking: "פיני מדבר…",
    tip: "עדיף באוזניות: פיני לא שומע את עצמו.",
    noTts: "במכשיר הזה אין קול לשפה הזאת, קראו את התשובה בעיניים.",
    resume: "לחצו כשתרצו להמשיך.",
    timeout: "מצב הקול נכבה אחרי 10 דקות. לחצו כדי להמשיך.",
    hidden: "מצב הקול נעצר כשהלשונית הייתה ברקע.",
    parents: "את השיחה הקולית מפעילים ההורים.",
    unsupported: "הקול לא זמין בדפדפן הזה, כתבו בטקסט.",
    region: "שיחה קולית עם פיני",
  },
} as const;

const BADGE = { idle: "", listening: "👂", thinking: "🤔", speaking: "🗣️" } as const;

/** Большая кнопка голосового разговора, состояние Финни и подсказки. unavailable: причина, почему кнопка неактивна. */
export function VoiceTalk({ vc, lang, unavailable }: { vc: VoiceChat; lang: Lang; unavailable: "" | "parents" | "unsupported" }) {
  const x = T[lang];
  const m = VOICE_MSG[lang];
  const caption = vc.phase === "listening" ? x.listening : vc.phase === "thinking" ? x.thinking : vc.phase === "speaking" ? x.speaking : "";
  const noteText =
    vc.note === "silence" ? x.resume
    : vc.note === "denied" ? m.denied
    : vc.note === "nomic" ? m.noMic
    : vc.note === "network" ? m.network
    : vc.note === "bad" ? m.bad
    : vc.note === "timeout" ? x.timeout
    : vc.note === "hidden" ? x.hidden
    : "";

  return (
    <section className="vtalk" aria-label={x.region}>
      {vc.active && (
        <div className={`vfinni ${vc.phase}`} aria-hidden="true">
          <span className="vf-raccoon">🦝</span>
          <span className="vf-badge">{BADGE[vc.phase]}</span>
          {vc.phase === "thinking" && (
            <span className="vf-dots">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
      )}
      <p className="vstate" role="status" aria-live="polite">
        {caption}
      </p>
      {vc.active && vc.tip && <p className="muted">🎧 {x.tip}</p>}
      {vc.active && !vc.ttsOk && <p className="muted" data-testid="no-tts">{x.noTts}</p>}
      {!vc.active && noteText && <p className="muted" data-testid="voice-note-vc">{noteText}</p>}
      <button
        type="button"
        className={`btn vbig ${vc.active ? "combo" : ""}`}
        onClick={() => {
          if (!vc.active) track("finny_voice_started");
          vc.press();
        }}
        disabled={unavailable !== ""}
        data-voice-talk={unavailable === "" ? (vc.active ? "active" : "ready") : unavailable}
      >
        {vc.active ? x.stop : x.talk}
      </button>
      {unavailable !== "" && <p className="muted">{unavailable === "parents" ? x.parents : x.unsupported}</p>}
    </section>
  );
}
