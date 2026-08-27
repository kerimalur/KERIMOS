import { Empty, cx } from "@/components/ui";
import { MIN_VERLAUF, type VerlaufBlock } from "@/lib/backtest-types";

/**
 * Wie knapp es war — die einzige Auswertung im Journal, die nicht vom
 * Einstieg handelt.
 *
 * Links die Stopouts (war ein Teil-TP drin), rechts die Gewinner (sass der
 * Stop richtig). Server-Komponente, reines Markup: ein Balken ist ein div
 * mit Breite.
 */

/** Die Klassen, an denen eine Konsequenz hängt — die stehen hervorgehoben. */
const AUFFAELLIG = new Set(["knapp", "ueber_1"]);

export function BacktestVerlauf({ bloecke }: { bloecke: VerlaufBlock[] }) {
  const irgendwas = bloecke.some((b) => b.erfasst > 0);

  if (!irgendwas) {
    return (
      <Empty>
        Noch nichts erfasst. Die Angabe steht ab sofort im Trade-Formular — eine
        Auswahl pro Trade, geschätzt reicht.
      </Empty>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {bloecke.map((b) => (
        <div key={b.feld}>
          <p className="text-sm font-medium text-ink">{b.frage}</p>
          <p className="mb-3 mt-0.5 text-[11px] text-ink-faint">
            {b.erfasst} von {b.gilt} erfasst
            {b.erfasst < b.gilt && b.gilt > 0 && (
              <> · die übrigen {b.gilt - b.erfasst} zählen nirgends mit</>
            )}
          </p>

          {b.erfasst === 0 ? (
            <p className="rounded-xl bg-sand/60 px-3 py-4 text-center text-xs text-ink-muted">
              Für diese Frage ist noch nichts hinterlegt.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {b.klassen.map((k) => (
                <li key={k.key} className="flex items-center gap-2.5">
                  <span className="w-32 shrink-0 text-right text-[11px] text-ink-muted">
                    {k.label}
                  </span>
                  <span className="relative h-4 flex-1 overflow-hidden rounded bg-sand/50">
                    <span className={cx("absolute inset-y-0 left-0 rounded",
                      AUFFAELLIG.has(k.key) ? "bg-accent/70" : "bg-ink-faint/50")}
                      style={{ width: `${Math.max(k.anteil * 100, k.n > 0 ? 3 : 0)}%` }} />
                  </span>
                  <span className="num w-14 shrink-0 text-right text-[11px] text-ink-soft">
                    {k.n}
                    {k.n > 0 && (
                      <span className="ml-1 text-ink-faint">
                        {Math.round(k.anteil * 100)}%
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className={cx("mt-3 rounded-xl px-3 py-2 text-xs leading-relaxed",
            b.befund ? "bg-sand/60 text-ink-soft" : "bg-sand/40 text-ink-faint")}>
            {b.befund ?? `Ab ${MIN_VERLAUF} erfassten Angaben steht hier ein Befund. `
              + "Aus fünf Trades folgt nichts, was einen Stopabstand ändern dürfte."}
          </p>
        </div>
      ))}
    </div>
  );
}
