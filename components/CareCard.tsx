"use client";

import type { Lang } from "@/lib/game";
import { CARE_TITLE, careReply, type CareKind } from "@/lib/safety";

export function CareCard({ kind, lang, onClose }: { kind: CareKind; lang: Lang; onClose: () => void }) {
  if (kind === "none") return null;
  const title = CARE_TITLE[lang];
  const text = careReply(kind, lang);
  const ok = lang === "he" ? "בסדר" : "Хорошо";
  return (
    <div className="card warn care-card" role="status" data-care={kind}>
      <h2>💛 {title}</h2>
      <p>{text}</p>
      <button type="button" className="btn" onClick={onClose} aria-label={ok}>
        {ok}
      </button>
    </div>
  );
}
