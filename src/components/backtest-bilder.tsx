import { Empty, cx } from "@/components/ui";
import type { HistogrammBalken, DrawdownPunkt } from "@/lib/backtest-types";

/**
 * Zusatzbilder zur R-Kurve.
 *
 * Bewusst ohne Chart-Bibliothek und als Server-Komponenten: ein Balken ist ein
 * div mit Breite, eine Fläche ein SVG-Pfad. Das spart ein Bundle, das grösser
 * wäre als die ganze Seite.
 */

/** Verteilung der R-Ergebnisse — zeigt, WIE die Summe zustande kam. */
export function RVerteilung({ balken }: { balken: HistogrammBalken[] }) {
  const gesamt = balken.reduce((s, b) => s + b.n, 0);
  if (gesamt === 0) return <Empty>Noch keine gewerteten Trades.</Empty>;
  const groesster = Math.max(...balken.map((b) => b.n), 1);

  return (
    <ul className="space-y-1">
      {balken.map((b) => (
        <li key={b.label} className="flex items-center gap-2.5">
          <span className="num w-24 shrink-0 text-right text-[11px] text-ink-muted">
            {b.label}
          </span>
          <span className="relative h-4 flex-1 overflow-hidden rounded bg-sand/50">
            <span
              className={cx("absolute inset-y-0 left-0 rounded",
                b.von < 0 ? "bg-bad-bright/70"
                  : b.label.startsWith("0 ") ? "bg-ink-faint/60" : "bg-good-bright/70")}
              style={{ width: `${(b.n / groesster) * 100}%` }} />
          </span>
          <span className="num w-14 shrink-0 text-right text-[11px] text-ink-soft">
            {b.n}
            {b.n > 0 && (
              <span className="ml-1 text-ink-faint">
                {((b.n / gesamt) * 100).toFixed(0)}%
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Abstand zum bisherigen Höchststand, in R. Immer ≤ 0. */
export function DrawdownFlaeche({ punkte }: { punkte: DrawdownPunkt[] }) {
  if (punkte.length < 2) {
    return <Empty>Ab zwei gewerteten Trades wird hier der Rückschlag gezeichnet.</Empty>;
  }

  const B = 600, H = 120, PAD = 8;
  const tiefste = Math.min(-0.5, ...punkte.map((p) => p.unterWasser));
  const x = (i: number) => PAD + (i / (punkte.length - 1)) * (B - 2 * PAD);
  const y = (v: number) => PAD + (v / tiefste) * (H - 2 * PAD);

  const pfad = punkte
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.unterWasser).toFixed(1)}`)
    .join(" ");
  const flaeche = `${pfad} L${x(punkte.length - 1).toFixed(1)},${y(0).toFixed(1)} `
    + `L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="h-28 w-full" preserveAspectRatio="none"
      role="img" aria-label="Rückschlag gegenüber dem bisherigen Höchststand in R">
      <path d={flaeche} fill="#E28B72" opacity="0.18" />
      <path d={pfad} fill="none" stroke="#E28B72" strokeWidth="1.5"
        strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <line x1={PAD} x2={B - PAD} y1={y(0)} y2={y(0)} stroke="#2E2519" strokeWidth="1"
        vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
