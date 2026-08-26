import Link from "next/link";
import { Suspense } from "react";
import { tradingConfigured } from "@/lib/supabase/trading";
import { heuteISO } from "@/lib/time";
import { baueMontyCot, baueSaisonZeile, MONTY_PAARE } from "@/lib/confluence/monty";
import { FENSTER, MAX_JAHRE, MIN_JAHRE, type Fenster } from "@/lib/confluence/saison";
import {
  CotPaarTabelle, CotStatistikTabelle, SaisonKopf, SaisonZeile, SaisonZeileLaedt,
} from "@/components/confluence/monty-teile";
import { Card, CardTitle, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Confluences — nur noch Monty.
 *
 * Vorher standen hier fünf Ansichten (Terminal, Monty, Jetzt, Rückblick,
 * Bilanz) und damit zwei völlig verschiedene Rechnungen nebeneinander: das
 * Fünf-Faktoren-Modell aus Zins, Zinserwartung, Realzins, Risiko-Regime und
 * COT — und Monty aus Commercials/Retail und Saisonalität. Kerim arbeitet mit
 * Monty. Ein Modell, das er nicht benutzt, ist keine zweite Meinung, sondern
 * eine zweite Zahl, die man beim Widerspruch wegerklären muss.
 *
 * Wohin der Rest gegangen ist:
 *   Terminal + Jetzt → gelöscht (das Fünf-Faktoren-Modell entfällt)
 *   Rückblick        → /trading/backtest/rueckblick
 *   Bilanz           → /trading/journal/bilanz
 *
 * Das allgemeine Währungs-Ranking steht als eigener Reiter daneben; es ist die
 * Übersicht, Monty die Tiefe.
 */

type Params = Promise<Record<string, string | string[] | undefined>>;

const einer = (v: string | string[] | undefined): string | null =>
  typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null;

/** Adresse dieser Seite. Seit dem 24.08. gibt es nur noch eine Einstellung:
 *  das Saison-Fenster. Paarwahl und Variante sind mit der Kalibrierung in den
 *  Backtest gezogen. */
const hier = (jahre: Fenster) => `/trading/confluence?jahre=${jahre}`;

export default async function ConfluencePage({ searchParams }: { searchParams: Params }) {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Confluences</CardTitle>
        <Empty>
          Trading-Datenbank nicht verbunden. In Vercel fehlen TRADING_SUPABASE_URL
          und TRADING_SUPABASE_SERVICE_ROLE_KEY.
        </Empty>
      </Card>
    );
  }

  const p = await searchParams;
  const heute = heuteISO();
  const fenster: Fenster = FENSTER.find((f) => String(f) === einer(p.jahre)) ?? 20;
  const cot = await baueMontyCot(heute);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Monty</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Commercials gegen Retail und Saisonalität — die zwei Faktoren, mit
          denen Kerim tatsächlich arbeitet. Kein Zins, keine Inflation, kein
          Risiko-Regime. Filter für den Einstieg, nicht der Einstieg selbst.
        </p>
      </div>

      <Card>
        <CardTitle>Commercials gegen Retail — Stand {heute}</CardTitle>
        <CotStatistikTabelle zeilen={cot.waehrungen} />
        {Object.values(cot.gruppen).every((g) => g.komm === 0) && (
          <p className="mt-3 rounded-xl bg-bad-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
            <strong>Keine Legacy-COT-Zeilen geladen.</strong> Die Tabelle ist nicht
            deshalb leer, weil nichts gestreckt ist, sondern weil Commercials und
            Nicht-Meldepflichtige gar keine Wochenwerte haben. Mögliche Ursachen, in
            dieser Reihenfolge: ein alter Eintrag im Seiten-Cache (löst sich nach 30
            Minuten von selbst), oder in <code>cot_reports</code> stehen die Spalten
            <code> comm_long</code> / <code>nonrept_long</code> nur als NULL, weil der
            Screener sie erst später mitgeschrieben hat. Dann hilft nur ein voller
            COT-Backfill.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          <strong>Gestreckt</strong> heisst: Commercials und Nicht-Meldepflichtige stehen
          gleichzeitig an entgegengesetzten Rändern ihrer eigenen drei Jahre. Die Richtung
          folgt den Commercials. Die Spalte daneben sagt, wie oft das in den letzten drei
          Jahren überhaupt vorkam — steht dort ein hoher Anteil, ist die Streckung kein
          Extrem, sondern der Normalzustand.
        </p>
        <p className="mt-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
          <strong>Warum nicht einfach „die zeigen auseinander":</strong> im COT gilt netto
          <em> Commercials ≈ −(Grossspekulanten + Retail)</em>. Sie stehen fast immer gegen
          Retail, weil jemand die Gegenseite halten muss. Ein Filter auf das blosse
          Vorzeichen hätte in neun von zehn Wochen zugestimmt — das ist Buchhaltung, kein
          Signal. „Retail" sind hier ausserdem die Kleinspekulanten am{" "}
          <strong>Termin</strong>markt, nicht CFD-Retail; ein Proxy, dafür mit Jahrzehnten
          Historie.
        </p>
      </Card>

      <Card>
        <CardTitle>Commercials gegen Retail — je Paar</CardTitle>
        <p className="mb-3 text-[11px] leading-relaxed text-ink-faint">
          Dieselbe Lage wie oben, nur auf Paarebene. Der Screener rechnet
          Basis minus Quote, dein Pine-Indikator nur die Basiswährung — hier
          stehen beide nebeneinander, damit sich der Unterschied nicht im Kopf
          abspielt.
        </p>
        <CotPaarTabelle zeilen={cot.paare} />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Saisonalität — alle 28 Paare</CardTitle>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {FENSTER.map((f) => (
              <Link key={f} href={hier(f)}
                className={cx("num rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
                  fenster === f ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
                {f} Jahre
              </Link>
            ))}
          </span>
        </div>

        <div className="max-h-[36rem] overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <SaisonKopf />
            <tbody>
              {MONTY_PAARE.map((paar) => (
                <Suspense key={paar} fallback={<SaisonZeileLaedt paar={paar} />}>
                  {/* Jede Zeile laedt ihre eigenen Kurse: 28 Paare mal rund 5000
                      Tageskerzen waeren in einem Zug 140 000 Zeilen. So fuellt sich
                      die Tabelle Paar fuer Paar, statt in den Timeout zu laufen.
                      Nach dem ersten Aufruf sind die Kurse 24 h gecacht. */}
                  <SaisonZeilenLader paar={paar} fenster={fenster} heute={heute} />
                </Suspense>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Die Zahl ist der <strong>Median</strong> der Monatsrenditen in Prozent, nicht
          der Durchschnitt: ein einziges Ausreisserjahr verschiebt den Durchschnitt, den
          Median nicht. Farbig ist ein Monat nur, wenn er <strong>belegt</strong> ist -
          das Wilson-Intervall seiner Trefferquote darf die 50 % nicht enthalten. Sieben
          von zehn positiven Jahren sehen deutlich aus und sind es nicht.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Mindestens {MIN_JAHRE} bewegte Jahre je Monat, sonst bleibt das Feld blass.
          Jahre ganz ohne Bewegung zaehlen in keine Richtung - kein Ergebnis ist kein
          Verlust. Weiter als {MAX_JAHRE} Jahre zurueck geht es nicht: OANDA liefert
          hoechstens 5000 Tageskerzen je Instrument.
        </p>
      </Card>

      {/* Umgezogen am 24.08.2026: „Trägt der Faktor überhaupt?" und die
          Schwellen-Kalibrierung sind Auswertungsfragen über zwanzig Jahre und
          gehören nicht auf eine Seite, die die Lage von heute zeigt. Wer
          morgens auf Monty schaut, will keine Kalibrierung sehen — und wer
          kalibriert, tut das nicht nebenbei. */}
      <p className="text-xs text-ink-faint">
        „Trägt der Faktor überhaupt?" und „Wie streng soll die Grenze sein?"
        stehen jetzt im Backtest unter{" "}
        <Link href="/trading/backtest/rueckblick/faktor"
          className="text-accent-soft hover:underline">
          Rückblick → Faktor &amp; Grenze
        </Link>
        .
      </p>
    </div>
  );
}

/** Eine Zeile der Saison-Matrix - eigene Komponente, damit Suspense greift. */
async function SaisonZeilenLader({ paar, fenster, heute }: {
  paar: string; fenster: Fenster; heute: string;
}) {
  const bild = await baueSaisonZeile(paar, fenster, heute);
  return <SaisonZeile bild={bild} />;
}
