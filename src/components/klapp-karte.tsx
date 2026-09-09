"use client";

import { useEffect, useState } from "react";
import { Card, cx } from "@/components/ui";

/**
 * Eine ganze Karte zum Zuklappen — der Zustand überlebt das Schliessen der App.
 *
 * Die Kategorien innerhalb der aktiven Trades liessen sich schon einzeln
 * zuklappen (`components/trading/gruppen-box.tsx`), die Karte darum herum
 * nicht. Wer die Trades heute gar nicht sehen will, musste jede Kategorie
 * einzeln wegklicken — und beim nächsten Öffnen standen sie trotzdem wieder
 * da, weil die Karte selbst nichts gemerkt hat.
 *
 * Beides zusammen ergibt jetzt genau das, was gebraucht wird: alles zu, oder
 * nur die eine Kategorie offen, die heute zählt. Zwei getrennte Schlüssel im
 * `localStorage`, deshalb überschreibt keiner den anderen.
 *
 * Gelesen wird erst nach dem ersten Rendern (`useEffect`), nie währenddessen:
 * Der Server kennt `localStorage` nicht, und ein davon abhängiger erster
 * Aufbau würde sich vom Server-HTML unterscheiden — React verwirft dann den
 * ganzen Baum und meldet einen Hydration-Fehler.
 */
export function KlappKarte({
  schluessel, titel, zusatz, aktion, children,
}: {
  /** Eindeutig je Karte, sonst teilen sich zwei Karten einen Zustand. */
  schluessel: string;
  titel: string;
  /**
   * Steht auch im zugeklappten Zustand neben dem Titel — die eine Zahl, wegen
   * der man die Karte vielleicht doch aufmacht (z.B. „2 erreicht").
   */
  zusatz?: React.ReactNode;
  /** Ein Link o.ä. ganz rechts. Verschwindet mit dem Inhalt. */
  aktion?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [zu, setZu] = useState(false);

  useEffect(() => {
    try {
      setZu(window.localStorage.getItem(`karte-zu:${schluessel}`) === "1");
    } catch {
      // Privates Fenster oder blockierter Speicher: dann bleibt alles offen.
      // Das ist der harmlosere der beiden Fehler.
    }
  }, [schluessel]);

  const umschalten = () => {
    const neu = !zu;
    setZu(neu);
    try {
      if (neu) window.localStorage.setItem(`karte-zu:${schluessel}`, "1");
      else window.localStorage.removeItem(`karte-zu:${schluessel}`);
    } catch {
      // Nicht speichern zu können ist kein Grund, das Zuklappen zu verweigern.
    }
  };

  return (
    <Card className={cx(zu && "py-4")}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={umschalten} aria-expanded={!zu}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition
                     hover:opacity-80">
          <span aria-hidden
            className={cx("inline-block text-ink-faint transition-transform duration-150",
              zu ? "-rotate-90" : "rotate-0")}>
            ⌄
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            {titel}
          </span>
          {zusatz}
        </button>
        {!zu && aktion}
      </div>

      {!zu && <div className="mt-3">{children}</div>}
    </Card>
  );
}
