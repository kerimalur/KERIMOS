"use client";
import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * Kleines Info-Zeichen mit Erklärung (29.09.2026) — Kerim: „Risk-on steht
 * da, aber ich sehe nicht, was es bedeutet." Öffnet beim Überfahren und beim
 * Antippen (Handy), und verhindert dabei, dass ein umgebender Link auslöst.
 */
export function Info({ titel, children, breit = 280, className }: {
  titel?: string;
  children: ReactNode;
  breit?: number;
  className?: string;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <span className={cx("relative inline-flex align-middle", className)}
      onMouseEnter={() => setOffen(true)} onMouseLeave={() => setOffen(false)}>
      <button type="button" aria-label={titel ? `Erklärung: ${titel}` : "Erklärung"} aria-expanded={offen}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOffen((x) => !x); }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line-strong
                   text-[10px] font-semibold leading-none text-ink-faint transition hover:border-accent hover:text-accent-soft">
        i
      </button>
      {offen && (
        <span role="tooltip" style={{ width: breit }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="absolute left-1/2 top-6 z-40 -translate-x-1/2 rounded-xl border border-line-strong
                     bg-[#17130F] p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal
                     text-ink-soft shadow-card">
          {titel && <strong className="mb-1 block text-ink">{titel}</strong>}
          {children}
        </span>
      )}
    </span>
  );
}
