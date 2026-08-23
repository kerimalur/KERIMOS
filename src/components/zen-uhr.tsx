"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";

/**
 * Die Zen-Uhr: läuft hoch, sonst nichts.
 *
 * Absichtlich ohne Speichern, ohne Kategorie, ohne Ziel. Jede dieser
 * Funktionen würde eine Frage aufwerfen, die man am Ende der Sitzung
 * beantworten müsste — und genau daran sind die Fokus-Sitzungen gestorben.
 *
 * Gerechnet wird aus einem Startzeitpunkt und nicht durch Hochzählen eines
 * Zählers: Ein Browser-Tab im Hintergrund bekommt seine Timer gedrosselt, ein
 * Zähler ginge dabei nach. Die Differenz zweier Zeitstempel nicht.
 */
export function ZenUhr() {
  const [start, setStart] = useState<number | null>(null);
  const [jetzt, setJetzt] = useState(0);
  const pausiertBei = useRef(0);

  useEffect(() => {
    if (start === null) return;
    const t = setInterval(() => setJetzt(Date.now()), 250);
    return () => clearInterval(t);
  }, [start]);

  const sekunden = start === null
    ? pausiertBei.current
    : pausiertBei.current + Math.max(0, Math.floor((jetzt - start) / 1000));

  const umschalten = useCallback(() => {
    if (start === null) {
      setJetzt(Date.now());
      setStart(Date.now());
    } else {
      pausiertBei.current = sekunden;
      setStart(null);
    }
  }, [start, sekunden]);

  const zuruecksetzen = () => {
    pausiertBei.current = 0;
    setStart(null);
  };

  // Leertaste startet und stoppt — die Hand liegt ohnehin auf der Tastatur.
  useEffect(() => {
    const auf = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); umschalten(); }
    };
    window.addEventListener("keydown", auf);
    return () => window.removeEventListener("keydown", auf);
  }, [umschalten]);

  const std = Math.floor(sekunden / 3600);
  const min = Math.floor((sekunden % 3600) / 60);
  const sek = sekunden % 60;
  const zwei = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper">
      <div className={cx("tabular font-display text-[clamp(3rem,18vw,10rem)] font-bold leading-none",
        start === null ? "text-ink-muted" : "text-ink")}>
        {std > 0 && `${zwei(std)}:`}{zwei(min)}:{zwei(sek)}
      </div>

      <div className="mt-10 flex items-center gap-3">
        <button type="button" onClick={umschalten}
          className={cx("rounded-2xl px-6 py-2.5 text-sm font-medium transition active:scale-95",
            start === null
              ? "bg-accent text-ink-on shadow-glow-accent"
              : "border border-line bg-sand text-ink-soft hover:text-ink")}>
          {start === null ? (sekunden > 0 ? "Weiter" : "Start") : "Pause"}
        </button>
        {sekunden > 0 && start === null && (
          <button type="button" onClick={zuruecksetzen}
            className="rounded-2xl px-4 py-2.5 text-sm text-ink-faint transition hover:text-ink-muted">
            Zurücksetzen
          </button>
        )}
      </div>

      <Link href="/"
        className="absolute bottom-8 text-xs text-ink-faint transition hover:text-ink-muted">
        zurück
      </Link>

      <p className="absolute bottom-16 hidden text-[11px] text-ink-faint sm:block">
        Leertaste startet und pausiert. Nichts davon wird gespeichert.
      </p>
    </div>
  );
}
