"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useGame } from "@/lib/store";
import { setSound } from "@/lib/fx";

const ITEMS = [
  { href: "/", key: "navHome", icon: "🏠" },
  { href: "/charge", key: "navCharge", icon: "🔋" },
  { href: "/mission", key: "navMission", icon: "🎯" },
  { href: "/quest", key: "navQuest", icon: "🎮" },
  { href: "/chat", key: "navChat", icon: "🦝" },
  { href: "/dream", key: "navDream", icon: "🐷" },
  { href: "/books", key: "navBooks", icon: "📚" },
  { href: "/parents", key: "navParents", icon: "👪" },
];

export default function Nav() {
  const path = usePathname();
  const { t, s, ready } = useGame();
  useEffect(() => {
    document.documentElement.dataset.big = s.fxBig ? "1" : "0";
    document.documentElement.dataset.motion = s.fxMotion ? "on" : "off";
    setSound(s.fxSound);
  }, [s.fxBig, s.fxMotion, s.fxSound]);
  if (!ready) return <nav className="nav" aria-hidden="true" />;
  return (
    <nav className="nav">
      {ITEMS.filter((i) => i.href !== "/charge" || s.chargeOn).map((i) => (
        <Link key={i.href} href={i.href} className={path === i.href ? "active" : ""}>
          <span className="ico">{i.icon}</span>
          {t(i.key)}
        </Link>
      ))}
    </nav>
  );
}
