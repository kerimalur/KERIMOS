import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppointmentsCard } from "@/components/appointments-card";
import { Tagessatz } from "@/components/tagessatz";
import { GewichtHeute } from "@/components/gewicht-heute";
import { GvaLinienKarte } from "@/components/gva-linien-karte";
import { HeuteWichtig } from "@/components/heute-wichtig";
import { DisplayModeToggle } from "@/components/display-mode-toggle";
import { Logo } from "@/components/logo";
import { QuickSearch } from "@/components/quick-search";
import { Button, Card } from "@/components/ui";
import { WeeklyGoalsCard } from "@/components/weekly-goals";
import { seedLinks } from "@/lib/actions";
import { fetchModusKennzahlen } from "@/lib/modus-kennzahlen";
import { fetchWeeklyGoals } from "@/lib/weekly-goals";
import { ladeWochenziele } from "@/lib/wochenziele";
import { wochenpaar } from "@/lib/wochenrueckblick";
import { MODE_ORDER, MODE_DIRECT, MODE_AUS } from "@/lib/modes";
import { weekStart as toWeekStart, heuteISO, heuteWochentag } from "@/lib/time";
import type { NavLink } from "@/lib/types";

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
 *   1. Was ist heute anders (ein Satz, Wetter, die Termine des Tages)
 *   2. Was verlangt eine Entscheidung (nur wenn es etwas gibt)
 *   3. Wo arbeitest du jetzt (die Modi, mit ihren wichtigsten Zahlen)
 *
 * Reihenfolge seit 21.08.2026, von Kerim vorgegeben: Kopfzeile mit Suche und
 * Farbumschalter, dann die Woche, dann was heute zaehlt, dann die Termine,
 * dann Trading, dann die Modi. Der Zeitstrahl ist raus — er zeigte eine
 * Erfassung, die es nicht mehr gibt.
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
  // Welche Woche der Rückblick gerade meint, entscheidet `wochenpaar()`:
  // am Wochenende die endende Woche, Mo-Fr die davor. Vorher stand hier fest
  // „die Vorwoche" — sonntags war das die falsche und der Hinweis zeigte auf
  // ein Formular, das gar nicht dran war.
  const faelligeWoche = wochenpaar(heuteISO()).rueckblick;

  const laufendeWoche = toWeekStart(heuteISO());

  const [
    { data: linkRows }, { data: lastReview }, kennzahlen, wochenziele, zielListe,
  ] = await Promise.all([
    supabase.from("links").select("*").eq("archived", false)
      .order("group_name").order("sort_order"),
    supabase.from("weekly_reviews").select("id").eq("week_start", faelligeWoche).maybeSingle(),
    fetchModusKennzahlen(),
    fetchWeeklyGoals(),
    ladeWochenziele(laufendeWoche),
  ]);

  const links = (linkRows ?? []) as NavLink[];

  if (links.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card>
          <h1 className="font-display text-lg font-bold text-ink">Navigator einrichten</h1>
          <p className="mt-2 text-sm text-ink-muted">
            KerimOS legt dir Kacheln für deine Modi an — Traden, Gym, Essen,
            Zeit. Alles danach änderbar.
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
  // Samstag bis Dienstag. Danach bleibt das Nachholfenster offen, aber ein
  // Banner, das die ganze Woche steht, liest niemand mehr.
  const reviewFehlt = !lastReview && [6, 0, 1, 2].includes(wochentag);

  const gruppen = new Map<string, NavLink[]>();
  for (const l of links) {
    // Ausgeblendete Gruppen (aktuell "Geld") bleiben in der Datenbank stehen,
    // erscheinen aber nicht mehr. Loeschen waere unumkehrbar fuer nichts.
    if (MODE_AUS.has(l.group_name)) continue;
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
      {/* Kopfzeile: Begruessung links, Suche und Farbumschalter in der Mitte,
          das Wetter steht im Tagessatz ganz rechts. Auf schmalen Schirmen
          rutscht die Suche unter die Begruessung, statt sie zu quetschen. */}
      <div className="mb-6 flex flex-wrap items-start gap-3.5">
        <Logo inverted className="mt-0.5 h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 basis-64">
          <Tagessatz />
        </div>
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-2">
          <div className="min-w-0 flex-1">
            <QuickSearch links={links} />
          </div>
          {/* Abendmodus: schaltet die Farben des ganzen Windows-PCs um.
              Blendet sich selbst aus, solange die Zeile nicht geladen ist. */}
          <DisplayModeToggle />
        </div>
      </div>

      <div className="mb-6">
        <WeeklyGoalsCard data={wochenziele} ziele={zielListe.ziele}
          weekStart={laufendeWoche} />
      </div>

      {/* Was heute eine Entscheidung braucht. Jede Karte blendet sich selbst
          aus, wenn nichts ansteht - dann steht hier schlicht nichts. */}
      <div className="mb-7 space-y-3">
        <HeuteWichtig />
        <AppointmentsCard />
        <GvaLinienKarte />
        <GewichtHeute />

        {reviewFehlt && (
          <Link href="/rueckblick"
            className="block rounded-2xl border border-warn/30 bg-warn-tint px-5 py-3
                       text-sm text-ink-soft transition hover:border-warn/60">
            Der Wochenrückblick fehlt noch — fünf Minuten, und dabei stehen
            gleich die Ziele für die nächste Woche. →
          </Link>
        )}

        {/* Zen: eine Uhr und ein leerer Bildschirm. Ersetzt die
            Fokus-Sitzungen, die am Ende nach jeder Sitzung eine Erfassung
            verlangten — genau das, was abgeschafft wurde. */}
        <Link href="/zen"
          className="flex items-center justify-between rounded-2xl border border-line/70
                     bg-card px-5 py-3 text-sm text-ink-soft shadow-card transition
                     hover:border-line-strong active:scale-[0.99]">
          <span>Zen-Modus — Uhr an, Bildschirm leer</span>
          <span className="text-ink-faint">→</span>
        </Link>
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
