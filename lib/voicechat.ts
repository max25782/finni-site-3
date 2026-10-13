"use client";
// Голосовой разговор с Финни: слушаем -> отправляем -> Финни отвечает вслух -> снова слушаем.
// Одна машина состояний для арены и свободного чата. Отправка хода (send) и показ SAFETY (onPrivate)
// приходят из страницы, чтобы не дублировать логику текстового чата.
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "./voice";
import { containsPrivateData, SAFETY_REPLY } from "./safety";
import { ensureVoices, speak, ttsSupported, unlockAudio } from "./tts";
import type { TtsProvider } from "./tts";
import { prepareForSpeech, speechFor } from "./speech-text";
import { music } from "./music";

export type VcPhase = "idle" | "listening" | "thinking" | "speaking";
/** Причина, по которой цикл остановился (показывается подсказкой) */
export type VcNote = "" | "silence" | "denied" | "nomic" | "network" | "bad" | "timeout" | "hidden";

/** Результат одного хода, который страница возвращает хуку */
export interface VcTurn {
  reply: string;
  speech?: string; // подготовленный текст для облачной озвучки (≤300) от сервера
  token?: string; // подпись speech от сервера
  over: boolean; // раунд закончен, цикл надо остановить после озвучки
}

export interface VcOptions {
  lang: "ru" | "he";
  provider: TtsProvider;
  send: (text: string) => Promise<VcTurn | null>;
  onInterim: (text: string) => void;
  onPrivate: () => void;
}

export interface VoiceChat {
  phase: VcPhase;
  active: boolean;
  note: VcNote;
  ttsOk: boolean; // false: на устройстве нет голоса, ребёнок читает ответ глазами
  tip: boolean; // показать подсказку про наушники (один раз)
  press: () => void; // большая кнопка: старт / перебить Финни / стоп
  stop: () => void;
}

const MAX_MS = 10 * 60 * 1000; // автостоп голосового режима
const MAX_SILENCE_RESTARTS = 2; // тишина: максимум 2 перезапуска подряд
const TIP_KEY = "finni-voice-tip";

export function useVoiceChat(opts: VcOptions): VoiceChat {
  const o = useRef(opts);
  o.current = opts; // колбэки всегда из последнего рендера

  const [phase, setPhase] = useState<VcPhase>("idle");
  const [note, setNote] = useState<VcNote>("");
  const [ttsOk, setTtsOk] = useState(true);
  const [tip, setTip] = useState(false);

  const active = useRef(false);
  const sess = useRef(0); // номер прослушивания/хода: отсекает запоздавшие колбэки
  const stopListen = useRef<null | (() => void)>(null);
  const speaking = useRef<null | { stop: () => void }>(null);
  const interrupt = useRef<null | (() => void)>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silence = useRef(0);
  const ttsRef = useRef(true);

  const halt = useCallback((n: VcNote = "") => {
    active.current = false;
    sess.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    interrupt.current?.(); // освобождаем ожидающую озвучку
    interrupt.current = null;
    stopListen.current?.();
    stopListen.current = null;
    speaking.current?.stop();
    speaking.current = null;
    music.hold(false);
    setPhase("idle");
    setNote(n);
  }, []);

  // озвучка ответа; промис завершается по окончании речи, ошибке или перебиванию кнопкой
  const say = (reply: string, speech: string | undefined, token: string | undefined): Promise<void> =>
    new Promise<void>((resolve) => {
      const lang = o.current.lang;
      const full = prepareForSpeech(reply, lang);
      if (!ttsRef.current || !full) {
        resolve();
        return;
      }
      setPhase("speaking");
      music.hold(true);
      const done = () => {
        speaking.current = null;
        interrupt.current = null;
        resolve();
      };
      interrupt.current = () => {
        speaking.current?.stop();
        done();
      };
      try {
        speaking.current = speak(full, lang, { onEnd: done, onError: done }, { provider: o.current.provider, cloud: speech ? { text: speech, token } : undefined });
      } catch {
        done(); // озвучка не удалась: ребёнок читает ответ, цикл идёт дальше
      }
    });

  // обёртка: любая неожиданная ошибка хода останавливает цикл, а не оставляет его «думающим»
  const handle = async (text: string, id: number) => {
    try {
      await handleTurn(text, id);
    } catch {
      if (active.current && sess.current === id) halt("bad");
    }
  };

  const handleTurn = async (text: string, id: number) => {
    const live = () => active.current && sess.current === id;
    setPhase("thinking");
    const lang = o.current.lang;
    if (containsPrivateData(text)) {
      // личные данные не уходят в модель: показываем и озвучиваем SAFETY_REPLY
      o.current.onPrivate();
      await say(SAFETY_REPLY[lang], speechFor(SAFETY_REPLY[lang], lang), undefined);
      if (!live()) return;
      listenOnce();
      return;
    }
    let turn: VcTurn | null = null;
    try {
      turn = await o.current.send(text);
    } catch {
      turn = null;
    }
    if (!live()) return;
    if (!turn) {
      halt(""); // страница сама показала ошибку
      return;
    }
    await say(turn.reply, turn.speech, turn.token);
    if (!live()) return;
    if (turn.over) {
      halt("");
      return;
    }
    listenOnce();
  };

  function listenOnce() {
    if (!active.current) return;
    const id = ++sess.current;
    const live = () => active.current && sess.current === id;
    setPhase("listening");
    music.hold(true);
    let gotFinal = false;
    let err = "";
    stopListen.current = listen(o.current.lang, {
      onInterim: (t) => {
        if (live()) o.current.onInterim(t);
      },
      onFinal: (t) => {
        if (!live()) return;
        gotFinal = true;
        silence.current = 0;
        music.hold(true); // listen() отпустил музыку на onend, снова держим
        void handle(t, id);
      },
      onError: (c) => {
        if (live()) err = c;
      },
      onEnd: () => {
        if (!live() || gotFinal) return;
        stopListen.current = null;
        if (err === "" || err === "no-speech") {
          silence.current++;
          if (silence.current > MAX_SILENCE_RESTARTS) halt("silence");
          else listenOnce();
        } else if (err === "not-allowed" || err === "service-not-allowed") halt("denied");
        else if (err === "audio-capture") halt("nomic");
        else if (err === "network") halt("network");
        else halt("bad");
      },
    });
  }

  const start = useCallback(() => {
    if (active.current) return;
    unlockAudio(); // в жесте пользователя: разрешает аудио и синтез речи на мобильных
    active.current = true;
    silence.current = 0;
    setNote("");
    try {
      if (!localStorage.getItem(TIP_KEY)) {
        localStorage.setItem(TIP_KEY, "1");
        setTip(true);
      }
    } catch {
      /* приватный режим: просто без подсказки */
    }
    timer.current = setTimeout(() => halt("timeout"), MAX_MS);
    const checkTts = () => {
      // elevenlabs: озвучка на сервере, браузерный голос не обязателен
      const ok = o.current.provider === "elevenlabs" || ttsSupported(o.current.lang);
      ttsRef.current = ok;
      setTtsOk(ok);
    };
    checkTts(); // сразу: иначе первый ответ может уйти в синтез до voiceschanged
    listenOnce();
    void ensureVoices().then(checkTts);
  }, [halt]);

  const stop = useCallback(() => halt(""), [halt]);

  const press = useCallback(() => {
    if (!active.current) start();
    else if (interrupt.current) interrupt.current(); // перебиваем Финни: дальше сразу слушаем
    else halt("");
  }, [start, halt]);

  // автостоп при уходе вкладки в фон
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && active.current) halt("hidden");
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [halt]);

  // автостоп при уходе со страницы
  useEffect(() => {
    return () => {
      halt("");
    };
  }, [halt]);

  return { phase, active: phase !== "idle", note, ttsOk, tip, press, stop };
}
