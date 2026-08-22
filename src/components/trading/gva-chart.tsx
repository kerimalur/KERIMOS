"use client";

import type { ChartBild } from "@/lib/trading/hit-detail";

/**
 * Der Chart zum Entstehungszeitpunkt einer GVA-Linie.
 *
 * Selbst gezeichnet und nicht als Bild geladen: einen Screenshot vom
 * Bildungstag gibt es nirgends, und TradingView kann keinen liefern, ohne dass
 * jemand in einer Sitzung eingeloggt ist. Aus Kerzen gezeichnet ist der Chart
 * dafür für jede Linie verfügbar — auch für die von vor einem Jahr.
 *
 * Reines SVG, keine Chart-Bibliothek. Es sind zwanzig Kerzen und eine
 * waagerechte Linie; alles, was eine Bibliothek zusätzlich mitbrächte
 * (Zoom, Tooltips, Achsen-Autoformat), wäre hier Ballast.
 */

/**
 * Farben als Literale und nicht als CSS-Variablen: die Palette steht in
 * tailwind.config.ts, nicht in :root — `var(--good)` wäre in SVG schlicht
 * leer und die Kerzen unsichtbar.
 */
const FARBE = { good: "#5FC2A6", bad: "#E28B72", accent: "#E7A96B" } as const;

const B = 520;   // viewBox-Breite
const H = 260;   // viewBox-Höhe
const RAND = { oben: 10, unten: 20, links: 6, rechts: 54 };

export function GvaChart({ bild }: { bild: ChartBild }) {
  const { kerzen, level, seite, bildendeKerze, zeitrahmen } = bild;
  if (kerzen.length === 0) return null;

  const hoch = Math.max(...kerzen.map((k) => k.high), level);
  const tief = Math.min(...kerzen.map((k) => k.low), level);
  // Ein Zehntel Luft nach oben und unten, damit die Linie nicht am Rand klebt.
  const luft = (hoch - tief) * 0.1 || Math.abs(level) * 0.001 || 1;
  const max = hoch + luft;
  const min = tief - luft;

  const flaecheB = B - RAND.links - RAND.rechts;
  const flaecheH = H - RAND.oben - RAND.unten;
  const schritt = flaecheB / kerzen.length;
  const koerper = Math.max(2, schritt * 0.62);

  const y = (preis: number) =>
    RAND.oben + ((max - preis) / (max - min)) * flaecheH;
  const x = (i: number) => RAND.links + i * schritt + schritt / 2;

  const yLevel = y(level);
  const nachkomma = Math.abs(level) < 20 ? 5 : 3;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full min-w-[320px]"
        role="img"
        aria-label={`${kerzen.length} ${zeitrahmen}-Kerzen um die Entstehung der GVA-Linie`}>
        {/* Die Linie selbst — ab der bildenden Kerze nach rechts, wie im Chart. */}
        <line
          x1={x(Math.max(0, bildendeKerze)) - koerper / 2}
          x2={B - RAND.rechts}
          y1={yLevel} y2={yLevel}
          stroke={seite === "long" ? FARBE.good : FARBE.bad}
          strokeWidth={1.5} strokeDasharray="5 3" />
        <text x={B - RAND.rechts + 6} y={yLevel + 3.5}
          className="tabular fill-ink-muted text-[10px]">
          {level.toFixed(nachkomma)}
        </text>

        {kerzen.map((k, i) => {
          const bull = k.close >= k.open;
          const farbe = bull ? FARBE.good : FARBE.bad;
          const oben = y(Math.max(k.open, k.close));
          const unten = y(Math.min(k.open, k.close));
          const bildend = i === bildendeKerze;
          const vorlaeufer = i === bildendeKerze - 1;

          return (
            <g key={k.zeit} opacity={bildend || vorlaeufer ? 1 : 0.55}>
              {bildend && (
                // Die bildende Kerze bekommt einen Kasten statt einer Farbe:
                // sie soll auffallen, ohne dass man sie für eine andere
                // Kerzenart hält.
                <rect
                  x={x(i) - koerper / 2 - 3} y={y(k.high) - 3}
                  width={koerper + 6} height={y(k.low) - y(k.high) + 6}
                  rx={3} fill="none" stroke={FARBE.accent} strokeWidth={1.2} />
              )}
              <line x1={x(i)} x2={x(i)} y1={y(k.high)} y2={y(k.low)}
                stroke={farbe} strokeWidth={1} />
              <rect
                x={x(i) - koerper / 2} y={oben}
                width={koerper} height={Math.max(1, unten - oben)}
                fill={farbe} rx={1} />
            </g>
          );
        })}

        {/* Datum nur an der bildenden Kerze — mehr Achse braucht es nicht. */}
        {bildendeKerze >= 0 && (
          <text x={x(bildendeKerze)} y={H - 6} textAnchor="middle"
            className="tabular fill-accent text-[10px]">
            {kerzen[bildendeKerze]?.zeit.slice(8, 10)}.{kerzen[bildendeKerze]?.zeit.slice(5, 7)}.
          </text>
        )}
      </svg>
    </div>
  );
}
