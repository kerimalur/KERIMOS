import Link from "next/link";
import { Suspense } from "react";
import { tradingConfigured } from "@/lib/supabase/trading";
import { heuteISO } from "@/lib/time";
import {
  baueGesamtbild, baueKalibrierung, baueMontyCot, baueSaisonZeile,
  KALIBRIER_JAHRE, KALIBRIER_PAARE, MONTY_PAARE,
} from "@/lib/confluence/monty";
import {
  PaarUebersicht, PaarUebersichtLaedt, SchwellenTabelle, SchwellenTabelleLaedt,
} from "@/components/confluence/kalibrier-teile";
import { VARIANTEN, type Variante } from "@/lib/confluence/kalibrierung";
import { FENSTER, MAX_JAHRE, MIN_JAHRE, type Fenster } from "@/lib/confluence/saison";
import { CotStatistikTabelle, SaisonKopf, SaisonZeile, SaisonZeileLaedt } from "@/components/confluence/monty-teile";
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

/** Adresse dieser Seite mit den drei Einstellungen — an einer Stelle. */
const hier = (o: { jahre: Fenster; kal: string; variante: Variante }) =>
  `/trading/confluence?jahre=${o.jahre}&kal=${o.kal}&var=${o.variante}`;

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
  // Nicht alle 28 Paare zur Auswahl: jedes kostet zwanzig Jahre Rechnung.
  const kalPaar: string = KALIBRIER_PAARE.find((x) => x === einer(p.kal)) ?? KALIBRIER_PAARE[0];
  const variante: Variante = VARIANTEN.find((v) => v.key === einer(p.var))?.key ?? "beide";

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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Trägt der Faktor überhaupt?</CardTitle>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {VARIANTEN.map((v) => (
              <Link key={v.key} title={v.hilfe}
                href={hier({ jahre: fenster, kal: kalPaar, variante: v.key })}
                className={cx("rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
                  variante === v.key ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
                {v.label}
              </Link>
            ))}
          </span>
        </div>

        <Suspense key={variante} fallback={<PaarUebersichtLaedt />}>
          <GesamtLader heute={heute} variante={variante} />
        </Suspense>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Dein Pine-Indikator nimmt für USDJPY <strong>eine</strong> Währung —
          oben rechts steht „Quelle: USD", CFTC 098662, der Dollar-Index. Diese
          Rechnung nahm bisher <strong>beide</strong> Beine und zog sie
          voneinander ab. Das sind zwei verschiedene Signale, und sie können
          sich gegenseitig auslöschen: stehen USD und JPY gleichzeitig gestreckt
          short, ist die Differenz null und es entsteht gar kein Signal —
          obwohl der Indikator eines zeigt. „nur Basiswährung" rechnet wie er.
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Wie streng soll die Grenze sein?</CardTitle>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {KALIBRIER_PAARE.map((x) => (
              <Link key={x} href={hier({ jahre: fenster, kal: x, variante })}
                className={cx("num rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
                  kalPaar === x ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
                {x}
              </Link>
            ))}
          </span>
        </div>

        <Suspense key={`${kalPaar}-${variante}`} fallback={<SchwellenTabelleLaedt paar={kalPaar} />}>
          {/* Eigene Suspense-Grenze: hier werden zwanzig Jahre COT-Historie
              gerechnet. Der Rest von Monty soll derweil schon dastehen. */}
          <KalibrierLader paar={kalPaar} heute={heute} variante={variante} />
        </Suspense>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          <code>COT_GRENZE</code> steht auf 75/25, und diese Zahl war bisher eine
          Überlegung, keine Messung. Hier steht daneben, was die anderen Schwellen
          über {KALIBRIER_JAHRE} Jahre gebracht hätten. Geändert wird dadurch
          nichts — die Tabelle ist die Grundlage für die Entscheidung, nicht die
          Entscheidung.
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Saisonalität — alle 28 Paare</CardTitle>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {FENSTER.map((f) => (
              <Link key={f} href={hier({ jahre: f, kal: kalPaar, variante })}
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

async function KalibrierLader(
  { paar, heute, variante }: { paar: string; heute: string; variante: Variante },
) {
  const bild = await baueKalibrierung(paar, heute, variante);
  return <SchwellenTabelle bild={bild} />;
}

async function GesamtLader({ heute, variante }: { heute: string; variante: Variante }) {
  const bild = await baueGesamtbild(heute, variante);
  return <PaarUebersicht bild={bild} />;
}
