import type { Lang } from "./game";

export type ShareData = {
  lang: Lang;
  name?: string; // только если родитель разрешил
  title: string;
  progress?: boolean; // true = общий прогресс, а не конкретная миссия // название миссии или «Мой прогресс»
  balance: number;
  xp: number;
  level: string;
  levelIcon: string;
  done: number;
  total: number;
};

const T = {
  ru: { head: "Финни · Мастер денег", bal: "игровых ₪ в копилке", mis: "миссий пройдено", lvl: "Уровень", virt: "Все деньги в игре виртуальные" },
  he: { head: "פיני · אמן הכסף", bal: "₪ משחק בקופה", mis: "משימות הושלמו", lvl: "דרגה", virt: "כל הכסף במשחק וירטואלי" },
};

export function shareText(d: ShareData): string {
  const link = typeof location !== "undefined" && !/localhost|127\.0\.0\.1/.test(location.hostname) ? `\n${location.origin}` : "";
  const who = d.name ? `${d.name}: ` : "";
  if (d.progress)
    return d.lang === "he"
      ? `🦝 ${who}ההתקדמות שלי בפיני!\n💰 ${d.balance} ₪ משחק בקופה · ${d.levelIcon} ${d.level} · ⭐ ${d.xp} XP\nמשימות: ${d.done}/${d.total}${link}`
      : `🦝 ${who}Мой прогресс в Финни!\n💰 ${d.balance} игровых ₪ в копилке · ${d.levelIcon} ${d.level} · ⭐ ${d.xp} XP\nМиссий: ${d.done}/${d.total}${link}`;
  return d.lang === "he"
    ? `🦝 ${who}סיימתי את המשימה ״${d.title}״ בפיני!\n💰 ${d.balance} ₪ משחק בקופה · ${d.levelIcon} ${d.level} · ⭐ ${d.xp} XP\nמשימות: ${d.done}/${d.total}${link}`
    : `🦝 ${who}Миссия «${d.title}» в Финни пройдена!\n💰 ${d.balance} игровых ₪ в копилке · ${d.levelIcon} ${d.level} · ⭐ ${d.xp} XP\nМиссий: ${d.done}/${d.total}${link}`;
}

export const whatsappUrl = (d: ShareData) => `https://wa.me/?text=${encodeURIComponent(shareText(d))}`;

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 3) {
  const words = text.split(" ");
  let line = "";
  let n = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
      if (++n >= maxLines - 1) break;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

/** Рисует кадр. p = 0..1 — прогресс анимации (для клипа). */
export function drawFrame(c: HTMLCanvasElement, d: ShareData, p: number) {
  const ctx = c.getContext("2d")!;
  const W = c.width, H = c.height;
  const rtl = d.lang === "he";
  const t = T[d.lang];
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1f7a5a");
  g.addColorStop(1, "#0f3d4f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // монетки
  for (let i = 0; i < 14; i++) {
    const x = ((i * 137) % 100) / 100 * W;
    const y = (((i * 61) % 100) / 100 * H + p * H * 0.4 * (1 + (i % 3))) % H;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#ffd54a";
    ctx.beginPath();
    ctx.arc(x, y, 18 + (i % 4) * 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = "center";
  const cx = W / 2;
  const u = W / 1080;

  ctx.fillStyle = "#fff";
  ctx.font = `700 ${56 * u}px system-ui, sans-serif`;
  ctx.globalAlpha = ease(p * 5);
  ctx.fillText(`🦝 ${t.head}`, cx, H * 0.12);

  ctx.font = `800 ${72 * u}px system-ui, sans-serif`;
  ctx.globalAlpha = ease((p - 0.1) * 4);
  wrap(ctx, d.title, cx, H * 0.26, W * 0.84, 84 * u);

  ctx.globalAlpha = ease((p - 0.25) * 3);
  ctx.fillStyle = "#ffd54a";
  ctx.font = `900 ${190 * u}px system-ui, sans-serif`;
  const bal = Math.round(d.balance * ease((p - 0.25) * 2.2));
  ctx.fillText(`${bal} ₪`, cx, H * 0.5);
  ctx.fillStyle = "#fff";
  ctx.font = `500 ${44 * u}px system-ui, sans-serif`;
  ctx.fillText(t.bal, cx, H * 0.5 + 70 * u);

  ctx.globalAlpha = ease((p - 0.5) * 3);
  ctx.font = `700 ${58 * u}px system-ui, sans-serif`;
  ctx.fillText(`${d.levelIcon} ${t.lvl}: ${d.level}`, cx, H * 0.7);
  ctx.fillText(`⭐ ${Math.round(d.xp * ease((p - 0.5) * 2.5))} XP`, cx, H * 0.7 + 80 * u);
  ctx.font = `500 ${44 * u}px system-ui, sans-serif`;
  ctx.fillText(`${d.done}/${d.total} ${t.mis}`, cx, H * 0.7 + 150 * u);

  // полоска прогресса
  const bw = W * 0.7, bx = (W - bw) / 2, by = H * 0.7 + 190 * u;
  ctx.fillStyle = "rgba(255,255,255,.25)";
  ctx.fillRect(bx, by, bw, 22 * u);
  ctx.fillStyle = "#ffd54a";
  ctx.fillRect(bx, by, bw * (d.done / Math.max(1, d.total)) * ease((p - 0.6) * 2.5), 22 * u);

  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "#fff";
  ctx.font = `400 ${34 * u}px system-ui, sans-serif`;
  ctx.fillText(t.virt, cx, H - 60 * u);
  ctx.globalAlpha = 1;
}

export function cardBlob(d: ShareData): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1080;
  drawFrame(c, d, 1);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

/** Вертикальный клип 720×1280 ≈ 7 секунд (формат Shorts/Reels). */
export async function clipBlob(d: ShareData): Promise<{ blob: Blob; ext: string } | null> {
  if (typeof MediaRecorder === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 1280;
  const stream = (c as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream?.(30);
  if (!stream) return null;
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return null;
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  const DUR = 7000;
  const start = performance.now();
  rec.start();
  await new Promise<void>((res) => {
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / (DUR * 0.8));
      drawFrame(c, d, p);
      if (performance.now() - start < DUR) requestAnimationFrame(tick);
      else res();
    };
    tick();
  });
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
