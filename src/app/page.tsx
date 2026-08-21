import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FocusPrompt } from "@/components/focus-prompt";
import { TasksCard } from "@/components/tasks-card";
import { AppointmentsCard } from "@/components/appointments-card";
import { Tagessatz } from "@/components/tagessatz";
import { Tagesstrahl } from "@/components/tagesstrahl";
import { GewichtHeute } from "@/components/gewicht-heute";
import { GvaLinienKarte } from "@/components/gva-linien-karte";
import { BeobachtungKarte } from "@/components/beobachtung-karte";
import { HeuteWichtig } from "@/components/heute-wichtig";
import { DisplayModeToggle } from "@/components/display-mode-toggle";
import { Logo } from "@/components/logo";
import { QuickSearch } from "@/components/quick-search";
import { Button, Card } from "@/components/ui";
import { WeeklyGoalsCard } from "@/components/weekly-goals";
import { seedLinks } from "@/lib/actions";
import { fetchModusKennzahlen } from "@/lib/modus-kennzahlen";
import { fetchWeeklyGoals } from "@/lib/weekly-goals";
import { MODE_ORDER, MODE_DIRECT } from "@/lib/modes";
import { addDays, weekStart as toWeekStart, heuteISO, heuteWochentag } from "@/lib/time";
import type { Activity, FocusSession, NavLink } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Die Startseite ist kein Dashboard mehr.
 *
 * Früher standen hier Karten aus allen Bereichen - Trading-Status, Kalorien,
 * Gewicht, Wetter, News. Das ergab zwei konkurrierende Systeme: einen
 * Alles-Überblick und daneben die Modi als Arbeitsplätze. Man scrollte an
 * Dingen vorbei, die gerade nicht zählten.
 *
 * Jetzt beantwortet sie drei Fragen und sonst nichts:
 *   1. Was ist heute anders (ein Satz, Wetter, die Ankerpunkte des Tages)
 *   2. Was verlangt eine Entscheidung (nur wenn es etwas gibt)
 *   3. Wo arbeitest du jetzt (die Modi, mit ihren wichtigsten Zahlen)
 *
 * Steht nichts an, ist die Seite fast leer. Das ist das Ziel, kein Mangel.
 */
export default async function Start() {
  // Früher wurden Handys hier auf /heute umgeleitet, weil die Startseite
  // zu voll für kleine Bildschirme war. Seit sie nur noch Tagessatz,
  // Entscheidungen und Modi zeigt, passt sie überall - und ein Handy soll
  // dieselben Möglichkeiten haben wie der Rechner. /heute bleibt als
  // schlanke Erfassungsansicht erreichbar.
  const supabase = await createClient();
  const vorwoche = addDays(toWeekStart(heuteISO()), -7);

  const [
    { data: linkRows }, { data: focusRows }, { data: actRows },
    { data: lastReview }, { data: letzteBuchung }, kennzahlen, wochenziele,
  ] = await Promise.all([
    supabase.from("links").select("*").eq("archived", false)
      .order("group_name").order("sort_order"),
    supabase.from("focus_sessions").select("*").eq("status", "open")
      .order("started_at", { ascending: false }),
    supabase.from("activities").select("*").eq("archived", false).order("name"),
    supabase.from("weekly_reviews").select("id").eq("week_start", vorwoche).maybeSingle(),
    supabase.from("transactions").select("occurred_on")
      .order("occurred_on", { ascending: false }).limit(1),
    fetchModusKennzahlen(),
    fetchWeeklyGoals(),
  ]);

  const links = (linkRows ?? []) as NavLink[];

  if (links.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card>
          <h1 className="font-display text-lg font-bold text-ink">Navigator einrichten</h1>
          <p className="mt-2 text-sm text-ink-muted">
            KerimOS legt dir Kacheln für deine Modi an — Traden, Gym, Essen,
            Geld, Zeit. Alles danach änderbar.
          </p>
          <form action={seedLinks} className="mt-5">
            <Button type="submit" className="w-full">Kacheln anlegen</Button>
          </form>
        </Card>
      </div>
    );
  }

  // Sonntag (0) und Montag (1): sanft erinnern, solange der Rückblick fehlt
  const wochentag = heuteWochentag();
  const reviewFehlt = !lastReview && (wochentag === 0 || wochentag === 1);

  // Kontoauszug: ab einer Woche ohne neue Buchung erinnern. Der Import
  // überspringt Bekanntes von selbst.
  const letzterTag = (letzteBuchung?.[0]?.occurred_on as string | undefined) ?? null;
  const tageOhneImport = letzterTag
    ? Math.floor(
        (new Date(heuteISO() + "T12:00:00").getTime() -
          new Date(letzterTag + "T12:00:00").getTime()) / 86400000)
    : null;
  const importFaellig = tageOhneImport === null || tageOhneImport >= 7;

  const gruppen = new Map<string, NavLink[]>();
  for (const l of links) {
    const list = gruppen.get(l.group_name) ?? [];
    list.push(l);
    gruppen.set(l.group_name, list);
  }

  const modi = [...gruppen.entries()].sort(
    (a, b) =>
      ((MODE_ORDER.indexOf(a[0]) + 1) || 99) - ((MODE_ORDER.indexOf(b[0]) + 1) || 99) ||
      a[0].localeCompare(b[0]),
  );

  return (
    <div className="py-6">
      <div className="mb-6 flex items-start gap-3.5">
        <Logo inverted className="mt-0.5 h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <Tagessatz />
        </div>
      </div>

      <Tagesstrahl />

      <div className="mb-6">
        <WeeklyGoalsCard data={wochenziele} />
      </div>

      <div className="mb-6">
        <QuickSearch links={links} />
      </div>

      {/* Abendmodus: schaltet die Farben des ganzen Windows-PCs um. Blendet
          sich selbst aus, solange die Zeile noch nicht geladen ist. */}
      <div className="mb-6">
        <DisplayModeToggle />
      </div>

      {/* Was heute eine Entscheidung braucht. Jede Karte blendet sich selbst
          aus, wenn nichts ansteht - dann steht hier schlicht nichts. */}
      <div className="mb-7 space-y-3">
        <HeuteWichtig />
        <GvaLinienKarte />
        <BeobachtungKarte kompakt />
        <GewichtHeute />
        <TasksCard />
        <AppointmentsCard />

        {reviewFehlt && (
          <Link href={`/rueckblick?w=${vorwoche}`}
            className="block rounded-2xl border border-warn/30 bg-warn-tint px-5 py-3
                       text-sm text-ink-soft transition hover:border-warn/60">
            Der Wochenrückblick für letzte Woche fehlt noch — 5 Minuten, die Felder
            sind schon vorbefüllt. →
          </Link>
        )}

        {importFaellig && (
          <Link href="/import"
            className="block rounded-2xl border border-warn/30 bg-warn-tint px-5 py-3
                       text-sm text-ink-soft transition hover:border-warn/60">
            {tageOhneImport === null
              ? "Noch keine Buchungen erfasst — Kontoauszug importieren. →"
              : `Letzte Buchung vor ${tageOhneImport} Tagen — Kontoauszug holen und
                 komplett importieren, Bekanntes wird übersprungen. →`}
          </Link>
        )}

        <FocusPrompt
          sessions={(focusRows ?? []) as FocusSession[]}
          activities={(actRows ?? []) as Activity[]}
        />
      </div>

      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        Wo arbeitest du
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modi.map(([name, ls], i) => {
          const ziel = MODE_DIRECT[name] ?? `/m/${encodeURIComponent(name)}`;
          const mitBild = ls.find((l) => l.image_url);
          const farbe = ls[0]?.color ?? "#9A8C74";

          return (
            <Link key={name} href={ziel}
              className="group relative flex aspect-[16/10] animate-pop flex-col justify-end
                         overflow-hidden rounded-2xl border border-line/70 bg-card shadow-tile
                         transition duration-200 ease-tactile
                         hover:-translate-y-1 hover:border-line-strong active:scale-[0.98]"
              style={{
                animationDelay: `${i * 55}ms`,
                boxShadow: `0 14px 28px -18px ${farbe}55`,
              }}>
              {mitBild?.image_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mitBild.image_url} alt=""
                    style={{ objectPosition: mitBild.image_position ?? "50% 50%" }}
                    className="absolute inset-0 h-full w-full object-cover transition
                               duration-300 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t
                                  from-black/85 via-black/40 to-black/5" />
                </>
              ) : (
                <div className="absolute inset-0" style={{ background: farbe + "26" }}>
                  <span className="absolute right-4 top-3 text-5xl opacity-30"
                    style={{ color: farbe }}>
                    {ls[0]?.icon ?? name[0]}
                  </span>
                </div>
              )}
              <div className="relative p-4">
                <span className="font-display text-lg font-bold text-white drop-shadow">
                  {name}
                </span>
                {kennzahlen[name] && (
                  <ul className="mt-1 space-y-0.5">
                    {kennzahlen[name].map((z, j) => (
                      <li key={j}
                        className={
                          "truncate text-[11px] drop-shadow " +
                          (z.betont ? "font-medium text-white" : "text-white/70")
                        }>
                        {z.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
