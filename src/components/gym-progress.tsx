"use client";
import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, cx } from "@/components/ui";
import type { ExerciseSeries } from "@/lib/supabase/gym";

/** Feste Farbe je Split, damit Push und Pull auf einen Blick unterscheidbar bleiben. */
export const SPLIT_COLOR: Record<string, string> = {
  Push: "#C68D6B",
  Pull: "#5B8C7B",
};
export const FALLBACK_COLOR = "#8FA6B8";

function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "short" });
}

export function GymProgress({ data }: { data: Record<string, ExerciseSeries[]> }) {
  const splits = Object.keys(data).sort();
  const [active, setActive] = useState(splits[0] ?? "");

  if (splits.length === 0) return null;

  const series = data[active] ?? [];
  const color = SPLIT_COLOR[active] ?? FALLBACK_COLOR;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-sand p-1">
        {splits.map((s) => (
          <button key={s} onClick={() => setActive(s)}
            className={cx("rounded-lg px-4 py-1.5 text-sm font-medium transition",
              s === active ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}
            style={s === active ? { color: SPLIT_COLOR[s] ?? undefined } : undefined}>
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((ex) => (
          <Card key={ex.exercise} className="p-4">
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink">{ex.exercise}</span>
              {ex.change !== null && Math.abs(ex.change) >= 0.5 && (
                <span className={cx("shrink-0 text-xs font-medium",
                  ex.change > 0 ? "text-good" : "text-bad")}>
                  {ex.change > 0 ? "+" : ""}{ex.change.toFixed(0)} %
                </span>
              )}
            </div>

            <div className="mb-3 text-xs text-ink-muted">
              {ex.sessions} Einheiten · {ex.first} kg → {ex.last} kg
            </div>

            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ex.points} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="#E8E3D8" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={dayLabel} stroke="#8A8478"
                    fontSize={10} tickLine={false} axisLine={false} minTickGap={18} />
                  <YAxis stroke="#8A8478" fontSize={10} tickLine={false} axisLine={false}
                    width={38} />
                  <Tooltip
                    labelFormatter={(v) => dayLabel(String(v))}
                    formatter={(value: number, _name, item) => {
                      const reps = (item?.payload as { reps?: number } | undefined)?.reps;
                      return [`${value} kg${reps ? ` · ${reps} Wdh.` : ""}`, "Top-Satz"];
                    }}
                    contentStyle={{
                      background: "#FFFDF9", border: "1px solid #E8E3D8",
                      borderRadius: 8, fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="weight" stroke={color} strokeWidth={2}
                    dot={{ r: 2.5, fill: color }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-xs text-ink-muted">
        Gezeigt wird der schwerste Satz je Einheit. Bei Klimmzügen bedeutet ein negatives
        Gewicht Unterstützung durch Band oder Maschine, null das eigene Körpergewicht und
        ein positiver Wert Zusatzgewicht — der Sprung von assistiert zu Zusatzgewicht ist
        deshalb kein reiner Eins-zu-eins-Vergleich.
      </p>
    </div>
  );
}
