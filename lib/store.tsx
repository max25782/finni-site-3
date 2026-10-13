"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_STATE, GameState, LogEntry, Lang, loadState, saveState, todayKey, yesterdayKey } from "./game";
import { tr } from "./i18n";
import { META } from "./meta";
import { addWeekGame } from "./real";

type Ctx = {
  s: GameState;
  ready: boolean;
  lang: Lang;
  t: (key: string) => string;
  update: (patch: Partial<GameState>) => void;
  mutate: (fn: (p: GameState) => GameState) => void;
  addXp: (n: number) => void;
  addBadge: (id: string) => void;
  completeQuest: (id: string, xp: number, badge?: string) => void;
  startMission: (id: string, vars: Record<string, number>, firstIdx: number) => void;
  advanceMission: (fromIdx: number, nextIdx: number, patch: Record<string, number>, xp: number, log?: LogEntry) => void;
  finishMission: (id: string, bonusXp: number, balanceGain: number, badges: string[]) => void;
  abandonMission: () => void;
  reset: () => void;
};

const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<GameState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setS(loadState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveState(s);
  }, [s, ready]);

  useEffect(() => {
    // до загрузки состояния не трогаем <html>: иначе дефолтный he на миг перебьёт ru из загрузочного скрипта
    if (!ready) return;
    document.documentElement.lang = s.lang;
    document.documentElement.dir = s.lang === "he" ? "rtl" : "ltr";
    document.documentElement.setAttribute("data-motion", s.fxMotion ? "on" : "off");
  }, [s.lang, s.fxMotion, ready]);

  // заголовок и описание страницы по языку (SSR отдаёт иврит)
  useEffect(() => {
    const m = META[s.lang];
    document.title = m.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", m.description);
  }, [s.lang]);

  const update = useCallback((patch: Partial<GameState>) => setS((p) => ({ ...p, ...patch })), []);

  const mutate = useCallback((fn: (p: GameState) => GameState) => setS((p) => fn(p)), []);

  const addXp = useCallback((n: number) => setS((p) => ({ ...p, xp: p.xp + Math.max(0, n) })), []);

  const addBadge = useCallback(
    (id: string) => setS((p) => (p.badges.includes(id) ? p : { ...p, badges: [...p.badges, id] })),
    []
  );

  const completeQuest = useCallback((id: string, xp: number, badge?: string) => {
    setS((p) => {
      const today = todayKey();
      if (p.lastDay === today) return p; // уже засчитан сегодня
      const streak = p.lastDay === yesterdayKey() ? p.streak + 1 : 1;
      const badges = new Set(p.badges);
      badges.add("first_quest");
      if (badge) badges.add(badge);
      if (streak >= 3) badges.add("streak3");
      if (streak >= 7) badges.add("streak7");
      return {
        ...p,
        xp: p.xp + xp + 15, // решение + завершённый квест
        balance: p.balance + 20,
        completed: p.completed.includes(id) ? p.completed : [...p.completed, id],
        streak,
        lastDay: today,
        badges: Array.from(badges),
      };
    });
  }, []);

  const startMission = useCallback((id: string, vars: Record<string, number>, firstIdx: number) => {
    setS((p) => {
      const today = todayKey();
      const count = p.missionDay === today ? p.missionCount : 0;
      return {
        ...p,
        run: { id, idx: firstIdx, vars: { ...vars }, xp: 0, log: [] },
        missionDay: today,
        missionCount: count + 1,
      };
    });
  }, []);

  const advanceMission = useCallback(
    (fromIdx: number, nextIdx: number, patch: Record<string, number>, xp: number, log?: LogEntry) => {
      setS((p) => {
        if (!p.run || p.run.idx !== fromIdx) return p; // защита от двойного нажатия
        const gain = Math.max(0, Math.round(xp));
        return {
          ...p,
          xp: p.xp + gain,
          run: {
            ...p.run,
            idx: nextIdx,
            vars: { ...p.run.vars, ...patch },
            xp: p.run.xp + gain,
            log: log ? [...(p.run.log ?? []), log] : p.run.log ?? [],
          },
        };
      });
    },
    []
  );

  const finishMission = useCallback((id: string, bonusXp: number, balanceGain: number, badges: string[]) => {
    setS((p) => {
      if (!p.run || p.run.id !== id) return p;
      const today = todayKey();
      const streak = p.lastDay === today ? p.streak : p.lastDay === yesterdayKey() ? p.streak + 1 : 1;
      const b = new Set(p.badges);
      badges.forEach((x) => b.add(x));
      b.add("first_quest");
      if (streak >= 3) b.add("streak3");
      if (streak >= 7) b.add("streak7");
      return {
        ...p,
        xp: p.xp + Math.max(0, Math.round(bonusXp)),
        balance: p.balance + Math.max(0, Math.round(balanceGain)),
        real: addWeekGame(p.real, balanceGain),
        badges: Array.from(b),
        missionsDone: p.missionsDone.includes(id) ? p.missionsDone : [...p.missionsDone, id],
        streak,
        lastDay: today,
        run: null,
      };
    });
  }, []);

  const abandonMission = useCallback(() => setS((p) => ({ ...p, run: null })), []);

  // сброс прогресса не сбрасывает выбранный язык
  const reset = useCallback(() => setS((p) => ({ ...DEFAULT_STATE, lang: p.lang, langChosen: p.langChosen })), []);

  const value = useMemo<Ctx>(
    () => ({
      s,
      ready,
      lang: s.lang,
      t: (k: string) => tr(k, s.lang),
      update,
      mutate,
      addXp,
      addBadge,
      completeQuest,
      startMission,
      advanceMission,
      finishMission,
      abandonMission,
      reset,
    }),
    [s, ready, update, mutate, addXp, addBadge, completeQuest, startMission, advanceMission, finishMission, abandonMission, reset]
  );

  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame outside provider");
  return c;
}
