import { Badge } from "@/components/ui";
import { bauePineSkript, baueCsv, MAX_LABELS, type ExportTrade } from "@/lib/confluence/pine-export";

/**
 * Der Export als reiner Text zum Markieren und Kopieren.
 *
 * Bewusst kein Knopf mit Zwischenablage-Zugriff: das wäre eine
 * Client-Komponente samt JavaScript für etwas, das Strg+A und Strg+C in
 * einem Textfeld schon können — und in einem `readOnly`-Textfeld kann man
 * nichts kaputtmachen.
 */
export function BacktestExport({ trades, paar }: {
  trades: ExportTrade[];
  paar: string;
}) {
  const pine = bauePineSkript(trades, `GVA Backtest ${paar}`);
  const csv = baueCsv(trades.filter((t) => t.ergebnis !== "skip"));

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">Pine-Skript für TradingView</span>
          <Badge tone="neutral">{pine.anzahl} Trades</Badge>
          {pine.weggelassen > 0 && (
            <Badge tone="warn">{pine.weggelassen} weggelassen</Badge>
          )}
        </div>
        <textarea readOnly rows={10} value={pine.quelltext} spellCheck={false}
          className="num w-full rounded-xl border border-line bg-sand/60 p-3 text-[11px] leading-relaxed text-ink-soft" />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Alles markieren, kopieren, in TradingView unter <strong>Pine-Editor → Neu →
          Indikator</strong> einfügen, speichern, zum Chart hinzufügen. <strong>Longs
          stehen unter der Kerze, Shorts darüber</strong>; die Farbe kommt aus dem
          erreichten R, nicht aus dem Ergebnis-Etikett — ein Teil-TP mit negativem R soll
          nicht grün aussehen. Im Indikator lässt sich nach Richtung und nach
          Gewinn/Verlust filtern.
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          Zwei Dinge zum Wissen: das Skript filtert <strong>nicht</strong> nach Symbol —
          leg es auf das Paar, das du ausgewertet hast, sonst sitzen die Marken zeitlich
          richtig, meinen aber ein anderes Instrument. Und Pine zeichnet höchstens{" "}
          {MAX_LABELS} Labels; darüber hinaus fallen die ältesten weg und stehen oben als
          Zahl.
        </p>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-ink">Als CSV</div>
        <textarea readOnly rows={6} value={csv} spellCheck={false}
          className="num w-full rounded-xl border border-line bg-sand/60 p-3 text-[11px] leading-relaxed text-ink-soft" />
        <p className="mt-2 text-[11px] text-ink-faint">
          Semikolon getrennt, damit Excel es ohne Import-Assistent öffnet.
        </p>
      </div>
    </div>
  );
}
