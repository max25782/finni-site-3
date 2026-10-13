"use client";

// Переключатель языка в шапке всех страниц, кроме главной (там он в самой странице).
import { usePathname } from "next/navigation";
import LangSwitch from "@/components/LangSwitch";

export default function HeaderLang() {
  const path = usePathname();
  if (path === "/") return null;
  return (
    <div className="lang-fab">
      <LangSwitch />
    </div>
  );
}
