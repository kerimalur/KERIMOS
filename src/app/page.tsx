import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Tagessatz } from "@/components/tagessatz";
import { GewichtHeute } from "@/components/gewicht-heute";
import { GewohnheitenKarte } from "@/components/gewohnheiten-karte";
import { PlanungBereich } from "@/components/planung-bereich";
import { GvaLinienKarte } from "@/components/gva-linien-karte";
import { DisplayModeToggle } from "@/components/display-mode-toggle";
import { Logo } from "@/components/logo";
import { QuickSearch } from "@/components/quick-search";
import { Button, Card } from "@/components/ui";
import { seedLinks } from "@/lib/actions";
import { fetchModusKennzahlen } from "@/lib/modus-kennzahlen";
import { MODE_ORDER, MODE_DIRECT, MODE_AUS } from "@/lib/modes";
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
 * Jetzt beantwortet sie vier Fragen und sonst nichts:
 *   1. Was ist heute anders (ein Satz, das Wetter)
 *   2. Was will heute getan werden (die Gewohnheiten)
 *   3. Was steht an (die Planung: Kalender, Aufgaben, Projekte)
 *   4. Wo arbeitest du jetzt (die Modi, mit ihren wichtigsten Zahlen)
 *
 * Die Reihenfolge ist die Reihenfolge des Tages: erst was man tut, dann was
 * man erledigt, dann wo man hingeht.
 *
 * Die Planung steht vollständig auf der Seite und nicht hinter einem Menü —
 * Kalender oben, Aufgaben in der Mitte, Projekte unten, genau wie im
 * Notion-Dashboard, das sie ersetzt. Eine zusammengefasste Vorschau mit
 * „alle 12 ↗" stand hier vorher und war der falsche Kompromiss: man sah, DASS
 * etwas ansteht, und musste für jede Handlung doch weiterklicken.
 *
 * Beim Umbau vom 09.09.2026 ist der ganze Zeit-Bereich entfallen — Termine,
 * Tages- und Wochenrückblick, Wochenziele, Schichten, Zen. Die Aufgaben sind
 * als eigenes, schmales Modul zurückgekommen (siehe lib/planung.ts): Name,
 * Haken, optional ein Datum, optional ein Projekt. Der Vorgänger hatte
 * Priorität, Lebensbereich und Unteraufgaben — und wurde deshalb nicht
 * gepflegt.
 *
 * Steht nichts an, ist die Seite fast leer. Das ist das Ziel, kein Mangel.
 */
export default async function Start({
  searchParams,
}: {
  /** `monat` blaettert den Kalender im Planungsbereich. */
  searchParams: Promise<{ monat?: string }>;
}) {
  const { monat } = await searchParams;
  const supabase = await createClient();

  const [{ data: linkRows }, kennzahlen] = await Promise.all([
    supabase.from("links").select("*").eq("archived", false)
      .order("group_name").order("sort_order"),
    fetchModusKennzahlen(),
  ]);

  const links = (linkRows ?? []) as NavLink[];

  if (links.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card>
          <h1 className="font-display text-lg font-bold text-ink">Navigator einrichten</h1>
          <p className="mt-2 text-sm text-ink-muted">
            KerimOS legt dir Kacheln für deine Modi an — Traden, Gym, Essen,
            Lernen. Alles danach änderbar.
          </p>
          <form action={seedLinks} className="mt-5">
            <Button type="submit" className="w-full">Kacheln anlegen</Button>
          </form>
        </Card>
      </div>
    );
  }

  const gruppen = new Map<string, NavLink[]>();
  for (const l of links) {
    // Ausgeblendete Gruppen ("Geld", "Zeit") bleiben in der Datenbank stehen,
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
          {/* Planung und Einstellungen als Symbole neben der Suche: beide
              erreicht man von hier aus mehrmals am Tag, aber keiner von
              beiden verdient eine eigene Kachel — die Kacheln sind die
              Arbeitsplaetze, das hier sind Werkzeuge. */}
          <Kopfknopf href="/planung" titel="Planung — Aufgaben und Kalender">
            ▤
          </Kopfknopf>
          <Kopfknopf href="/einstellungen" titel="Einstellungen">
            ⚙
          </Kopfknopf>
          {/* Abendmodus: schaltet die Farben des ganzen Windows-PCs um.
              Blendet sich selbst aus, solange die Zeile nicht geladen ist. */}
          <DisplayModeToggle />
        </div>
      </div>

      {/* Die Gewohnheiten stehen zuoberst, weil sie das Einzige sind, was
          diese Seite von einem gedrueckt werden WILL. Alles darunter ist
          Anzeige. Die Backtest-Trades haengen als gezaehlte Zeile mit drin —
          eine eigene Karte fuer eine einzige Zahl war die Zersplitterung,
          die die Seite unlesbar gemacht hat.

          Jede Karte blendet sich selbst aus, wenn nichts ansteht - dann
          steht hier schlicht nichts. */}
      <div className="mb-7 space-y-3">
        <GewohnheitenKarte mitBacktest
          leer="Noch keine Gewohnheit. Unter Einstellungen legst du die erste an." />
        <GvaLinienKarte />
        <GewichtHeute />
      </div>

      {/* Die Planung steht vollstaendig hier und nicht hinter einem Menue:
          Kalender, Aufgaben, Projekte. Genau die Reihenfolge des
          Notion-Dashboards, das sie ersetzt — wer es kennt, muss sich nicht
          umgewoehnen. /planung zeigt dasselbe ohne das Drumherum. */}
      <div className="mb-7">
        <PlanungBereich monat={monat} basis="/" />
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

/** Ein Symbolknopf in der Kopfzeile — gleiche Hoehe wie das Suchfeld. */
function Kopfknopf({
  href, titel, children,
}: {
  href: string;
  titel: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} title={titel} aria-label={titel}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line
                 bg-card text-sm text-ink-muted transition duration-150 ease-tactile
                 hover:border-line-strong hover:text-ink active:scale-95">
      {children}
    </Link>
  );
}
