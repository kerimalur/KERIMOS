import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QuickTrack } from "@/components/quick-track";
import { TodayEntries, type HeuteEintrag } from "@/components/today-entries";
import { FocusPrompt } from "@/components/focus-prompt";
import { TradingCard } from "@/components/trading-card";
import { TodayCard } from "@/components/today-card";
import { AppointmentsCard } from "@/components/appointments-card";
import { MorningCard } from "@/components/morning-card";
import { PrepCard } from "@/components/prep-card";
import { NewsCard } from "@/components/news-card";
import { Logo } from "@/components/logo";
import { heuteISO, ZONE } from "@/lib/time";
import type { Activity, FocusSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Handy-Einstieg: nur das, was unterwegs Sinn ergibt — Zeit tippen, Gewicht,
 * GVA-Status, Essen, Gym. Geld, Werkzeuge und Ordner bleiben dem Desktop.
 * Die installierte PWA startet direkt hier (start_url im Manifest); Handy-
 * Browser werden von der Startseite hierher umgeleitet.
 */
export default async function HeutePage() {
  const supabase = await createClient();

  const heute = heuteISO();
  const [{ data: focusRows }, { data: actRows }, { data: entryRows }] = await Promise.all([
    supabase.from("focus_sessions").select("*").eq("status", "open")
      .order("started_at", { ascending: false }),
    supabase.from("activities").select("*").eq("archived", false)
      .order("sort_order").order("name"),
    supabase.from("time_entries")
      .select("id, activity_id, minutes, start_minute")
      .eq("entry_date", heute),
  ]);

  const sessions = (focusRows ?? []) as FocusSession[];
  const activities = (actRows ?? []) as Activity[];

  const datum = new Date().toLocaleDateString("de-CH", {
    weekday: "long", day: "numeric", month: "long", timeZone: ZONE,
  });

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      <div className="flex items-center gap-3">
        <Logo inverted className="h-9 w-9 rounded-xl" />
        <div>
          <h1 className="text-lg font-medium leading-tight text-ink">Heute</h1>
          <p className="text-xs text-ink-muted">{datum}</p>
        </div>
      </div>

      {/* Erst der Überblick, dann das Erfassen - unterwegs schaut man
          häufiger, als man eintippt. */}
      <MorningCard />
      <AppointmentsCard />
      <TodayCard />
      <TradingCard />
      <PrepCard />
      <NewsCard />

      <QuickTrack sessions={sessions} activities={activities} />

      <TodayEntries
        entries={(entryRows ?? []).map((e) => ({
          ...e,
          minutes: Number(e.minutes),
          start_minute: e.start_minute === null ? null : Number(e.start_minute),
        })) as HeuteEintrag[]}
        activities={activities}
      />

      {/* Von Kacheln gestartete Sitzungen ohne Aktivität klärt der Prompt;
          alles andere führt QuickTrack. */}
      <FocusPrompt
        sessions={sessions.filter((s) => !s.activity_id && s.link_id)}
        activities={activities}
      />

      <div className="flex items-center justify-between border-t border-line pt-3">
        <Link href="/?voll=1" className="text-xs text-ink-muted transition hover:text-ink-soft">
          Alle Modi →
        </Link>
        <Link href="/kalender" className="text-xs text-ink-muted transition hover:text-ink-soft">
          Zeit erfassen
        </Link>
      </div>
    </div>
  );
}
