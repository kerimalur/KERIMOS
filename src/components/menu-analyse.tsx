"use client";
import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardTitle, Empty, cx } from "@/components/ui";
import { addDays } from "@/lib/time";

interface DayPoint {
  date: string; kcal: number; protein: number; cost: number;
  isPrep: boolean; isFree: boolean;
}
interface WeekBucket {
  start: string; label: string; tage: number; kcal: number; protein: number; cost: number;
}
interface Ranking { id: string; name: string; value: number }
interface Named { name: string; count: number }

const DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Auswertung des Essen-Bereichs: Tagesschnitt gegen die Ziele, Verlauf pro
 * Woche, Zielerreichung nach Wochentag, Meal-Prep gegen freie Tage sowie
 * ein paar Rankings. Die Rohdaten kommen fertig aggregiert vom Server -
 * hier wird nur nach Zeitraum gefiltert und dargestellt.
 */
export function MenuAnalyse({
  days, weeks, goals, topRecipes, topFoods, proteinValue, kcalValue,
}: {
  days: DayPoint[];
  weeks: WeekBucket[];
  goals: { kcal: number; protein: number; kosten: number };
  topRecipes: Named[];
  topFoods: Named[];
  proteinValue: Ranking[];
  kcalValue: Ranking[];
}) {
  const [span, setSpan] = useState<8 | 12>(8);

  const cutoff = useMemo(() => addDays(new Date().toISOString().slice(0, 10), -span * 7), [span]);
  const sichtbareTage = useMemo(
    () => days.filter((d) => d.date >= cutoff && d.kcal > 0),
    [days, cutoff]
  );
  const sichtbareWochen = weeks.slice(-span);

  const avgKcal = avg(sichtbareTage.map((d) => d.kcal));
  const avgProtein = avg(sichtbareTage.map((d) => d.protein));
  const avgCost = avg(sichtbareTage.map((d) => d.cost));

  const prepTage = sichtbareTage.filter((d) => d.isPrep);
  const freieTage = sichtbareTage.filter((d) => !d.isPrep);

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle className="mb-0">Zeitraum</CardTitle>
          <div className="flex gap-1 rounded-lg bg-sand p-1">
            {([8, 12] as const).map((s) => (
              <button key={s} onClick={() => setSpan(s)}
                className={cx("rounded-md px-3 py-1 text-xs font-medium transition",
                  span === s ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
                {s} Wochen
              </button>
            ))}
          </div>
        </div>

        {sichtbareTage.length === 0 ? (
          <Empty>Noch keine geplanten Tage im Zeitraum.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            <Metric label="Kalorien" value={Math.round(avgKcal)} goal={goals.kcal}
              unit="kcal" limit />
            <Metric label="Protein" value={Math.round(avgProtein)} goal={goals.protein}
              unit="g" />
            <Metric label="Kosten" value={round2(avgCost)} goal={goals.kosten}
              unit="CHF" limit />
            <p className="mt-1 text-xs text-ink-muted">
              Ø über {sichtbareTage.length} geplante Tage.
            </p>
          </div>
        )}
      </Card>

      {sichtbareWochen.length > 0 && (
        <>
          <Card>
            <CardTitle>Kalorien pro Woche</CardTitle>
            <Verlauf daten={sichtbareWochen} feld="kcal" goal={goals.kcal} />
          </Card>

          <Card>
            <CardTitle>Kosten pro Woche</CardTitle>
            <Verlauf daten={sichtbareWochen} feld="cost" format={(v) => `CHF ${v.toFixed(0)}`} />
          </Card>
        </>
      )}

      {sichtbareTage.length > 0 && (
        <Card>
          <CardTitle>Zielerreichung nach Wochentag</CardTitle>
          <p className="mb-3 text-xs text-ink-muted">
            Anteil der Tage, an denen das Proteinziel erreicht wurde.
          </p>
          <Heatmap tage={sichtbareTage} zielProtein={goals.protein} />
        </Card>
      )}

      {(prepTage.length > 0 || freieTage.length > 0) && (
        <Card>
          <CardTitle>Meal Prep gegen freie Tage</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <Vergleich titel="Mit Prep" tage={prepTage} goals={goals} />
            <Vergleich titel="Ohne Prep" tage={freieTage} goals={goals} />
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Protein pro Franken</CardTitle>
        <RankingListe rows={proteinValue} einheit="g / CHF" />
      </Card>

      <Card>
        <CardTitle>Kalorien pro Franken</CardTitle>
        <RankingListe rows={kcalValue} einheit="kcal / CHF" />
      </Card>

      {topRecipes.length > 0 && (
        <Card>
          <CardTitle>Meistgekochte Rezepte · 90 Tage</CardTitle>
          <RankingListe rows={topRecipes.map((r) => ({ id: r.name, name: r.name, value: r.count }))}
            einheit="×" />
        </Card>
      )}

      {topFoods.length > 0 && (
        <Card>
          <CardTitle>Meistverwendete Lebensmittel · 90 Tage</CardTitle>
          <RankingListe rows={topFoods.map((f) => ({ id: f.name, name: f.name, value: f.count }))}
            einheit="×" />
        </Card>
      )}
    </>
  );
}

function Metric({
  label, value, goal, unit, limit,
}: { label: string; value: number; goal: number; unit: string; limit?: boolean }) {
  const pct = goal > 0 ? Math.round((value / goal) * 100) : 0;
  const gut = limit ? value <= goal : value >= goal;
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="tabular text-lg font-medium text-ink">{value}</span>
        <span className="text-xs text-ink-muted">{unit}</span>
        <span className={cx("text-xs font-semibold", gut ? "text-good" : "text-bad")}>{pct}%</span>
      </span>
    </div>
  );
}

function Verlauf({
  daten, feld, goal, format,
}: {
  daten: WeekBucket[]; feld: "kcal" | "cost"; goal?: number; format?: (v: number) => string;
}) {
  const rows = daten.map((w) => ({ woche: w.label, wert: w[feld] }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke="#2E2519" vertical={false} />
        <XAxis dataKey="woche" stroke="#9A8C74" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#9A8C74" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip
          formatter={(v: number) => (format ? format(v) : Math.round(v))}
          contentStyle={{
            background: "#1E1811", border: "1px solid #2E2519", borderRadius: 8, fontSize: 12,
          }}
        />
        <Line type="monotone" dataKey="wert" stroke="#5FC2A6" strokeWidth={2}
          dot={{ r: 3, fill: "#5FC2A6" }} />
        {goal !== undefined && (
          <ReferenceLine y={goal} stroke="#E28B72" strokeDasharray="4 4" strokeWidth={1} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function Heatmap({ tage, zielProtein }: { tage: DayPoint[]; zielProtein: number }) {
  const buckets = Array.from({ length: 7 }, () => ({ hit: 0, total: 0 }));
  for (const t of tage) {
    const idx = (new Date(t.date + "T12:00:00").getDay() + 6) % 7;
    buckets[idx].total++;
    if (t.protein >= zielProtein) buckets[idx].hit++;
  }
  return (
    <div className="grid grid-cols-7 gap-1">
      {buckets.map((b, i) => {
        const pct = b.total > 0 ? b.hit / b.total : 0;
        const farbe = b.total === 0 ? "bg-sand"
          : pct >= 0.75 ? "bg-good" : pct >= 0.4 ? "bg-warn" : "bg-bad";
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-ink-muted">{DAY_SHORT[i]}</span>
            <div className={cx("aspect-square w-full rounded-md", farbe)} />
            <span className="text-[9px] text-ink-faint">
              {b.total > 0 ? `${Math.round(pct * 100)}%` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Vergleich({
  titel, tage, goals,
}: { titel: string; tage: DayPoint[]; goals: { protein: number } }) {
  if (tage.length === 0) {
    return (
      <div className="rounded-xl bg-sand/60 p-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">{titel}</p>
        <p className="mt-2 text-xs text-ink-faint">Keine Tage</p>
      </div>
    );
  }
  const hit = tage.filter((d) => d.protein >= goals.protein).length;
  const cost = avg(tage.map((d) => d.cost));
  return (
    <div className="rounded-xl bg-sand/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">{titel}</p>
      <p className="tabular mt-2 text-xl font-medium text-ink">
        {Math.round((hit / tage.length) * 100)}%
      </p>
      <p className="text-[11px] text-ink-muted">Proteinziel erreicht</p>
      <p className="mt-2 text-xs font-semibold text-ink-soft">CHF {round2(cost)} / Tag</p>
      <p className="text-[11px] text-ink-faint">{tage.length} Tage</p>
    </div>
  );
}

function RankingListe({ rows, einheit }: { rows: Ranking[]; einheit: string }) {
  if (rows.length === 0) return <Empty>Keine Daten.</Empty>;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="mb-1 flex items-center justify-between">
            <span className="truncate text-sm text-ink-soft">{r.name}</span>
            <span className="ml-2 shrink-0 text-xs font-semibold text-ink-muted">
              {r.value} {einheit}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent"
              style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
function round2(n: number): number { return Math.round(n * 100) / 100; }
