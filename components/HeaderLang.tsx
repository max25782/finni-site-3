"use client";

// Переключатель языка в шапке всех страниц, кроме главной (там он в самой странице).
import { usePathname } from "next/navigation";
import LangSwitch from "@/components/LangSwitch";
import { useGame } from "@/lib/store";

export default function HeaderLang() {
  const path = usePathname();
  const { ready } = useGame();
  if (!ready || path === "/") return null;
  return (
    <div className="lang-fab">
      <LangSwitch />
    </div>
  );
}
