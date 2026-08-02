import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FocusPrompt } from "@/components/focus-prompt";
import { TradingCard } from "@/components/trading-card";
import { TodayCard } from "@/components/today-card";
import { AppointmentsCard } from "@/components/appointments-card";
import { TasksCard } from "@/components/tasks-card";
import { MorningCard } from "@/components/morning-card";
import { NewsCard } from "@/components/news-card";
import { Logo } from "@/components/logo";
import { QuickSearch } from "@/components/quick-search";
import { Button, Card } from "@/components/ui";
import { seedLinks } from "@/lib/actions";
import { MODE_ORDER, MODE_DIRECT } from "@/lib/modes";
import { chf } from "@/lib/format";
import {
  addDays, weekStart as toWeekStart, heuteISO, heuteWochentag,
  fmtHours, pct, summarizeWeek,
} from "@/lib/time";
import type {
  Activity, DailyTime, FocusSession, NavLink, RunwayInputs, WeeklyBucket,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Start({
  searchParams,
}: {
  searchParams: Promise<{ voll?: string }>;
}) {
  // Handys landen auf /heute - ausser sie wollen ausdrücklich die volle
  // Ansicht (?voll=1, der "Alle Modi"-Link). Erkennung über den User-Agent;
  // iPads zählen bewusst als Desktop.
  const sp = await searchParams;
  const ua = (await headers()).get("user-agent") ?? "";
  if (!sp.voll && /Android.*Mobile|iPhone/i.test(ua)) redirect("/heute");

  const supabase = await createClient();
  const woche = toWeekStart(heuteISO());
  const vorwoche = addDays(woche, -7);

  const [
    { data: linkRows }, { data: focusRows }, { data: actRows }, { data: lastReview },
    { data: inputsRows }, { data: weekDaily }, { data: weekBuckets },
    { data: letzteBuchung },
  ] = await Promise.all([
    supabase.from("links").select("*").eq("archived", false)
      .order("group_name").order("sort_order"),
    supabase.from("focus_sessions").select("*").eq("status", "open")
      .order("started_at", { ascending: false }),
    supabase.from("activities").select("*").eq("archived", false).order("name"),
    supabase.from("weekly_reviews").select("id").eq("week_start", vorwoche).maybeSingle(),
    supabase.rpc("runway_inputs", { months_lookback: 3 }),
    supabase.from("v_daily_time").select("*")
      .gte("entry_date", woche).lte("entry_date", addDays(woche, 6)),
    supabase.from("v_weekly_buckets").select("*").eq("week_start", woche),
    supabase.from("transactions").select("occurred_on")
      .order("occurred_on", { ascending: false }).limit(1),
  ]);

  const links = (linkRows ?? []) as NavLink[];

  if (links.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card>
          <h1 className="font-display text-lg font-bold text-ink">Navigator einrichten</h1>
          <p className="mt-2 text-sm text-ink-muted">
            KerimOS legt dir Kacheln für deine Modi an — Traden, Programmieren,
            Gym, Essen, Geld, Zeit. Alles danach änderbar — Kacheln verwaltest
            du in der App, nicht im Code.
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
  // überspringt Bekanntes von selbst - man darf den ganzen Auszug reinziehen.
  const letzterTag = (letzteBuchung?.[0]?.occurred_on as string | undefined) ?? null;
  const tageOhneImport = letzterTag
    ? Math.floor(
        (new Date(heuteISO() + "T12:00:00").getTime() -
          new Date(letzterTag + "T12:00:00").getTime()) / 86400000
      )
    : null;
  const importFaellig = tageOhneImport === null || tageOhneImport >= 7;

  // Modi = Kachel-Gruppen
  const gruppen = new Map<string, NavLink[]>();
  for (const l of links) {
    const list = gruppen.get(l.group_name) ?? [];
    list.push(l);
    gruppen.set(l.group_name, list);
  }
  // Kennzahlen für die Kacheln "Geld" und "Zeit" - sie ersetzen den
  // Zwischenschritt über den Arbeitsplatz.
  const geld = (inputsRows as RunwayInputs[] | null)?.[0];
  const tage = ((weekDaily ?? []) as DailyTime[]).map((d) => ({
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
  const zeit = tage.length > 0
    ? summarizeWeek(tage, (weekBuckets ?? []) as WeeklyBucket[])
    : null;

  const kennzahlen: Record<string, { label: string; wert: string }[]> = {};
  if (geld) {
    kennzahlen.Geld = [
      { label: "Liquide", wert: chf(Number(geld.liquid ?? 0)) },
      { label: "Ø ein", wert: chf(Number(geld.avg_income ?? 0)) },
      { label: "Ø aus", wert: chf(Number(geld.avg_expenses ?? 0)) },
    ];
  }
  if (zeit) {
    kennzahlen.Zeit = [
      { label: "An Zielen", wert: pct(zeit.goalShare) },
      { label: "Erfasst", wert: fmtHours(zeit.totalLogged) },
      { label: "Unerfasst", wert: fmtHours(zeit.totalUnaccounted) },
    ];
  }

  const modi = [...gruppen.entries()].sort(
    (a, b) =>
      ((MODE_ORDER.indexOf(a[0]) + 1) || 99) - ((MODE_ORDER.indexOf(b[0]) + 1) || 99) ||
      a[0].localeCompare(b[0])
  );

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Logo inverted className="h-11 w-11 rounded-2xl" />
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight text-ink">
              {(() => {
                // Tageszeit in Zürcher Zeit - der Server steht in Dublin.
                const stunde = Number(new Intl.DateTimeFormat("en-US", {
                  timeZone: "Europe/Zurich", hour: "numeric", hour12: false,
                }).format(new Date()));
                if (stunde < 5) return "Noch wach, Kerim?";
                if (stunde < 11) return "Morgen, Kerim";
                if (stunde < 14) return "Mittag, Kerim";
                if (stunde < 18) return "Nachmittag, Kerim";
                if (stunde < 22) return "Abend, Kerim";
                return "Späte Runde, Kerim";
              })()}
            </h1>
            <p className="text-sm text-ink-muted">Was willst du jetzt tun?</p>
          </div>
        </div>
        <QuickSearch links={links} />
      </div>

      {/* Schmale Modus-Leiste. Die grossen Kacheln weiter unten bleiben der
          Einstieg zum Stöbern - wer aber weiss, wo er hin will, soll nicht
          erst an allen Karten vorbeiscrollen müssen. */}
      <nav className="mb-5 flex flex-wrap gap-1.5">
        {modi.map(([name, ls]) => {
          const ziel = MODE_DIRECT[name] ?? `/m/${encodeURIComponent(name)}`;
          const farbe = ls[0]?.color ?? "#9A8C74";
          return (
            <Link key={name} href={ziel}
              className="flex items-center gap-1.5 rounded-lg border border-line/70 bg-card
                         px-2.5 py-1.5 text-xs font-medium text-ink-soft transition
                         hover:border-line-strong hover:text-ink">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: farbe }} />
              {name}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-5">
        <MorningCard />
        <TasksCard />
        <AppointmentsCard />
        <TradingCard />
        <TodayCard />
        {/* Meal Prep lebt im Essen-Bereich - auf der Startseite war es eine
            Frage, die man dort ohnehin nicht beantwortet. */}
        <NewsCard />

        {reviewFehlt && (
          <Link href={`/rueckblick?w=${vorwoche}`}
            className="block rounded-2xl border border-warn/30 bg-warn-tint px-5 py-3 text-sm text-ink-soft transition hover:border-warn/60">
            Der Wochenrückblick für letzte Woche fehlt noch — 5 Minuten, die Felder
            sind schon vorbefüllt. →
          </Link>
        )}

        {importFaellig && (
          <Link href="/import"
            className="block rounded-2xl border border-warn/30 bg-warn-tint px-5 py-3 text-sm text-ink-soft transition hover:border-warn/60">
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modi.map(([name, ls], i) => {
            const zahlen = kennzahlen[name];
            // Geld und Zeit springen direkt in ihren Bereich - der
            // Arbeitsplatz dazwischen bringt dort nichts.
            const ziel = MODE_DIRECT[name] ?? `/m/${encodeURIComponent(name)}`;
            // Das Modus-Bild ist das Bild der ersten Kachel, die eines hat -
            // hochgeladen wird es wie gewohnt unter "Kacheln verwalten".
            const mitBild = ls.find((l) => l.image_url);
            const farbe = ls[0]?.color ?? "#9A8C74";

            return (
              <Link key={name} href={ziel}
                className="group relative flex aspect-[16/10] animate-pop flex-col justify-end
                           overflow-hidden rounded-2xl border border-line/70 bg-card shadow-tile
                           transition duration-200 ease-tactile
                           hover:-translate-y-1 hover:border-line-strong active:scale-[0.98]"
                style={{ animationDelay: `${i * 55}ms`, boxShadow: `0 14px 28px -18px ${farbe}55` }}>
                {mitBild?.image_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mitBild.image_url} alt=""
                      style={{ objectPosition: mitBild.image_position ?? "50% 50%" }}
                      className="absolute inset-0 h-full w-full object-cover transition
                                 duration-300 group-hover:scale-[1.03]" />
                    {/* Verlauf, damit die Schrift auf jedem Bild lesbar bleibt.
                        Bewusst schwarz und nicht `ink` - `ink` ist im dunklen
                        Design die helle Textfarbe und wuerde das Bild ausbleichen. */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/5" />
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
                  <div className={mitBild?.image_url
                    ? "font-display text-2xl font-bold leading-tight text-white drop-shadow"
                    : "font-display text-2xl font-bold leading-tight text-ink"}>
                    {name}
                  </div>

                  {zahlen ? (
                    <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                      {zahlen.map((k) => (
                        <div key={k.label}>
                          <dt className={mitBild?.image_url
                            ? "text-[10px] uppercase tracking-[0.1em] text-white/70"
                            : "text-[10px] uppercase tracking-[0.1em] text-ink-muted"}>
                            {k.label}
                          </dt>
                          <dd className={mitBild?.image_url
                            ? "tabular text-sm text-white"
                            : "tabular text-sm text-ink"}>
                            {k.wert}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className={mitBild?.image_url
                      ? "mt-1 truncate text-xs text-white/75"
                      : "mt-1 truncate text-xs text-ink-muted"}>
                      {ls.slice(0, 3).map((l) => l.title).join(" · ")}
                      {ls.length > 3 && " · …"}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
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
