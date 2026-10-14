"use client";

import { useEffect, useRef } from "react";
import { useGame } from "@/lib/store";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { ensureFamily, familyPrefsSet, markCloudBoot, pullFamilyPrefs, pullGame, pullReal, pushGame, resetCloudIds, takePendingFamilyPrefs } from "@/lib/cloud";
import { syncEvents } from "@/lib/analytics";

/** Держит сессию и подтягивает облако в GameState. Без входа ничего не делает. */
export function CloudBridge({ children }: { children: React.ReactNode }) {
  const { s, ready, update } = useGame();
  const syncing = useRef(false);
  const lastPush = useRef("");
  const nameRef = useRef(s.name);
  const langRef = useRef(s.lang);
  const analyticsRef = useRef(s.analyticsOn);
  const ageGroupRef = useRef(s.ageGroup);
  nameRef.current = s.name;
  langRef.current = s.lang;
  analyticsRef.current = s.analyticsOn;
  ageGroupRef.current = s.ageGroup;

  useEffect(() => {
    if (!ready || !supabaseConfigured()) return;
    const sb = supabase();
    if (!sb) return;
    let dead = false;
    const boot = async () => {
      const { data } = await sb.auth.getSession();
      if (dead) return;
      if (!data.session) {
        resetCloudIds();
        markCloudBoot();
        return;
      }
      syncing.current = true;
      const fam = await ensureFamily(langRef.current, nameRef.current);
      if (!fam || dead) {
        syncing.current = false;
        markCloudBoot();
        return;
      }
      const [real, remote] = await Promise.all([pullReal(), pullGame()]);
      if (dead) return;
      const patch: Record<string, unknown> = {};
      if (real) patch.real = real;
      if (remote) Object.assign(patch, remote);
      const pending = takePendingFamilyPrefs();
      const remotePrefs = await pullFamilyPrefs();
      const analyticsOn = pending?.analyticsOn ?? (analyticsRef.current || remotePrefs?.analyticsOn === true);
      const localAge = ageGroupRef.current !== "unknown" ? ageGroupRef.current : undefined;
      const ageGroup = pending?.ageGroup ?? localAge ?? remotePrefs?.ageGroup ?? "unknown";
      patch.analyticsOn = analyticsOn;
      patch.ageGroup = ageGroup;
      if (Object.keys(patch).length) update(patch);
      if (!remote) await pushGame(s);
      if (ageGroup !== "unknown") await familyPrefsSet({ analyticsOn, ageGroup });
      syncing.current = false;
      markCloudBoot();
      void syncEvents();
    };
    void boot();
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      void boot();
    });
    return () => {
      dead = true;
      sub.subscription.unsubscribe();
    };
  }, [ready, update]);

  useEffect(() => {
    if (!ready || syncing.current || !supabaseConfigured()) return;
    const key = `${s.xp}|${s.balance}|${s.missionsDone.join(",")}|${s.dreamGoal}|${s.dreamSaved}|${s.hero}|${s.lang}`;
    if (key === lastPush.current) return;
    const t = setTimeout(() => {
      lastPush.current = key;
      void pushGame(s);
    }, 900);
    return () => {
      clearTimeout(t);
    };
  }, [ready, s]);

  return <>{children}</>;
}
