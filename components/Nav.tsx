"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useGame } from "@/lib/store";
import { setSound } from "@/lib/fx";

const ITEMS = [
  { href: "/", key: "navHome", icon: "🏠" },
  { href: "/mission", key: "navMission", icon: "🎯" },
  { href: "/quest", key: "navQuest", icon: "🎮" },
  { href: "/chat", key: "navChat", icon: "🦝" },
  { href: "/dream", key: "navDream", icon: "🐷" },
  { href: "/books", key: "navBooks", icon: "📚" },
  { href: "/parents", key: "navParents", icon: "👪" },
];

export default function Nav() {
  const path = usePathname();
  const { t, s } = useGame();
  useEffect(() => {
    document.documentElement.dataset.big = s.fxBig ? "1" : "0";
    document.documentElement.dataset.motion = s.fxMotion ? "on" : "off";
    setSound(s.fxSound);
  }, [s.fxBig, s.fxMotion, s.fxSound]);
  return (
    <nav className="nav">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={path === i.href ? "active" : ""}>
          <span className="ico">{i.icon}</span>
          {t(i.key)}
        </Link>
      ))}
    </nav>
  );
}
