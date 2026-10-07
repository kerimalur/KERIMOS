"use client";
import { useEffect, useState } from "react";
import { cx } from "./ui";

/**
 * Hell oder dunkel (Design D, 07.10.2026).
 *
 * Die Wahl liegt in localStorage unter `kerimos-thema` ("hell" | "dunkel").
 * Ohne Wahl folgt KerimOS dem System — auch live, wenn das Handy abends
 * umschaltet. Das Skript in layout.tsx setzt die Klasse schon vor dem ersten
 * Bild; dieser Knopf ändert sie nur noch.
 */
export const THEMA_SCHLUESSEL = "kerimos-thema";

export const THEMA_SKRIPT =
  `(function(){try{var t=localStorage.getItem('${THEMA_SCHLUESSEL}');` +
  `var d=t==='dunkel'||(t!=='hell'&&window.matchMedia('(prefers-color-scheme: dark)').matches);` +
  `document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

const SONNE = "M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z";
const MOND = "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z";

export function ThemaSchalter({ aufFoto = false }: { aufFoto?: boolean }) {
  const [dunkel, setDunkel] = useState<boolean | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    setDunkel(html.classList.contains("dark"));
    // Ohne eigene Wahl dem System folgen, auch wenn es während der Sitzung wechselt.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const folgen = () => {
      let wahl: string | null = null;
      try { wahl = localStorage.getItem(THEMA_SCHLUESSEL); } catch { /* privat */ }
      if (wahl) return;
      html.classList.toggle("dark", mq.matches);
      setDunkel(mq.matches);
    };
    mq.addEventListener("change", folgen);
    return () => mq.removeEventListener("change", folgen);
  }, []);

  const umschalten = () => {
    const neu = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", neu);
    try { localStorage.setItem(THEMA_SCHLUESSEL, neu ? "dunkel" : "hell"); } catch { /* privat */ }
    setDunkel(neu);
  };

  return (
    <button type="button" onClick={umschalten}
      aria-label="Hell oder dunkel umschalten"
      className={cx(
        "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium",
        "transition duration-200 ease-tactile active:scale-[0.97]",
        aufFoto
          ? "border-white/25 bg-black/25 text-photo backdrop-blur hover:border-white/50"
          : "border-line text-ink-soft hover:border-line-strong hover:text-ink",
      )}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dunkel ? SONNE : MOND} />
      </svg>
      {dunkel === null ? "Thema" : dunkel ? "Hell" : "Dunkel"}
    </button>
  );
}
