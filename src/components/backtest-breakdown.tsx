"use client";
import { useState } from "react";
import { Empty, cx } from "@/components/ui";
import {
  BREAKDOWN_DIMENSIONS, BREAKDOWN_LABEL,
  type BreakdownDimension, type BreakdownRow,
} from "@/lib/backtest-types";

/**
 * "Anpassbares Output": alle Dimensionen werden serverseitig fertig berechnet
 * übergeben (billig bei dieser Trade-Zahl) - hier wird nur umgeschaltet,
 * welche Auswertung sichtbar ist. Kein Re-Fetch beim Wechseln, dadurch
 * greifen die Einblend-Animationen bei jedem Wechsel neu.
 */
export function BacktestBreakdown({
  data, slData,
}: {
  data: Record<BreakdownDimension, BreakdownRow[]>;
  /** Dieselben Dimensionen, aber nur über die Stopouts gerechnet. */
  slData?: Record<BreakdownDimension, BreakdownRow[]>;
}) {
  const [dimension, setDimension] = useState<BreakdownDimension>("gva_typ");
  const [nurSL, setNurSL] = useState(false);
  const quelle = nurSL && slData ? slData : data;
  const rows = quelle[dimension] ?? [];
  const zeigeR = dimension !== "skip_grund";

  // Gemeinsame Skala für die R-Balken, damit die Längen untereinander
  // vergleichbar sind statt jede Zeile für sich normiert.
  const maxBetrag = Math.max(1, ...rows.map((r) => Math.abs(r.gesamtR)));
  const maxN = Math.max(1, ...rows.map((r) => r.n));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {BREAKDOWN_DIMENSIONS.map((d) => (
          <button key={d} type="button" onClick={() => setDimension(d)}
            className={cx(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition duration-150",
              "ease-tactile active:scale-[0.96]",
              d === dimension
                ? "border-accent/60 bg-accent-tint text-accent-soft"
                : "border-line bg-field text-ink-muted hover:border-line-strong hover:text-ink-soft",
            )}>
            {BREAKDOWN_LABEL[d]}
          </button>
        ))}
      </div>

      {/* Der Stopout-Blick beantwortet eine andere Frage als der Gesamtblick:
          nicht "was funktioniert", sondern "was steht in den Verlierern drin".
          Genau dafür sind die Anmerkungen gedacht. */}
      {slData && dimension !== "skip_grund" && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setNurSL(!nurSL)}
            className={cx("rounded-lg border px-2.5 py-1 text-xs transition",
              nurSL
                ? "border-bad/50 bg-bad-tint text-bad-bright"
                : "border-line bg-field text-ink-muted hover:text-ink-soft")}>
            {nurSL ? "nur Stopouts" : "alle Trades"}
          </button>
          <span className="text-[11px] text-ink-faint">
            {nurSL
              ? "Zeigt, was in den Verlust-Trades stand."
              : "Umschalten, um nur die Stopouts zu untersuchen."}
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>Noch keine Daten für diese Auswertung.</Empty>
      ) : (
        <ul key={dimension} className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.label} className="animate-pop"
              style={{ animationDelay: `${Math.min(i * 45, 400)}ms` }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm text-ink">{r.label}</span>
                <span className="tabular text-xs text-ink-muted">
                  {r.n} {r.n === 1 ? "Trade" : "Trades"}
                  {zeigeR && !nurSL && r.winrate !== null && ` · ${r.winrate.toFixed(0)} % WR`}
                  {zeigeR && !nurSL && r.slQuote !== null && r.slQuote > 0 && (
                    <span className={r.slQuote >= 50 ? "text-bad-bright" : undefined}>
                      {" "}· {r.slQuote.toFixed(0)} % SL
                    </span>
                  )}
                  {zeigeR && r.expectancy !== null &&
                    ` · Ø ${r.expectancy > 0 ? "+" : ""}${r.expectancy.toFixed(2)} R`}
                </span>
              </div>

              {zeigeR ? (
                <RBalken gesamtR={r.gesamtR} maxBetrag={maxBetrag} />
              ) : (
                <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-sand">
                  <div className="h-full animate-revealW rounded-full bg-ink-faint/40"
                    style={{
                      width: `${(r.n / maxN) * 100}%`,
                      ["--w" as string]: `${(r.n / maxN) * 100}%`,
                    }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {zeigeR && (
        <p className="mt-3 text-[11px] text-ink-faint">
          Balken = Gesamt R der Gruppe, gemeinsame Skala. Ein Trade mit
          mehreren Confluence- oder Anmerkung-Tags zählt in jeder seiner
          Gruppen einmal — die Summe liegt deshalb bewusst über der Trade-Zahl.
        </p>
      )}
    </div>
  );
}

/** Balken ab der Mitte: rechts Gewinn, links Verlust. */
function RBalken({ gesamtR, maxBetrag }: { gesamtR: number; maxBetrag: number }) {
  const anteil = (Math.abs(gesamtR) / maxBetrag) * 50; // max. halbe Breite
  const positiv = gesamtR >= 0;

  return (
    <div className="relative mt-1.5 h-[7px] overflow-hidden rounded-full bg-sand">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong/60" />
      <div
        className={cx("absolute inset-y-0 animate-revealW rounded-full",
          positiv ? "left-1/2 bg-good" : "right-1/2 bg-bad")}
        style={{ width: `${anteil}%`, ["--w" as string]: `${anteil}%` }}
      />
    </div>
  );
}
