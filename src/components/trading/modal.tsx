"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/ui";

/**
 * Ein Popup, das wirklich über der Seite liegt.
 *
 * Der Grund für das Portal ist eine Falle, die man einmal erlebt haben muss:
 * `position: fixed` bezieht sich NICHT auf den Bildschirm, sobald irgendein
 * Vorfahr eine `transform` trägt — dann wird dieser Vorfahr zum Bezugsrahmen.
 * Genau das passiert hier überall, weil `Card` die Klasse `animate-pop`
 * benutzt und deren Animation mit `fill-mode: both` läuft: der Endzustand
 * `transform: scale(1)` bleibt nach dem Abspielen stehen. Ein Overlay in einer
 * Karte deckte deshalb nur die Karte ab, der Rest der Seite blieb hell und
 * bedienbar — es sah aus wie ein Anzeigefehler, war aber Layout-Logik.
 *
 * `createPortal` hängt den Dialog direkt an `document.body`. Dort gibt es
 * keinen transformierten Vorfahr, und `fixed` heisst wieder Bildschirm.
 */
export function Modal({
  offen, schliessen, breite = "max-w-3xl", children,
}: {
  offen: boolean;
  schliessen: () => void;
  /** Tailwind-Breitenklasse des Kastens. */
  breite?: string;
  children: React.ReactNode;
}) {
  // Erst nach dem ersten Rendern im Browser: auf dem Server gibt es kein
  // `document`, und ein Portal dorthin wäre ein Fehler beim Server-Rendern.
  const [imBrowser, setImBrowser] = useState(false);
  useEffect(() => setImBrowser(true), []);

  useEffect(() => {
    if (!offen) return;
    const auf = (e: KeyboardEvent) => { if (e.key === "Escape") schliessen(); };
    window.addEventListener("keydown", auf);
    // Hintergrund festhalten: sonst scrollt beim Wischen auf dem Handy die
    // Seite hinter dem Dialog weg und man findet nicht zurück.
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", auf);
      document.body.style.overflow = vorher;
    };
  }, [offen, schliessen]);

  if (!offen || !imBrowser) return null;

  return createPortal(
    <div
      role="dialog" aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto
                 bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={schliessen}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cx(
          "w-full rounded-t-3xl border border-line bg-card shadow-2xl",
          "max-h-[92vh] overflow-y-auto sm:rounded-3xl",
          breite,
        )}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Kopfzeile eines Dialogs: bleibt beim Scrollen stehen. */
export function ModalKopf({
  children, schliessen,
}: { children: React.ReactNode; schliessen: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2
                    border-b border-line/70 bg-card/95 px-5 py-4 backdrop-blur">
      {children}
      <button type="button" onClick={schliessen} aria-label="Schliessen"
        className="ml-auto rounded-xl border border-line px-2.5 py-1 text-xs text-ink-muted
                   transition hover:text-ink active:scale-95">
        schliessen
      </button>
    </div>
  );
}
