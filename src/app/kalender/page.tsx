import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CalendarNav, type CalView } from "@/components/calendar-nav";
import { DayCalendar, WeekCalendar, MonthCalendar } from "@/components/calendar-views";
import { Button, Card, CardTitle, Empty, Stat } from "@/components/ui";
import { seedActivities } from "@/lib/actions";
import {
  addDays, toISODate, weekStart as toWeekStart, fmtHours, pct, summarizeWeek, heuteISO,
} from "@/lib/time";
import type { Activity, DailyTime, TimeEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toNum(d: DailyTime): DailyTime {
  return {
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
  };
}

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; d?: string }>;
}) {
  const sp = await searchParams;
  const view: CalView =
    sp.ansicht === "woche" || sp.ansicht === "monat" ? sp.ansicht : "tag";
  const date = ISO.test(sp.d ?? "") ? sp.d! : heuteISO();

  // Zeitraum je Ansicht
  let from = date;
  let to = date;
  let anchor = date;

  if (view === "woche") {
    anchor = toWeekStart(date);
    from = anchor;
    to = addDays(anchor, 6);
  } else if (view === "monat") {
    const d = new Date(date + "T12:00:00");
    const firstOfMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    anchor = firstOfMonth;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    from = toWeekStart(firstOfMonth);
    to = addDays(toWeekStart(toISODate(lastDay)), 6);
  }

  const supabase = await createClient();
  const [{ data: acts }, { data: entries }, { data: daily }, { data: checkin }] = await Promise.all([
    supabase.from("activities").select("*").eq("archived", false),
    view === "monat"
      ? Promise.resolve({ data: [] })
      : supabase.from("time_entries").select("*")
          .gte("entry_date", from).lte("entry_date", to).order("start_minute"),
    supabase.from("v_daily_time").select("*").gte("entry_date", from).lte("entry_date", to),
    view === "tag"
      ? supabase.from("day_checkins").select("energy, note").eq("entry_date", date).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const activities = (acts ?? []) as Activity[];
  const byId = new Map(activities.map((a) => [a.id, a]));
  const enriched = ((entries ?? []) as TimeEntry[]).map((e) => ({
    ...e,
    minutes: Number(e.minutes),
    start_minute: e.start_minute === null ? null : Number(e.start_minute),
    activity: byId.get(e.activity_id),
  }));

  const dailyRows = ((daily ?? []) as DailyTime[]).map(toNum);
  const dailyByDate: Record<string, DailyTime> = {};
  for (const d of dailyRows) dailyByDate[d.entry_date] = d;

  const entriesByDate: Record<string, typeof enriched> = {};
  for (const e of enriched) {
    (entriesByDate[e.entry_date] ??= []).push(e);
  }

  const monthDays: string[] = [];
  if (view === "monat") {
    let cursor = from;
    while (cursor <= to) { monthDays.push(cursor); cursor = addDays(cursor, 1); }
  }

  const timed = enriched.filter((e) => e.start_minute !== null).length;
  const summary = summarizeWeek(dailyRows);

  if (activities.length === 0) {
    return (
      <div className="py-10">
        <Card className="mx-auto max-w-lg">
          <h2 className="font-display text-lg font-bold text-ink">Zeit-Modul einrichten</h2>
          <p className="mt-2 text-sm text-ink-muted">
            KerimOS legt dir ein Set an Aktivitäten an, sortiert nach Lebensbereich —
            Ziele, Arbeit, Pflicht, Regeneration, Soziales, Spass und Leerlauf.
            Umbenennen und ergänzen kannst du danach alles unter{" "}
            <Link href="/aktivitaeten" className="text-accent-soft hover:underline">
              Aktivitäten
            </Link>.
          </p>
          <form action={seedActivities} className="mt-5">
            <Button type="submit" className="w-full">Aktivitäten anlegen</Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Kalender</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Dieselben Daten wie im Check-in, nur räumlich. Wo das Raster leer bleibt, ist
          Zeit vergangen, die du nicht zugeordnet hast.
        </p>
      </div>

      <CalendarNav view={view} date={date} anchor={anchor} />

      {view !== "tag" && dailyRows.length > 0 && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Erfasst" value={fmtHours(summary.totalLogged)} />
            <Stat label="Unerfasst"
              tone={summary.totalUnaccounted > summary.totalLogged ? "bad" : "neutral"}
              value={fmtHours(summary.totalUnaccounted)} />
            <Stat label="An Zielen"
              tone={summary.goalShare >= 0.15 ? "good" : "warn"}
              value={pct(summary.goalShare)} />
          </div>
        </Card>
      )}

      {view === "tag" && (
        <DayCalendar date={date} entries={entriesByDate[date] ?? []} activities={activities}
          checkin={checkin as { energy: number | null; note: string | null } | null} />
      )}
      {view === "woche" && <WeekCalendar weekStart={anchor} entriesByDate={entriesByDate} />}
      {view === "monat" && (
        <MonthCalendar monthStart={anchor} days={monthDays} dailyByDate={dailyByDate} />
      )}

      {view === "woche" && timed === 0 && enriched.length > 0 && (
        <Card>
          <CardTitle>Noch keine Uhrzeiten</CardTitle>
          <p className="text-sm text-ink-muted">
            Deine Einträge haben bisher nur eine Dauer, keine Startzeit — deshalb bleibt das
            Wochenraster leer. Erfasse im Tag über die Aktivitäts-Knöpfe, dann füllt sich
            beides von selbst.
          </p>
        </Card>
      )}
    </div>
  );
}
