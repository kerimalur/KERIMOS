"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

/**
 * Eine aufklappbare Gruppe — für die Kategorien der aktiven Trades.
 *
 * Der Zustand liegt in `localStorage` und nicht nur im Speicher: Kerim klappt
 * „Später" einmal zu, weil ihn diese Zeilen heute nicht interessieren, und
 * erwartet, dass sie beim nächsten Öffnen der Seite zu bleiben. Ein Zustand,
 * der bei jedem Seitenaufruf zurückspringt, wird nach dem dritten Mal nicht
 * mehr benutzt.
 *
 * Gelesen wird erst nach dem ersten Rendern (`useEffect`), nie währenddessen:
 * Der Server kennt `localStorage` nicht, und ein davon abhängiger erster
 * Aufbau würde sich vom Server-HTML unterscheiden — React verwirft dann den
 * ganzen Baum und meldet einen Hydration-Fehler.
 */
export function GruppenBox({
  schluessel, titel, punkt, anzahl, children,
}: {
  /** Eindeutig je Gruppe UND je Seite, sonst teilen sich zwei Listen einen Zustand. */
  schluessel: string;
  titel: string;
  /** Tailwind-Klasse für den Farbpunkt, oder null für „ohne Kategorie". */
  punkt: string | null;
  anzahl: number;
  children: React.ReactNode;
}) {
  const [zu, setZu] = useState(false);

  useEffect(() => {
    try {
      setZu(window.localStorage.getItem(`kat-zu:${schluessel}`) === "1");
    } catch {
      // Privates Fenster oder blockierter Speicher: dann bleibt alles offen.
      // Das ist der harmlosere der beiden Fehler.
    }
  }, [schluessel]);

  const umschalten = () => {
    const neu = !zu;
    setZu(neu);
    try {
      if (neu) window.localStorage.setItem(`kat-zu:${schluessel}`, "1");
      else window.localStorage.removeItem(`kat-zu:${schluessel}`);
    } catch {
      // Nicht speichern zu können ist kein Grund, das Zuklappen zu verweigern.
    }
  };

  return (
    <div>
      <button type="button" onClick={umschalten} aria-expanded={!zu}
        className="mb-1.5 flex w-full items-center gap-2 text-left transition
                   hover:opacity-80">
        <span className={cx("inline-block text-ink-faint transition-transform duration-150",
          zu ? "-rotate-90" : "rotate-0")}>⌄</span>
        <span className={cx("h-2 w-2 shrink-0 rounded-full",
          punkt ?? "bg-transparent ring-1 ring-line")} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {titel}
        </span>
        <span className="text-[11px] text-ink-faint">{anzahl}</span>
        <span className="h-px flex-1 bg-line/40" />
      </button>
      {!zu && children}
    </div>
  );
}
