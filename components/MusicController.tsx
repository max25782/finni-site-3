"use client";

// Единое место синхронизации фоновой музыки с состоянием игры + плавающая кнопка 🎵/🔇.
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";
import { music } from "@/lib/music";

const GESTURES = ["click", "touchend", "keydown"] as const;

export default function MusicController() {
  const { s, lang, ready, update } = useGame();
  const [supported, setSupported] = useState(false); // false на SSR и при первом рендере: без расхождений
  const [unlocked, setUnlocked] = useState(false); // был ли жест: до него AudioContext не создаём
  const gestureAt = useRef(0); // когда жест уже запустил музыку (этот же тап мог попасть и в кнопку)

  const want = ready && s.musicAllowed && s.musicOn;
  const waiting = want && !unlocked; // включено, но после перезагрузки ждёт первого тапа

  useEffect(() => {
    setSupported(music.isSupported());
  }, []);

  useEffect(() => {
    music.setVolume(s.musicVol);
  }, [s.musicVol]);

  // главная синхронизация: запрет родителем или выключение останавливают музыку
  useEffect(() => {
    if (!ready) return;
    if (want && unlocked) music.start();
    else music.stop();
  }, [ready, want, unlocked]);

  // первый жест после загрузки запускает уже включённую музыку (политика автоплея)
  useEffect(() => {
    if (!want || unlocked) return;
    const onGesture = () => {
      gestureAt.current = Date.now();
      music.start(); // синхронно внутри жеста, иначе iOS не разбудит AudioContext
      setUnlocked(true);
    };
    GESTURES.forEach((e) => document.addEventListener(e, onGesture, true));
    return () => {
      GESTURES.forEach((e) => document.removeEventListener(e, onGesture, true));
    };
  }, [want, unlocked]);

  if (!supported || !ready || !s.musicAllowed) return null;

  const L = (ru: string, he: string) => (lang === "he" ? he : ru);
  const on = s.musicOn;
  const label = waiting
    ? L("Музыка включена. Нажми, чтобы она заиграла", "המוזיקה מופעלת. לחצו כדי שתתחיל")
    : on
      ? L("Выключить музыку", "כבה מוזיקה")
      : L("Включить музыку", "הפעל מוזיקה");

  const onClick = () => {
    // тап по кнопке в ожидании только запускает музыку (глобальный обработчик уже мог перерисовать компонент до этого клика)
    if (waiting || Date.now() - gestureAt.current < 600) {
      music.start();
      setUnlocked(true);
      return;
    }
    if (on) {
      music.stop();
      update({ musicOn: false });
    } else {
      music.start(); // внутри жеста
      setUnlocked(true);
      update({ musicOn: true });
    }
  };

  return (
    <button
      type="button"
      className={`music-fab${waiting ? " waiting" : ""}`}
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
    >
      <span aria-hidden="true">{on ? "🎵" : "🔇"}</span>
    </button>
  );
}
