import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Launcher } from "@/components/launcher";
import { FocusPrompt } from "@/components/focus-prompt";
import { FocusStarter } from "@/components/focus-starter";
import { TradingCard } from "@/components/trading-card";
import { Card, Stat, Empty } from "@/components/ui";
import { chf, dateLabel } from "@/lib/format";
import { fmtHours, pct, summarizeWeek, weekStart as toWeekStart, addDays } from "@/lib/time";
import { createGymClient, gymConfigured, type BodyWeightEntry } from "@/lib/supabase/gym";
import type {
  Activity, DailyTime, FocusSession, NavLink, RunwayInputs, WeeklyBucket,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** Kleine Live-Karte für den Geld-Modus. */
async function GeldKarte() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("runway_inputs", { months_lookback: 3 });
  const i = (data as RunwayInputs[] | null)?.[0];
  if (!i) return null;
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Liquide" value={chf(Number(i.liquid ?? 0))} />
        <Stat label="Ø Einnahmen" value={chf(Number(i.avg_income ?? 0))} sub="letzte 3 Monate" />
        <Stat label="Ø Ausgaben" value={chf(Number(i.avg_expenses ?? 0))} sub="letzte 3 Monate" />
      </div>
    </Card>
  );
}

/** Kleine Live-Karte für den Zeit-Modus: die laufende Woche. */
async function ZeitKarte() {
  const supabase = await createClient();
  const week = toWeekStart(new Date());
  const [{ data: daily }, { data: buckets }] = await Promise.all([
    supabase.from("v_daily_time").select("*")
      .gte("entry_date", week).lte("entry_date", addDays(week, 6)),
    supabase.from("v_weekly_buckets").select("*").eq("week_start", week),
  ]);
  const days = ((daily ?? []) as DailyTime[]).map((d) => ({
    ...d,
    logged_minutes: Number(d.logged_minutes), ziel_minutes: Number(d.ziel_minutes),
    arbeit_minutes: Number(d.arbeit_minutes), pflicht_minutes: Number(d.pflicht_minutes),
    regeneration_minutes: Number(d.regeneration_minutes),
    sozial_minutes: Number(d.sozial_minutes), spass_minutes: Number(d.spass_minutes),
    leerlauf_minutes: Number(d.leerlauf_minutes),
    sleep_hours: d.sleep_hours === null ? null : Number(d.sleep_hours),
    waking_minutes: Number(d.waking_minutes),
    unaccounted_minutes: Number(d.unaccounted_minutes),
  }));
  if (days.length === 0) return null;
  const s = summarizeWeek(days, (buckets ?? []) as WeeklyBucket[]);
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Woche an Zielen" value={pct(s.goalShare)}
          tone={s.goalShare >= 0.15 ? "good" : "warn"} />
        <Stat label="Erfasst" value={fmtHours(s.totalLogged)} />
        <Stat label="Unerfasst" value={fmtHours(s.totalUnaccounted)}
          tone={s.totalUnaccounted > s.totalLogged ? "bad" : "neutral"} />
      </div>
    </Card>
  );
}

/** Kleine Live-Karte für den Gym-Modus: letzte Einheit + Gewicht. */
async function GymKarte() {
  if (!gymConfigured()) return null;
  const gym = createGymClient();
  const [{ data: prog }, { data: weight }] = await Promise.all([
    gym!.from("v_exercise_progress").select("day, split")
      .order("day", { ascending: false }).limit(1),
    gym!.from("body_weight_entries").select("entry_date, weight_kg")
      .order("entry_date", { ascending: false }).limit(1),
  ]);
  const letzte = prog?.[0] as { day: string; split: string | null } | undefined;
  const kg = weight?.[0] as BodyWeightEntry | undefined;
  if (!letzte && !kg) return null;
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Letzte Einheit"
          value={letzte ? dateLabel(letzte.day) : "—"}
          sub={letzte?.split ?? undefined} />
        <Stat label="Gewicht"
          value={kg ? `${Number(kg.weight_kg).toFixed(1)} kg` : "—"}
          sub={kg ? `am ${dateLabel(kg.entry_date)}` : undefined} />
      </div>
    </Card>
  );
}

export default async function ModusPage({
  params,
}: {
  params: Promise<{ gruppe: string }>;
}) {
  const { gruppe: raw } = await params;
  const gruppe = decodeURIComponent(raw);

  const supabase = await createClient();
  const [{ data: linkRows }, { data: focusRows }, { data: actRows }] = await Promise.all([
    supabase.from("links").select("*").eq("archived", false)
      .eq("group_name", gruppe).order("sort_order"),
    supabase.from("focus_sessions").select("*").eq("status", "open")
      .order("started_at", { ascending: false }),
    supabase.from("activities").select("*").eq("archived", false).order("name"),
  ]);

  const links = (linkRows ?? []) as NavLink[];
  const activities = (actRows ?? []) as Activity[];
  const n = gruppe.toLowerCase();

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
            ← Startseite
          </Link>
          <h1 className="mt-1 text-2xl font-medium leading-tight text-ink">{gruppe}</h1>
        </div>
        <Link href="/links" className="text-xs text-ink-muted transition hover:text-ink-soft">
          Kacheln verwalten
        </Link>
      </div>

      <div className="space-y-5">
        {/* Live-Karte des Modus */}
        {n.includes("trad") && <TradingCard />}
        {n.includes("geld") && <GeldKarte />}
        {n.includes("zeit") && <ZeitKarte />}
        {n.includes("gym") && <GymKarte />}

        <FocusPrompt
          sessions={(focusRows ?? []) as FocusSession[]}
          activities={activities}
        />

        {links.length === 0 ? (
          <Empty>
            Diesem Modus sind noch keine Kacheln zugeordnet. Unter{" "}
            <Link href="/links" className="text-accent-soft hover:underline">
              Kacheln verwalten
            </Link>{" "}
            einer Kachel die Gruppe „{gruppe}“ geben.
          </Empty>
        ) : (
          <>
            <FocusStarter activities={activities} links={links} />
            <Launcher links={links} />
          </>
        )}
      </div>
    </div>
  );
}
