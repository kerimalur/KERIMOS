"use client";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardTitle, Empty, cx } from "@/components/ui";
import type { BodyWeightEntry } from "@/lib/supabase/gym";

function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "short" });
}

/** Verlauf des Körpergewichts aus body_weight_entries. */
export function GymWeight({ entries }: { entries: BodyWeightEntry[] }) {
  const points = entries
    .filter((e) => e.weight_kg !== null)
    .map((e) => ({ day: e.entry_date, weight: Number(e.weight_kg) }));

  if (points.length === 0) {
    return (
      <Card>
        <CardTitle>Körpergewicht</CardTitle>
        <Empty>
          Noch kein Gewicht erfasst. Sag Claude z.B. &laquo;ich bin jetzt 92&nbsp;kg&raquo;
          oder trage es im Gym-Tracker ein.
        </Empty>
      </Card>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.weight - first.weight;

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Körpergewicht
        </span>
        {points.length > 1 && Math.abs(delta) >= 0.1 && (
          <span className={cx("text-xs font-medium", delta < 0 ? "text-good" : "text-ink-soft")}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)} kg seit {dayLabel(first.day)}
          </span>
        )}
      </div>

      <div className="mb-3">
        <span className="tabular text-[26px] font-medium leading-tight text-ink">
          {last.weight.toFixed(1)} kg
        </span>
        <span className="ml-2 text-xs text-ink-muted">am {dayLabel(last.day)}</span>
      </div>

      {points.length > 1 ? (
        <div style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="#2E2519" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} stroke="#9A8C74"
                fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis stroke="#9A8C74" fontSize={10} tickLine={false} axisLine={false}
                width={42} domain={["dataMin - 1", "dataMax + 1"]}
                tickFormatter={(v: number) => `${v}`} />
              <Tooltip
                labelFormatter={(v) => dayLabel(String(v))}
                formatter={(value: number) => [`${value.toFixed(1)} kg`, "Gewicht"]}
                contentStyle={{
                  background: "#1E1811", border: "1px solid #2E2519",
                  borderRadius: 8, fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="weight" stroke="#6FA3D8" strokeWidth={2}
                dot={{ r: 2.5, fill: "#6FA3D8" }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          Erst ein Eintrag — ab dem zweiten gibt es eine Kurve.
        </p>
      )}
    </Card>
  );
}
