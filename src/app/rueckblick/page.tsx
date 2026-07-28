import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saveWeeklyReview, deleteWeeklyReview } from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, Stat, Empty, cx } from "@/components/ui";
import { chf } from "@/lib/format";
import {
  weekStart as toWeekStart, addDays, fmtHours, pct, summarizeWeek, weekLabel,
} from "@/lib/time";
import { computeRunway } from "@/lib/runway";
import type {
  DailyTime, RunwayInputs, WeeklyBucket, WeeklyReview,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function RueckblickPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const sp = await searchParams;
  const current = toWeekStart(new Date());
  // Standard ist die eben vergangene Woche - sonntags schaut man zurück
  const fallback = addDays(current, -7);
  const week = ISO.test(sp.w ?? "") ? toWeekStart(sp.w!) : fallback;
  const weekEnd = addDays(week, 6);

  const supabase = await createClient();
  const [
    { data: dailyRows }, { data: bucketRows }, { data: inputsRows },
    { data: existing }, { data: history },
  ] = await Promise.all([
    supabase.from("v_daily_time").select("*")
      .gte("entry_date", week).lte("entry_date", weekEnd),
    supabase.from("v_weekly_buckets").select("*").eq("week_start", week),
    supabase.rpc("runway_inputs", { months_lookback: 3 }),
    supabase.from("weekly_reviews").select("*").eq("week_start", week).maybeSingle(),
    supabase.from("weekly_reviews").select("*")
      .order("week_start", { ascending: false }).limit(12),
  ]);

  const days = ((dailyRows ?? []) as DailyTime[]).map((d) => ({
    ...d,
    logged_minutes: Number(d.logged_minutes),
    ziel_minutes: Number(d.ziel_minutes),
    arbeit_minutes: Number(d.arbeit_minutes),
    pflicht_minutes: Number(d.pflicht_minutes),
    regeneration_minutes: Number(d.regeneration_minutes),
    sozial_minutes: Number(d.sozial_minutes),
    spass_minutes: Number(d.spass_minutes),
    leerlauf_minutes: Number(d.leerlauf_minutes),
    sleep_hours: d.sleep_hours === null ? null : Number(d.sleep_hours),
    waking_minutes: Number(d.waking_minutes),
    unaccounted_minutes: Number(d.unaccounted_minutes),
  }));
  const summary = summarizeWeek(days, (bucketRows ?? []) as WeeklyBucket[]);

  const rawInputs = (inputsRows as RunwayInputs[] | null)?.[0];
  const inputs: RunwayInputs = {
    liquid: Number(rawInputs?.liquid ?? 0),
    net_worth: Number(rawInputs?.net_worth ?? 0),
    avg_income: Number(rawInputs?.avg_income ?? 0),
    avg_expenses: Number(rawInputs?.avg_expenses ?? 0),
    recurring_fixed: Number(rawInputs?.recurring_fixed ?? 0),
    months_with_data: Number(rawInputs?.months_with_data ?? 0),
  };
  const runway = computeRunway(inputs, {
    incomeFactor: 0, expenseDeltaMonthly: 0, oneOffCost: 0,
    incomeOverride: null, expenseOverride: null,
  });

  const goalHours = (summary.byBucket.find((b) => b.bucket === "ziel")?.minutes ?? 0) / 60;
  const review = (existing ?? null) as WeeklyReview | null;
  const past = (history ?? []) as WeeklyReview[];

  // Vorbefüllung aus den Kennzahlen - nur beim ersten Schreiben, nie beim
  // Bearbeiten. Startpunkt zum Anpassen, kein fertiger Text.
  let wellVorschlag = "";
  let poorlyVorschlag = "";
  if (!review && days.length > 0) {
    const gut: string[] = [];
    const schlecht: string[] = [];

    if (goalHours >= 1) {
      gut.push(`${fmtHours(goalHours * 60)} an Zielen (${pct(summary.goalShare)} der Wachzeit)`);
    } else {
      schlecht.push("unter 1 h an Zielen gearbeitet");
    }

    const leerlaufMin = summary.byBucket.find((b) => b.bucket === "leerlauf")?.minutes ?? 0;
    if (leerlaufMin >= 120) schlecht.push(`${fmtHours(leerlaufMin)} Leerlauf`);

    if (summary.totalUnaccounted > summary.totalLogged) {
      schlecht.push(`${fmtHours(summary.totalUnaccounted)} unerfasst - mehr als erfasst`);
    } else if (summary.totalWaking > 0 &&
        summary.totalUnaccounted / summary.totalWaking > 0.25) {
      schlecht.push(`${fmtHours(summary.totalUnaccounted)} unerfasst`);
    }

    wellVorschlag = gut.join(" · ");
    poorlyVorschlag = schlecht.join(" · ");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-ink">Wochenrückblick</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Fünf Minuten am Sonntag. Die Zahlen werden eingefroren — sonst lassen sich
            Monate später nicht mehr vergleichen, weil sich die Berechnung inzwischen
            geändert hat.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/rueckblick?w=${addDays(week, -7)}`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
            ←
          </Link>
          <span className="min-w-32 text-center text-sm text-ink">{weekLabel(week)}</span>
          <Link href={`/rueckblick?w=${addDays(week, 7)}`}
            className={cx("rounded-lg border border-line px-3 py-1.5 text-sm transition",
              week >= current ? "pointer-events-none opacity-40 text-ink-faint"
                : "text-ink-soft hover:border-line-strong")}>
            →
          </Link>
        </div>
      </div>

      <Card>
        <CardTitle>Zahlen dieser Woche</CardTitle>
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="An Zielen" value={fmtHours(goalHours * 60)}
            tone={summary.goalShare >= 0.15 ? "good" : "warn"}
            sub={`${pct(summary.goalShare)} der Wachzeit`} />
          <Stat label="Erfasst" value={fmtHours(summary.totalLogged)}
            sub={`von ${fmtHours(summary.totalWaking)}`} />
          <Stat label="Unerfasst" value={fmtHours(summary.totalUnaccounted)}
            tone={summary.totalUnaccounted > summary.totalLogged ? "bad" : "neutral"} />
          <Stat label="Runway ohne Einkommen"
            value={runway.runwayMonths === null ? "unbegrenzt"
              : `${runway.runwayMonths.toFixed(1).replace(".", ",")} Mt.`}
            sub={chf(inputs.liquid)} />
        </div>
        {days.length === 0 && (
          <p className="mt-4 text-sm text-ink-muted">
            Für diese Woche ist keine Zeit erfasst. Du kannst den Rückblick trotzdem
            schreiben — die Zahlen bleiben dann leer.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>{review ? "Rückblick bearbeiten" : "Rückblick schreiben"}</CardTitle>
        <form action={saveWeeklyReview} className="space-y-4">
          <input type="hidden" name="week_start" value={week} />
          <input type="hidden" name="goal_hours" value={goalHours.toFixed(2)} />
          <input type="hidden" name="total_hours" value={(summary.totalLogged / 60).toFixed(2)} />
          <input type="hidden" name="net_worth" value={inputs.net_worth} />
          <input type="hidden" name="runway_months"
            value={runway.runwayMonths === null ? "" : runway.runwayMonths.toFixed(2)} />

          <div>
            <Label htmlFor="went_well">Was lief gut?</Label>
            <textarea id="went_well" name="went_well" rows={2}
              defaultValue={review?.went_well ?? wellVorschlag}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/15"
              placeholder="Konkret — nicht „war ok“" />
          </div>
          <div>
            <Label htmlFor="went_poorly">Was nicht?</Label>
            <textarea id="went_poorly" name="went_poorly" rows={2}
              defaultValue={review?.went_poorly ?? poorlyVorschlag}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/15" />
          </div>
          <div>
            <Label htmlFor="next_week_focus">Worauf kommt es nächste Woche an?</Label>
            <textarea id="next_week_focus" name="next_week_focus" rows={2}
              defaultValue={review?.next_week_focus ?? ""}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/15"
              placeholder="Eine Sache, nicht fünf" />
          </div>
          <Button type="submit">{review ? "Aktualisieren" : "Festhalten"}</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Verlauf</CardTitle>
        {past.length === 0 ? (
          <Empty>Noch kein Rückblick festgehalten.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {past.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/rueckblick?w=${r.week_start}`}
                    className="text-sm font-medium text-ink transition hover:text-accent-soft">
                    {weekLabel(r.week_start)}
                  </Link>
                  <span className="tabular flex gap-3 text-xs text-ink-muted">
                    {r.goal_hours !== null && <span>Ziele {Number(r.goal_hours).toFixed(1)} h</span>}
                    {r.total_hours !== null && <span>erfasst {Number(r.total_hours).toFixed(1)} h</span>}
                    {r.runway_months !== null && (
                      <span>Runway {Number(r.runway_months).toFixed(1)} Mt.</span>
                    )}
                    <form action={deleteWeeklyReview} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-ink-faint transition hover:text-bad">✕</button>
                    </form>
                  </span>
                </div>
                {r.next_week_focus && (
                  <p className="mt-1 text-sm text-ink-soft">→ {r.next_week_focus}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
