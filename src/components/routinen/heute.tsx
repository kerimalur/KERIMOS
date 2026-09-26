"use client";
import { useTransition } from "react";
import { cx } from "@/components/ui";
import { heuteFaellig, uhrzeitKurz, zusatz, type RoutineZiel } from "@/lib/routinen/typen";
import { erledigtUmschalten } from "@/lib/routinen/actions";

/**
 * Was heute für die eigenen Ziele ansteht — zum Abhaken.
 *
 * Abhaken zählt bei „x-mal pro Woche" mit („noch 2× diese Woche") und stellt
 * bei allen Handlungen die Erinnerung für heute ab. Ein zweiter Tipp nimmt
 * den Haken wieder weg.
 */
export function RoutinenHeute({ ziele, wochentag, heute, className }: {
  ziele: RoutineZiel[]; wochentag: number; heute: string; className?: string;
}) {
  const gruppen = heuteFaellig(ziele, wochentag, heute);
  const [laeuft, start] = useTransition();
  if (gruppen.length === 0) return null;

  return (
    <div className={cx("space-y-3", laeuft && "opacity-70", className)}>
      {gruppen.map(({ ziel, handlungen }) => (
        <div key={ziel.id}>
          <p className="text-[11px] font-medium text-ink-faint">Für „{ziel.titel}"</p>
          <ul className="mt-1 space-y-1">
            {handlungen.map((h) => {
              const fertig = h.erledigt.includes(heute);
              const extra = zusatz(h);
              return (
                <li key={h.id}>
                  <button type="button"
                    onClick={() => start(async () => { await erledigtUmschalten(h.id, heute); })}
                    className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left
                               transition hover:bg-sand/60">
                    <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[12px] transition",
                      fertig ? "border-good bg-good text-ink-on" : "border-line-strong text-transparent group-hover:border-accent")}>
                      ✓
                    </span>
                    <span className={cx("min-w-0 flex-1 text-sm", fertig ? "text-ink-faint line-through" : "text-ink-soft")}>
                      {h.titel}
                    </span>
                    {extra && <span className="shrink-0 text-[11px] text-ink-muted">{extra}</span>}
                    {h.uhrzeit && <span className="tabular shrink-0 text-xs text-ink-faint">{uhrzeitKurz(h.uhrzeit)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
