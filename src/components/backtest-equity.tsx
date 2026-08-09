import { Empty } from "@/components/ui";
import type { EquityPunkt } from "@/lib/backtest-types";

/**
 * Kumulierte R-Kurve als SVG-Pfad, der sich beim Erscheinen zeichnet
 * (animate-drawLine, wie die übrigen Linien im Projekt).
 *
 * Server Component - reines Markup, kein State nötig. Bewusst ohne
 * Chart-Bibliothek: eine Linie mit Nulllinie ist wenige Zeilen Pfad-Mathe
 * und spart eine Abhängigkeit im Bundle.
 */
export function BacktestEquity({ punkte }: { punkte: EquityPunkt[] }) {
  if (punkte.length < 2) {
    return <Empty>Ab zwei gewerteten Trades wird hier die R-Kurve gezeichnet.</Empty>;
  }

  const B = 600, H = 160, PAD = 8;
  const werte = punkte.map((p) => p.kumR);
  const min = Math.min(0, ...werte);
  const max = Math.max(0, ...werte);
  const spanne = max - min || 1;

  const x = (i: number) => PAD + (i / (punkte.length - 1)) * (B - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / spanne) * (H - 2 * PAD);

  const pfad = punkte.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.kumR).toFixed(1)}`).join(" ");
  const flaeche = `${pfad} L${x(punkte.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const letzte = punkte[punkte.length - 1].kumR;
  const positiv = letzte >= 0;
  const farbe = positiv ? "#5FC2A6" : "#E28B72";

  return (
    <div>
      <svg viewBox={`0 0 ${B} ${H}`} className="w-full" role="img"
        aria-label={`Kumulierte R-Kurve über ${punkte.length} Trades, Endstand ${letzte} R`}>
        <line x1={PAD} y1={y(0)} x2={B - PAD} y2={y(0)}
          stroke="currentColor" className="text-line-strong" strokeWidth="1" strokeDasharray="3 3" />
        <path d={flaeche} fill={farbe} opacity="0.12" />
        <path d={pfad} fill="none" stroke={farbe} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className="animate-drawLine"
          style={{ strokeDasharray: 4000, strokeDashoffset: 4000 }} />
        <circle cx={x(punkte.length - 1)} cy={y(letzte)} r="3.5" fill={farbe} />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-faint">
        <span>Trade 1</span>
        <span className="tabular">
          Endstand {letzte > 0 ? "+" : ""}{letzte.toFixed(2)} R nach {punkte.length} Trades
        </span>
      </div>
    </div>
  );
}
