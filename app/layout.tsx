import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GameProvider } from "@/lib/store";
import { CloudBridge } from "@/components/CloudBridge";
import { META } from "@/lib/meta";
import Nav from "@/components/Nav";
import MusicController from "@/components/MusicController";
import HeaderLang from "@/components/HeaderLang";
import { PlayGuard } from "@/components/PlayGuard";

// По умолчанию иврит. Русская версия живёт в lib/meta.ts и подставляется на клиенте.
export const metadata: Metadata = {
  title: META.he.title,
  description: META.he.description,
  robots: { index: false, follow: false },
  openGraph: { title: META.he.title, description: META.he.description, locale: "he_IL", type: "website" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Синхронно, до первой отрисовки: русский только если он выбран вручную. Иначе остаётся he/rtl.
const LANG_BOOT = `try{var s=JSON.parse(localStorage.getItem("finni-state-v1")||"null");if(s&&s.langChosen===true&&s.lang==="ru"){var d=document.documentElement;d.lang="ru";d.dir="ltr"}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT }} />
      </head>
      <body>
        <GameProvider>
          <CloudBridge>
            <main className="wrap">{children}</main>
            <Nav />
            <HeaderLang />
            <MusicController />
            <PlayGuard />
          </CloudBridge>
        </GameProvider>
      </body>
    </html>
  );
}
