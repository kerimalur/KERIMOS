import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Launcher } from "@/components/launcher";
import { FocusPrompt } from "@/components/focus-prompt";
import { Button, Card } from "@/components/ui";
import { seedLinks } from "@/lib/actions";
import { chf } from "@/lib/format";
import { fmtHours, pct, summarizeWeek, weekStart as toWeekStart, addDays } from "@/lib/time";
import type {
  Activity, DailyTime, FocusSession, NavLink, RunwayInputs, WeeklyBucket,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Start() {
  const supabase = await createClient();
  const week = toWeekStart(new Date());

  const [
    { data: linkRows }, { data: inputsRows }, { data: weekDaily }, { data: weekBuckets },
    { data: focusRows }, { data: actRows },
  ] = await Promise.all([
      supabase.from("links").select("*").eq("archived", false)
        .order("group_name").order("sort_order"),
      supabase.rpc("runway_inputs", { months_lookback: 3 }),
      supabase.from("v_daily_time").select("*")
        .gte("entry_date", week).lte("entry_date", addDays(week, 6)),
      supabase.from("v_weekly_buckets").select("*").eq("week_start", week),
      supabase.from("focus_sessions").select("*").eq("status", "open")
        .order("started_at", { ascending: false }),
      supabase.from("activities").select("*").eq("archived", false).order("name"),
    ]);

  const links = (linkRows ?? []) as NavLink[];

  if (links.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card>
          <h1 className="text-lg font-medium text-ink">Navigator einrichten</h1>
          <p className="mt-2 text-sm text-ink-muted">
            KerimOS legt dir Kacheln für deine Bereiche, deine deployten Apps, deine
            Werkzeuge und deine Projektordner an. Alles danach änderbar — Kacheln
            verwaltest du in der App, nicht im Code.
          </p>
          <form action={seedLinks} className="mt-5">
            <Button type="submit" className="w-full">Kacheln anlegen</Button>
          </form>
        </Card>
      </div>
    );
  }

  const inputs = (inputsRows as RunwayInputs[] | null)?.[0];
  const liquid = Number(inputs?.liquid ?? 0);

  const days = ((weekDaily ?? []) as DailyTime[]).map((d) => ({
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
  const summary = summarizeWeek(days, (weekBuckets ?? []) as WeeklyBucket[]);

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-lg font-medium text-white">
            K
          </span>
          <div>
            <h1 className="text-2xl font-medium leading-tight text-ink">KerimOS</h1>
            <p className="text-sm text-ink-muted">Wo willst du arbeiten?</p>
          </div>
        </div>

        <dl className="flex gap-8 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Liquide</dt>
            <dd className="tabular mt-1 text-ink">{chf(liquid)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">
              Woche an Zielen
            </dt>
            <dd className="tabular mt-1 text-ink">
              {days.length > 0 ? pct(summary.goalShare) : "—"}
            </dd>
          </div>
          <div className="hidden sm:block">
            <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Unerfasst</dt>
            <dd className="tabular mt-1 text-ink">
              {days.length > 0 ? fmtHours(summary.totalUnaccounted) : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-5">
        <FocusPrompt
          sessions={(focusRows ?? []) as FocusSession[]}
          activities={(actRows ?? []) as Activity[]}
        />
        <Launcher links={links} />
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-line pt-4">
        <div className="flex items-center gap-4">
          <Link href="/links" className="text-xs text-ink-muted transition hover:text-ink-soft">
            Kacheln verwalten
          </Link>
          <Link href="/fokus" className="text-xs text-ink-muted transition hover:text-ink-soft">
            Fokus
          </Link>
          <Link href="/zuruecksetzen" className="text-xs text-ink-muted transition hover:text-ink-soft">
            Zurücksetzen
          </Link>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-xs text-ink-muted transition hover:text-ink-soft">
            Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}
