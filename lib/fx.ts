// Звуки (WebAudio, без файлов) и вибрация. Настройки включаются родителем.
let soundOn = true;
let ctx: AudioContext | null = null;
export const setSound = (on: boolean) => {
  soundOn = on;
};

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.12) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export type Sfx = "tick" | "good" | "soft" | "combo" | "win" | "chest";
export function sfx(kind: Sfx) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(kind === "tick" ? 8 : kind === "soft" ? 15 : kind === "win" ? [30, 40, 60] : 25);
    }
    if (!soundOn) return;
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    if (kind === "tick") tone(520, 0, 0.06, "triangle", 0.08);
    if (kind === "good") {
      tone(660, 0, 0.1);
      tone(880, 0.09, 0.16);
    }
    if (kind === "soft") {
      tone(440, 0, 0.12, "sine", 0.08);
      tone(392, 0.1, 0.16, "sine", 0.08);
    }
    if (kind === "combo") [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.14, "triangle"));
    if (kind === "chest") [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.18, "square", 0.07));
    if (kind === "win") [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.2, "triangle", 0.14));
  } catch {
    /* звук не критичен */
  }
}
