// Выгрузка/загрузка игрового прогресса между устройствами. Без real-денег и без аналитики.
import { type GameState, normalizeGameSnapshot } from "./game";

export const PROGRESS_EXPORT_VERSION = 1;

export type ProgressExport = {
  v: number;
  exportedAt: string;
  state: Omit<GameState, "real">;
};

export function exportProgressState(s: GameState): string {
  const { real: _r, ...state } = s;
  const payload: ProgressExport = {
    v: PROGRESS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadProgressJson(s: GameState) {
  try {
    const blob = new Blob([exportProgressState(s)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "finni-progress.json";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    /* */
  }
}

export type ProgressImportResult = { ok: true; state: GameState } | { ok: false; reason: "parse" | "version" | "shape" };

export function parseProgressImport(raw: string, keepReal: GameState["real"]): ProgressImportResult {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return { ok: false, reason: "shape" };
    if (data.v !== PROGRESS_EXPORT_VERSION) return { ok: false, reason: "version" };
    const st = data.state;
    if (!st || typeof st !== "object") return { ok: false, reason: "shape" };
    if ("real" in st) return { ok: false, reason: "shape" };
    if (!Array.isArray(st.missionsDone) || !Array.isArray(st.badges)) return { ok: false, reason: "shape" };
    if (typeof st.xp !== "number" || typeof st.balance !== "number") return { ok: false, reason: "shape" };
    const normalized = normalizeGameSnapshot(st as Record<string, unknown>, keepReal);
    return { ok: true, state: normalized };
  } catch {
    return { ok: false, reason: "parse" };
  }
}

/** Применить импорт: прогресс заменяется, real на устройстве сохраняется. */
export function mergeProgressImport(current: GameState, imported: GameState): GameState {
  return {
    ...imported,
    real: current.real,
    lang: current.langChosen ? current.lang : imported.lang,
    langChosen: current.langChosen || imported.langChosen,
  };
}
