"use client";
import { useState } from "react";
import { Select, Empty } from "@/components/ui";
import {
  BREAKDOWN_DIMENSIONS, BREAKDOWN_LABEL,
  type BreakdownDimension, type BreakdownRow,
} from "@/lib/backtest-types";

/**
 * "Anpassbares Output": alle sieben Dimensionen werden serverseitig fertig
 * berechnet übergeben (billig bei der aktuellen Trade-Zahl) - hier wird nur
 * umgeschaltet, welche Tabelle sichtbar ist. Kein Re-Fetch beim Wechseln.
 */
export function BacktestBreakdown({
  data,
}: { data: Record<BreakdownDimension, BreakdownRow[]> }) {
  const [dimension, setDimension] = useState<BreakdownDimension>("gva_typ");
  const rows = data[dimension] ?? [];
  const zeigeR = dimension !== "skip_grund";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">Auswertung nach</span>
        <Select value={dimension} className="w-44"
          onChange={(e) => setDimension(e.target.value as BreakdownDimension)}>
          {BREAKDOWN_DIMENSIONS.map((d) => (
            <option key={d} value={d}>{BREAKDOWN_LABEL[d]}</option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <Empty>Noch keine Daten für diese Auswertung.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="pb-2 font-medium">{BREAKDOWN_LABEL[dimension]}</th>
              <th className="pb-2 text-right font-medium">n</th>
              {zeigeR && <th className="pb-2 text-right font-medium">Winrate</th>}
              {zeigeR && <th className="pb-2 text-right font-medium">Gesamt R</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-line/50">
                <td className="py-1.5 text-ink">{r.label}</td>
                <td className="py-1.5 text-right tabular text-ink-soft">{r.n}</td>
                {zeigeR && (
                  <td className="py-1.5 text-right tabular text-ink-soft">
                    {r.winrate === null ? "—" : `${r.winrate.toFixed(0)} %`}
                  </td>
                )}
                {zeigeR && (
                  <td className={"py-1.5 text-right tabular " +
                    (r.gesamtR > 0 ? "text-good-bright" : r.gesamtR < 0 ? "text-bad-bright" : "text-ink-soft")}>
                    {r.gesamtR > 0 ? "+" : ""}{r.gesamtR.toFixed(2)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
