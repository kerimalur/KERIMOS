"use client";

import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { EquityPunkt } from "@/lib/trading/journal";

/**
 * R-Kurve über alle abgeschlossenen Trades.
 *
 * Bewusst in R und nicht in Franken: Im Backtest gibt es keinen Kontostand,
 * und selbst live sagt „+14 R" mehr über die Strategie aus als „+840 CHF" —
 * die zweite Zahl hängt an der Positionsgrösse, die erste an der Entscheidung.
 *
 * Die Nulllinie ist eingezeichnet, weil sie die einzige Schwelle ist, die
 * zählt: darüber trägt sich die Strategie, darunter nicht.
 */

/**
 * Eigener Tooltip-Inhalt statt `formatter`.
 *
 * Rechartes Formatter-Signatur ist über die Versionen hinweg mehrfach
 * gewandert und lässt sich nur mit Zugeständnissen typisieren. Ein eigener
 * Inhalt ist ein Dutzend Zeilen länger, dafür vollständig getypt und
 * unabhängig von der Bibliotheksversion.
 */
function Hinweis({ active, payload }: {
  active?: boolean;
  payload?: { payload?: EquityPunkt }[];
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;

  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-2 text-xs shadow-card">
      <div className="font-display text-sm font-bold text-ink">
        Trade {p.nr} · {p.pair}
      </div>
      <div className="mt-0.5 text-ink-muted">{p.date}</div>
      <div className="mt-1.5 flex gap-3">
        <span className={p.r >= 0 ? "text-good-bright" : "text-bad-bright"}>
          {p.r >= 0 ? "+" : ""}{p.r.toFixed(1)} R
        </span>
        <span className="text-ink-soft">
          Stand {p.kumuliert >= 0 ? "+" : ""}{p.kumuliert.toFixed(2)} R
        </span>
      </div>
    </div>
  );
}

export function EquityChart({ punkte }: { punkte: EquityPunkt[] }) {
  if (punkte.length < 2) {
    return (
      <div className="rounded-xl bg-sand/60 px-4 py-10 text-center text-sm text-ink-muted">
        Ab zwei abgeschlossenen Trades entsteht hier eine Kurve.
      </div>
    );
  }

  const positiv = punkte[punkte.length - 1].kumuliert >= 0;
  const farbe = positiv ? "#5FC2A6" : "#E28B72";

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={punkte} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={farbe} stopOpacity={0.35} />
              <stop offset="100%" stopColor={farbe} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2E2519" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="nr" tick={{ fill: "#7A6E5C", fontSize: 11 }}
            axisLine={{ stroke: "#2E2519" }} tickLine={false} />
          <YAxis tick={{ fill: "#7A6E5C", fontSize: 11 }}
            axisLine={false} tickLine={false} width={46}
            tickFormatter={(v: number) => `${v} R`} />
          <ReferenceLine y={0} stroke="#3E3222" strokeWidth={1.5} />
          <Tooltip content={<Hinweis />} cursor={{ stroke: "#3E3222" }} />
          <Area type="monotone" dataKey="kumuliert" stroke={farbe} strokeWidth={2}
            fill="url(#equityFill)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
