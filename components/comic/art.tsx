import type { ReactNode } from "react";

export type Mood = "neutral" | "happy" | "sad" | "think" | "wow" | "sly";
export const INK = "#2b2140";

type Hair = "pigtails" | "short" | "long" | "bun" | "curly" | "cap" | "hood" | "none";
type Look = { skin: string; hair: string; style: Hair; shirt: string; pants: string; extra?: string[]; cap?: string };

export const LOOKS: Record<string, Look> = {
  girl: { skin: "#ffd3b0", hair: "#6b3a1e", style: "pigtails", shirt: "#ff7a59", pants: "#3b4a8c" },
  boy: { skin: "#ffd3b0", hair: "#3a2412", style: "short", shirt: "#3aa0ff", pants: "#2f3b5c" },
  adi: { skin: "#f1c08f", hair: "#1c1c1c", style: "short", shirt: "#3ccf91", pants: "#4a4a6a" },
  noa: { skin: "#e8b48a", hair: "#5a2c0c", style: "curly", shirt: "#b074ff", pants: "#3b3b5a" },
  dani: { skin: "#ffd3b0", hair: "#b5651d", style: "short", shirt: "#ef4f5f", pants: "#3a3a52" },
  mom: { skin: "#ffd3b0", hair: "#7b3f1d", style: "long", shirt: "#1fb58f", pants: "#3d4466" },
  dad: { skin: "#e9b58f", hair: "#2b1d14", style: "short", shirt: "#4b6bd6", pants: "#2f3350", extra: ["beard"] },
  rose: { skin: "#f3cfae", hair: "#d8d8e6", style: "bun", shirt: "#a46bd0", pants: "#5c4b7a", extra: ["glasses"] },
  seller: { skin: "#e9b58f", hair: "#3a2412", style: "cap", cap: "#e5484d", shirt: "#f2a93b", pants: "#4a3b2f", extra: ["mustache", "apron"] },
  scammer: { skin: "#d9b79a", hair: "#20202c", style: "hood", shirt: "#20202c", pants: "#20202c", extra: ["shades"] },
  teen: { skin: "#e8b48a", hair: "#3a2412", style: "cap", cap: "#6b6e78", shirt: "#7b7f8c", pants: "#2f3350" },
  neighbor: { skin: "#e1ad86", hair: "#9a9aa8", style: "short", shirt: "#7a8f3a", pants: "#4a4a3a", extra: ["mustache"] },
  teacher: { skin: "#ffd3b0", hair: "#5c4033", style: "bun", shirt: "#2f8f9d", pants: "#33445a", extra: ["glasses"] },
  kid: { skin: "#f1c08f", hair: "#2b1d14", style: "short", shirt: "#f5c13a", pants: "#3b4a8c" },
};

function Arm({ x1, y1, x2, y2, color, skin }: { x1: number; y1: number; x2: number; y2: number; color: string; skin: string }) {
  return (
    <g strokeLinecap="round">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={14} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={8.5} />
      <circle cx={x2} cy={y2} r={6.5} fill={skin} stroke={INK} strokeWidth={2.5} />
    </g>
  );
}

type Arms = [number, number, number, number];
const ARMS: Record<Mood, Arms> = {
  neutral: [-31, -42, 31, -42],
  happy: [-42, -116, 42, -116],
  sad: [-25, -38, 25, -38],
  think: [-30, -44, 12, -80],
  wow: [-44, -92, 44, -92],
  sly: [-30, -50, 30, -62],
};

function Face({ mood, y = -114, eyeColor = INK }: { mood: Mood; y?: number; eyeColor?: string }) {
  const ey = y - 2;
  const my = y + 14;
  const brow = (dx: number, rot: number) => <line x1={dx - 6} y1={ey - 11} x2={dx + 6} y2={ey - 11 - rot} stroke={INK} strokeWidth={2.6} strokeLinecap="round" />;
  return (
    <g>
      {mood === "happy" ? (
        <>
          <path d={`M-17 ${ey + 1} q6 -8 12 0`} stroke={eyeColor} strokeWidth={3} fill="none" strokeLinecap="round" />
          <path d={`M5 ${ey + 1} q6 -8 12 0`} stroke={eyeColor} strokeWidth={3} fill="none" strokeLinecap="round" />
        </>
      ) : mood === "sly" ? (
        <>
          <path d={`M-16 ${ey} q5 4 11 0`} stroke={eyeColor} strokeWidth={3} fill="none" strokeLinecap="round" />
          <path d={`M5 ${ey} q5 4 11 0`} stroke={eyeColor} strokeWidth={3} fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          {[-10, 10].map((dx) => (
            <g key={dx}>
              <ellipse cx={dx} cy={ey} rx={mood === "wow" ? 7 : 6} ry={mood === "wow" ? 8.5 : 7} fill="#fff" stroke={INK} strokeWidth={1.8} />
              <circle cx={dx + (mood === "think" ? 2 : 0)} cy={ey + (mood === "think" ? -2 : mood === "sad" ? 2 : 0)} r={mood === "wow" ? 2.4 : 3.4} fill={eyeColor} />
            </g>
          ))}
        </>
      )}
      {mood === "sad" && (
        <>
          {brow(-10, -5)}
          {brow(10, 5)}
        </>
      )}
      {mood === "wow" && (
        <>
          {brow(-10, 3)}
          {brow(10, 3)}
        </>
      )}
      {mood === "think" && brow(10, 4)}
      {mood === "sly" && (
        <>
          {brow(-10, 4)}
          {brow(10, -4)}
        </>
      )}
      {/* рот */}
      {mood === "happy" && <path d={`M-9 ${my - 3} q9 14 18 0 z`} fill="#7a2b3a" stroke={INK} strokeWidth={2} strokeLinejoin="round" />}
      {mood === "neutral" && <path d={`M-6 ${my} q6 5 12 0`} stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />}
      {mood === "sad" && <path d={`M-7 ${my + 3} q7 -8 14 0`} stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />}
      {mood === "wow" && <ellipse cx={0} cy={my + 1} rx={4.6} ry={6} fill="#7a2b3a" stroke={INK} strokeWidth={2} />}
      {mood === "think" && <path d={`M-5 ${my + 1} q5 -2 11 -3`} stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />}
      {mood === "sly" && <path d={`M-9 ${my - 1} q10 10 19 -4`} stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />}
      {(mood === "happy" || mood === "neutral" || mood === "wow") && (
        <>
          <circle cx={-17} cy={my - 8} r={4.5} fill="#ff8fa3" opacity={0.45} />
          <circle cx={17} cy={my - 8} r={4.5} fill="#ff8fa3" opacity={0.45} />
        </>
      )}
    </g>
  );
}

function HairBack({ style, c }: { style: Hair; c: string }) {
  if (style === "pigtails")
    return (
      <g fill={c} stroke={INK} strokeWidth={2.6}>
        <circle cx={-30} cy={-102} r={11} />
        <circle cx={30} cy={-102} r={11} />
        <rect x={-33} y={-118} width={6} height={10} rx={3} fill="#ffcf33" />
        <rect x={27} y={-118} width={6} height={10} rx={3} fill="#ffcf33" />
      </g>
    );
  if (style === "long") return <path d="M-31 -118 Q-38 -66 -22 -64 L22 -64 Q38 -66 31 -118 Z" fill={c} stroke={INK} strokeWidth={2.6} />;
  if (style === "bun") return <circle cx={0} cy={-148} r={11} fill={c} stroke={INK} strokeWidth={2.6} />;
  if (style === "hood") return <circle cx={0} cy={-114} r={36} fill={c} stroke={INK} strokeWidth={2.6} />;
  if (style === "curly")
    return (
      <g fill={c} stroke={INK} strokeWidth={2.4}>
        {[-26, -14, 0, 14, 26].map((x, i) => (
          <circle key={i} cx={x} cy={i % 2 ? -140 : -136} r={13} />
        ))}
        <circle cx={-31} cy={-116} r={11} />
        <circle cx={31} cy={-116} r={11} />
      </g>
    );
  return null;
}

function HairFront({ style, c, cap }: { style: Hair; c: string; cap?: string }) {
  if (style === "none") return null;
  if (style === "cap" || style === "hood") {
    if (style === "hood")
      return <path d="M-28 -118 Q-26 -140 0 -142 Q26 -140 28 -118 Q14 -128 0 -126 Q-14 -128 -28 -118 Z" fill={c} stroke={INK} strokeWidth={2.4} />;
    return (
      <g>
        <path d="M-29 -118 Q-28 -146 0 -146 Q28 -146 29 -118 Z" fill={cap ?? "#e5484d"} stroke={INK} strokeWidth={2.6} />
        <path d="M-30 -118 L38 -118 Q40 -112 30 -111 L-30 -111 Z" fill={cap ?? "#e5484d"} stroke={INK} strokeWidth={2.6} />
      </g>
    );
  }
  if (style === "curly") return <path d="M-26 -124 Q-14 -134 0 -128 Q14 -134 26 -124 Q16 -140 0 -140 Q-16 -140 -26 -124 Z" fill={c} stroke={INK} strokeWidth={2} />;
  const tall = style === "short" ? 6 : 0;
  return <path d={`M-29 -114 A29 29 0 0 1 29 -114 Q20 ${-130 - tall} 8 ${-126} Q-6 ${-122 - tall} -29 -114 Z`} fill={c} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />;
}

export function Person({ who, mood = "neutral", x, scale = 1, look }: { who: string; mood?: Mood; x: number; scale?: number; look?: Look }) {
  const L = look ?? LOOKS[who] ?? LOOKS.kid;
  const a = ARMS[mood];
  const hood = L.style === "hood";
  return (
    <g transform={`translate(${x} 205) scale(${scale})`}><g className={`cp cp-${mood}`}>
      <HairBack style={L.style} c={L.hair} />
      {/* ноги */}
      <rect x={-16} y={-36} width={13} height={30} rx={5} fill={L.pants} stroke={INK} strokeWidth={2.6} />
      <rect x={3} y={-36} width={13} height={30} rx={5} fill={L.pants} stroke={INK} strokeWidth={2.6} />
      <ellipse cx={-10} cy={-4} rx={12} ry={6} fill="#3a2d4a" stroke={INK} strokeWidth={2.4} />
      <ellipse cx={10} cy={-4} rx={12} ry={6} fill="#3a2d4a" stroke={INK} strokeWidth={2.4} />
      <Arm x1={-22} y1={-78} x2={a[0]} y2={a[1]} color={L.shirt} skin={L.skin} />
      {/* торс */}
      <rect x={-25} y={-88} width={50} height={58} rx={15} fill={L.shirt} stroke={INK} strokeWidth={2.8} />
      {L.extra?.includes("apron") && <path d="M-16 -80 h32 v46 h-32 z" fill="#fff" stroke={INK} strokeWidth={2} />}
      {hood && <path d="M-14 -88 q14 14 28 0" fill="none" stroke="#555" strokeWidth={3} />}
      <Arm x1={22} y1={-78} x2={a[2]} y2={a[3]} color={L.shirt} skin={L.skin} />
      {/* голова */}
      <circle cx={0} cy={-114} r={28} fill={L.skin} stroke={INK} strokeWidth={2.8} />
      <Face mood={mood} />
      {L.extra?.includes("glasses") && (
        <g fill="rgba(255,255,255,.35)" stroke={INK} strokeWidth={2.2}>
          <circle cx={-10} cy={-116} r={9} />
          <circle cx={10} cy={-116} r={9} />
          <line x1={-1} y1={-116} x2={1} y2={-116} />
        </g>
      )}
      {L.extra?.includes("shades") && (
        <g fill="#111" stroke={INK} strokeWidth={2}>
          <rect x={-21} y={-124} width={19} height={11} rx={4} />
          <rect x={2} y={-124} width={19} height={11} rx={4} />
          <line x1={-2} y1={-120} x2={2} y2={-120} />
        </g>
      )}
      {L.extra?.includes("mustache") && <path d="M-11 -102 q5 -6 11 -1 q6 -5 11 1 q-5 4 -11 0 q-6 4 -11 0 z" fill="#4a3322" stroke={INK} strokeWidth={1.6} />}
      {L.extra?.includes("beard") && <path d="M-22 -104 q0 24 22 24 q22 0 22 -24 q-8 8 -22 8 q-14 0 -22 -8 z" fill="#4a3322" stroke={INK} strokeWidth={2} opacity={0.95} />}
      <HairFront style={L.style} c={L.hair} cap={L.cap} />
    </g></g>
  );
}

export function Finni({ mood = "neutral", x, scale = 1 }: { mood?: Mood; x: number; scale?: number }) {
  const g = "#9a9fb0";
  const dk = "#4a4453";
  const a = ARMS[mood];
  return (
    <g transform={`translate(${x} 205) scale(${scale})`}><g className={`cp cp-${mood}`}>
      {/* хвост */}
      <g stroke={INK} strokeWidth={2.4}>
        {[
          [34, -26, g],
          [44, -42, dk],
          [50, -58, g],
          [52, -74, dk],
          [50, -90, g],
        ].map(([cx, cy, f], i) => (
          <circle key={i} cx={cx as number} cy={cy as number} r={12 - i * 0.6} fill={f as string} />
        ))}
      </g>
      <rect x={-15} y={-34} width={12} height={28} rx={5} fill={dk} stroke={INK} strokeWidth={2.6} />
      <rect x={3} y={-34} width={12} height={28} rx={5} fill={dk} stroke={INK} strokeWidth={2.6} />
      <ellipse cx={-10} cy={-4} rx={12} ry={6} fill={dk} stroke={INK} strokeWidth={2.4} />
      <ellipse cx={10} cy={-4} rx={12} ry={6} fill={dk} stroke={INK} strokeWidth={2.4} />
      <Arm x1={-22} y1={-76} x2={a[0]} y2={a[1]} color={g} skin={dk} />
      <rect x={-25} y={-86} width={50} height={56} rx={16} fill={g} stroke={INK} strokeWidth={2.8} />
      <ellipse cx={0} cy={-58} rx={14} ry={20} fill="#f3efe9" />
      <path d="M-18 -86 q18 12 36 0 l-2 10 q-16 8 -32 0 z" fill="#e5484d" stroke={INK} strokeWidth={2.2} />
      <Arm x1={22} y1={-76} x2={a[2]} y2={a[3]} color={g} skin={dk} />
      {/* уши */}
      <path d="M-34 -124 L-28 -154 L-12 -136 Z" fill={g} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M34 -124 L28 -154 L12 -136 Z" fill={g} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M-29 -132 L-27 -146 L-19 -137 Z" fill={dk} />
      <path d="M29 -132 L27 -146 L19 -137 Z" fill={dk} />
      {/* голова */}
      <ellipse cx={0} cy={-112} rx={35} ry={29} fill={g} stroke={INK} strokeWidth={2.8} />
      <path d="M-34 -118 Q-18 -132 0 -122 Q18 -132 34 -118 Q32 -100 16 -102 Q0 -108 -16 -102 Q-32 -100 -34 -118 Z" fill={dk} />
      <ellipse cx={0} cy={-98} rx={15} ry={11} fill="#f3efe9" stroke={INK} strokeWidth={2} />
      <ellipse cx={0} cy={-103} rx={5} ry={3.6} fill="#111" />
      <g transform="translate(0 6)">
        <Face mood={mood} y={-116} eyeColor="#111" />
      </g>
    </g></g>
  );
}

export function Gnome({ mood = "sly", x, scale = 1 }: { mood?: Mood; x: number; scale?: number }) {
  return (
    <g transform={`translate(${x} 205) scale(${scale})`}><g className={`cp cp-${mood}`}>
      <ellipse cx={-10} cy={-4} rx={12} ry={6} fill="#3a2d4a" stroke={INK} strokeWidth={2.4} />
      <ellipse cx={10} cy={-4} rx={12} ry={6} fill="#3a2d4a" stroke={INK} strokeWidth={2.4} />
      <path d="M-26 -8 L-18 -80 H18 L26 -8 Z" fill="#7a3fd0" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
      <circle cx={0} cy={-42} r={9} fill="#ffcf33" stroke={INK} strokeWidth={2.2} />
      <text x={0} y={-37} textAnchor="middle" fontSize={13} fontWeight={800} fill={INK}>₪</text>
      <Arm x1={-16} y1={-74} x2={-34} y2={-100} color="#7a3fd0" skin="#ffd3b0" />
      <Arm x1={16} y1={-74} x2={36} y2={-96} color="#7a3fd0" skin="#ffd3b0" />
      <circle cx={0} cy={-100} r={27} fill="#ffd3b0" stroke={INK} strokeWidth={2.8} />
      <path d="M-30 -112 Q-4 -196 34 -118 Q10 -126 -30 -112 Z" fill="#e5484d" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
      <path d="M-29 -112 Q0 -122 31 -114" stroke={INK} strokeWidth={2.4} fill="none" />
      <path d="M-26 -96 Q-20 -58 0 -60 Q20 -58 26 -96 Q10 -84 0 -88 Q-10 -84 -26 -96 Z" fill="#fff" stroke={INK} strokeWidth={2.4} />
      <circle cx={0} cy={-96} r={8} fill="#ff8a7a" stroke={INK} strokeWidth={2.2} />
      <path d="M-18 -110 l12 4" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d="M18 -110 l-12 4" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <circle cx={-10} cy={-103} r={3} fill={INK} />
      <circle cx={10} cy={-103} r={3} fill={INK} />
      <path d="M-8 -80 q8 8 16 0" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </g></g>
  );
}

/* ---------- фоны 360×220 ---------- */
const cloud = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={0.9}>
    <ellipse cx={0} cy={0} rx={22} ry={9} />
    <ellipse cx={14} cy={-6} rx={14} ry={9} />
    <ellipse cx={-12} cy={-5} rx={11} ry={8} />
  </g>
);
const awning = (x: number, w: number, c1: string) => (
  <g>
    <rect x={x} y={92} width={w} height={62} fill="#d9a35f" stroke={INK} strokeWidth={2.4} />
    {Array.from({ length: 6 }, (_, i) => (
      <rect key={i} x={x + (i * w) / 6} y={76} width={w / 6} height={22} fill={i % 2 ? "#fff" : c1} stroke={INK} strokeWidth={2} />
    ))}
  </g>
);

export function Backdrop({ bg, id }: { bg: string; id: string }) {
  const sky = (a: string, b: string) => (
    <>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width={360} height={220} fill={`url(#${id}s)`} />
    </>
  );
  switch (bg) {
    case "fair":
      return (
        <g>
          {sky("#7cc8ff", "#e8f7ff")}
          {cloud(70, 30)}
          {cloud(290, 44, 0.8)}
          <path d="M0 30 Q90 60 180 30 T360 30" fill="none" stroke={INK} strokeWidth={2} />
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${i * 45 + 8} ${34 + (i % 2 ? 6 : 12)} l10 0 l-5 14 z`} fill={["#ff5e7a", "#ffcf33", "#3ccf91", "#3aa0ff"][i % 4]} stroke={INK} strokeWidth={1.4} />
          ))}
          <rect y={160} width={360} height={60} fill="#8fd96a" />
          <rect y={158} width={360} height={5} fill="#6cc24a" />
          {awning(14, 100, "#e5484d")}
          {awning(246, 100, "#3aa0ff")}
          <rect y={178} width={360} height={42} fill="#f3d9a4" opacity={0.7} />
        </g>
      );
    case "street":
      return (
        <g>
          {sky("#9ad7ff", "#f4fbff")}
          {cloud(300, 28, 0.8)}
          {[[10, 70, 70, "#ff9f7a"], [88, 40, 80, "#8aa6ff"], [176, 64, 66, "#ffd36b"], [250, 34, 100, "#7fd8b0"]].map(([x, y, w, c], i) => (
            <g key={i}>
              <rect x={x as number} y={y as number} width={w as number} height={170 - (y as number)} fill={c as string} stroke={INK} strokeWidth={2.4} />
              {Array.from({ length: 3 }, (_, r) =>
                Array.from({ length: Math.floor((w as number) / 26) }, (_, k) => (
                  <rect key={`${r}${k}`} x={(x as number) + 8 + k * 24} y={(y as number) + 12 + r * 28} width={14} height={16} fill="#fff7c7" stroke={INK} strokeWidth={1.6} />
                ))
              )}
            </g>
          ))}
          <rect y={168} width={360} height={52} fill="#7b7f8c" />
          <rect y={166} width={360} height={8} fill="#c9ccd6" stroke={INK} strokeWidth={1.6} />
          {[20, 110, 200, 290].map((x) => (
            <rect key={x} x={x} y={198} width={46} height={5} rx={2} fill="#fff" opacity={0.85} />
          ))}
        </g>
      );
    case "park":
      return (
        <g>
          {sky("#7fd0ff", "#eaffe8")}
          {cloud(80, 34)}
          <ellipse cx={90} cy={190} rx={200} ry={60} fill="#7fd16a" />
          <ellipse cx={300} cy={200} rx={170} ry={56} fill="#62c24e" />
          <rect x={286} y={86} width={14} height={78} fill="#9a6a3a" stroke={INK} strokeWidth={2.4} />
          <circle cx={293} cy={72} r={38} fill="#3fae4b" stroke={INK} strokeWidth={2.6} />
          <circle cx={270} cy={90} r={22} fill="#52c45c" stroke={INK} strokeWidth={2.2} />
          <path d="M120 220 Q170 180 230 170" stroke="#f3d9a4" strokeWidth={26} fill="none" opacity={0.8} />
        </g>
      );
    case "school":
      return (
        <g>
          {sky("#8fd3ff", "#f1fbff")}
          {cloud(300, 30, 0.8)}
          <rect x={30} y={60} width={300} height={110} fill="#ffb86b" stroke={INK} strokeWidth={2.8} />
          <path d="M20 62 L180 22 L340 62 Z" fill="#e5484d" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
          <rect x={156} y={112} width={48} height={58} rx={6} fill="#7a4a2b" stroke={INK} strokeWidth={2.4} />
          {[52, 100, 232, 280].map((x) => (
            <rect key={x} x={x} y={84} width={30} height={34} fill="#cfeeff" stroke={INK} strokeWidth={2.2} />
          ))}
          <line x1={180} y1={22} x2={180} y2={0} stroke={INK} strokeWidth={2.4} />
          <path d="M180 2 h26 l-6 6 l6 6 h-26 z" fill="#3aa0ff" stroke={INK} strokeWidth={1.6} />
          <rect y={170} width={360} height={50} fill="#8fd96a" />
        </g>
      );
    case "shop":
      return (
        <g>
          <rect width={360} height={220} fill="#ffe9c7" />
          {[40, 90, 140].map((y, r) => (
            <g key={y}>
              <rect x={10} y={y} width={340} height={6} fill="#a8703a" stroke={INK} strokeWidth={1.6} />
              {Array.from({ length: 11 }, (_, i) => (
                <rect key={i} x={18 + i * 30} y={y - 22 + (i % 3) * 3} width={22} height={22 - (i % 3) * 3} rx={3} fill={["#ff5e7a", "#3aa0ff", "#ffcf33", "#3ccf91", "#b074ff"][(i + r) % 5]} stroke={INK} strokeWidth={1.6} />
              ))}
            </g>
          ))}
          <rect y={178} width={360} height={42} fill="#d9b98a" />
          <rect y={176} width={360} height={5} fill="#b58a55" />
        </g>
      );
    case "room":
      return (
        <g>
          <rect width={360} height={220} fill="#d8cffa" />
          <rect x={220} y={30} width={100} height={80} fill="#9ad7ff" stroke={INK} strokeWidth={2.8} />
          <line x1={270} y1={30} x2={270} y2={110} stroke={INK} strokeWidth={2.4} />
          <line x1={220} y1={70} x2={320} y2={70} stroke={INK} strokeWidth={2.4} />
          <rect x={30} y={40} width={60} height={46} fill="#ffcf33" stroke={INK} strokeWidth={2.4} />
          <text x={60} y={72} textAnchor="middle" fontSize={26}>🚀</text>
          <rect y={176} width={360} height={44} fill="#c49a6c" />
          <rect y={174} width={360} height={5} fill="#a8794a" />
        </g>
      );
    case "home":
      return (
        <g>
          <rect width={360} height={220} fill="#ffe0cf" />
          <rect x={30} y={30} width={80} height={56} fill="#fff" stroke={INK} strokeWidth={2.6} />
          <text x={70} y={68} textAnchor="middle" fontSize={30}>🖼️</text>
          <rect x={240} y={20} width={90} height={80} fill="#a5deff" stroke={INK} strokeWidth={2.6} />
          <line x1={285} y1={20} x2={285} y2={100} stroke={INK} strokeWidth={2.2} />
          <rect y={178} width={360} height={42} fill="#d3a678" />
          <rect y={176} width={360} height={5} fill="#b07f50" />
          <rect x={90} y={150} width={180} height={12} rx={4} fill="#a8703a" stroke={INK} strokeWidth={2.4} />
          <rect x={104} y={160} width={10} height={32} fill="#8d5a2c" stroke={INK} strokeWidth={2} />
          <rect x={246} y={160} width={10} height={32} fill="#8d5a2c" stroke={INK} strokeWidth={2} />
        </g>
      );
    case "night":
      return (
        <g>
          {sky("#1d1b4d", "#4a2d7a")}
          {Array.from({ length: 22 }, (_, i) => (
            <circle key={i} cx={(i * 73) % 360} cy={(i * 41) % 130} r={i % 3 ? 1.4 : 2.2} fill="#fff" opacity={0.85} />
          ))}
          <circle cx={300} cy={44} r={22} fill="#fff7c7" stroke={INK} strokeWidth={2} />
          <circle cx={308} cy={40} r={20} fill="#3c2f78" opacity={0.5} />
          <rect y={178} width={360} height={42} fill="#2b2160" />
        </g>
      );
    case "phone":
      return (
        <g>
          {sky("#ff5e7a", "#6c5ce7")}
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={20 + i * 44} y={20 + (i % 3) * 38} width={30} height={30} rx={8} fill={["#fff", "#ffe36b", "#9ff0d0", "#bde0ff"][i % 4]} stroke={INK} strokeWidth={2} opacity={0.7} transform={`rotate(${(i % 2 ? 1 : -1) * 8} ${35 + i * 44} ${35 + (i % 3) * 38})`} />
          ))}
          <rect y={182} width={360} height={38} fill="#2b2160" opacity={0.8} />
        </g>
      );
    case "greenhouse":
      return (
        <g>
          {sky("#c9f2d8", "#effff5")}
          <path d="M30 170 V70 L180 20 L330 70 V170 Z" fill="#dff7ee" stroke={INK} strokeWidth={2.8} opacity={0.95} />
          {[90, 150, 210, 270].map((x) => (
            <line key={x} x1={x} y1={170} x2={x} y2={70 - (x < 180 ? (180 - x) / 3 : (x - 180) / 3) + 40} stroke={INK} strokeWidth={1.6} opacity={0.5} />
          ))}
          <line x1={30} y1={110} x2={330} y2={110} stroke={INK} strokeWidth={1.6} opacity={0.5} />
          <rect y={170} width={360} height={50} fill="#9a6a3a" />
          <rect y={168} width={360} height={6} fill="#6cc24a" />
          {[60, 120, 240, 300].map((x, i) => (
            <text key={i} x={x} y={166} textAnchor="middle" fontSize={22}>🌱</text>
          ))}
        </g>
      );
    case "island":
      return (
        <g>
          {sky("#6fd0ff", "#c8f0ff")}
          <circle cx={290} cy={40} r={20} fill="#ffe36b" stroke={INK} strokeWidth={2} />
          <rect y={120} width={360} height={100} fill="#3aa0e6" />
          <path d="M0 132 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#bfe9ff" strokeWidth={3} />
          <ellipse cx={180} cy={190} rx={190} ry={42} fill="#f3d9a4" stroke={INK} strokeWidth={2.6} />
          <path d="M295 170 q4 -50 -6 -86" stroke="#7a4a2b" strokeWidth={9} fill="none" strokeLinecap="round" />
          <g fill="#3fae4b" stroke={INK} strokeWidth={2}>
            <path d="M289 84 q-30 -18 -48 6 q26 -6 48 -6z" />
            <path d="M289 84 q30 -18 48 6 q-26 -6 -48 -6z" />
            <path d="M289 84 q-8 -30 -30 -34 q20 14 30 34z" />
            <path d="M289 84 q8 -30 30 -34 q-20 14 -30 34z" />
          </g>
        </g>
      );
    case "bikeshop":
      return (
        <g>
          <rect width={360} height={220} fill="#e3eeff" />
          {[50, 150, 250, 330].map((x, i) => (
            <g key={x}>
              <circle cx={x} cy={64} r={24} fill="none" stroke={INK} strokeWidth={4} />
              <circle cx={x} cy={64} r={4} fill={INK} />
              {[0, 45, 90, 135].map((d) => (
                <line key={d} x1={x - 22 * Math.cos((d * Math.PI) / 180)} y1={64 - 22 * Math.sin((d * Math.PI) / 180)} x2={x + 22 * Math.cos((d * Math.PI) / 180)} y2={64 + 22 * Math.sin((d * Math.PI) / 180)} stroke={INK} strokeWidth={1} />
              ))}
              {i === 1 && <circle cx={x} cy={64} r={28} fill="none" stroke="#ff5e7a" strokeWidth={2} />}
            </g>
          ))}
          <rect x={20} y={110} width={140} height={34} rx={6} fill="#ffcf33" stroke={INK} strokeWidth={2.6} />
          <text x={90} y={133} textAnchor="middle" fontSize={16} fontWeight={800} fill={INK}>SALE</text>
          <rect y={178} width={360} height={42} fill="#c4cad8" />
        </g>
      );
    case "stage":
      return (
        <g>
          {sky("#2b2160", "#6c5ce7")}
          <path d="M180 0 L90 200 L270 200 Z" fill="#fff7c7" opacity={0.28} />
          {Array.from({ length: 16 }, (_, i) => (
            <rect key={i} x={(i * 53) % 350} y={(i * 37) % 120} width={7} height={11} fill={["#ffcf33", "#ff5e7a", "#3ccf91", "#3aa0ff"][i % 4]} transform={`rotate(${i * 25} ${(i * 53) % 350} ${(i * 37) % 120})`} />
          ))}
          <rect y={182} width={360} height={38} fill="#ffcf33" stroke={INK} strokeWidth={2.6} />
        </g>
      );
    case "math":
    default:
      return (
        <g>
          <rect width={360} height={220} fill="#e9f2ff" />
          {Array.from({ length: 13 }, (_, i) => (
            <line key={`v${i}`} x1={i * 30} y1={0} x2={i * 30} y2={220} stroke="#b9d3ff" strokeWidth={1} />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 30} x2={360} y2={i * 30} stroke="#b9d3ff" strokeWidth={1} />
          ))}
          {["+", "−", "×", "₪", "%", "=", "÷"].map((s, i) => (
            <text key={i} x={24 + i * 52} y={34 + (i % 3) * 46} fontSize={26} fontWeight={800} fill="#7aa2ff" opacity={0.55} transform={`rotate(${(i % 2 ? 1 : -1) * 10} ${24 + i * 52} ${34 + (i % 3) * 46})`}>
              {s}
            </text>
          ))}
          <rect y={184} width={360} height={36} fill="#cfdcf5" />
        </g>
      );
  }
}

export const BGS = ["fair", "street", "park", "school", "shop", "room", "home", "night", "phone", "greenhouse", "island", "bikeshop", "stage", "math"] as const;
export type Bg = (typeof BGS)[number];
export type { ReactNode };
