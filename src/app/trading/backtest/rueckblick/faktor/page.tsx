import Link from "next/link";
import { Suspense } from "react";
import { tradingConfigured } from "@/lib/supabase/trading";
import { heuteISO } from "@/lib/time";
import {
  baueGesamtbild, baueKalibrierung, KALIBRIER_JAHRE, KALIBRIER_PAARE,
} from "@/lib/confluence/monty";
import {
  PaarUebersicht, PaarUebersichtLaedt, SchwellenTabelle, SchwellenTabelleLaedt,
} from "@/components/confluence/kalibrier-teile";
import { VARIANTEN, type Variante } from "@/lib/confluence/kalibrierung";
import { Card, CardTitle, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Trägt der Faktor überhaupt — und wie streng soll die Grenze sein?
 *
 * **Umgezogen am 24.08.2026** von `/trading/confluence`. Zwei Fragen, eine
 * Seite, weil sie sich nur zusammen beantworten lassen: eine Grenze zu
 * kalibrieren, bevor geklärt ist, ob der Faktor überhaupt trägt, heisst die
 * Nachkommastelle einer Null zu optimieren.
 *
 * Und beide brauchen dieselbe Vorentscheidung — welche **Fassung** gemessen
 * wird. Beide Währungen, nur Basis oder nur Quote sind drei verschiedene
 * Signale, und die Messung vom 21.08. sah „der Faktor trägt nicht", weil sie
 * eine andere Fassung rechnete als Kerims Indikator. Deshalb steht die
 * Variantenwahl hier ganz oben und gilt für beide Karten.
 */
type Params = Promise<Record<string, string | string[] | undefined>>;

const einer = (v: string | string[] | undefined): string | null =>
  typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null;

const hier = (o: { kal: string; variante: Variante }) =>
  `/trading/backtest/rueckblick/faktor?kal=${o.kal}&var=${o.variante}`;

export default async function FaktorSeite({ searchParams }: { searchParams: Params }) {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Faktor &amp; Grenze</CardTitle>
        <Empty>
          Trading-Datenbank nicht verbunden. In Vercel fehlen TRADING_SUPABASE_URL
          und TRADING_SUPABASE_SERVICE_ROLE_KEY.
        </Empty>
      </Card>
    );
  }

  const p = await searchParams;
  const heute = heuteISO();
  // Nicht alle 28 Paare zur Auswahl: jedes kostet zwanzig Jahre Rechnung.
  const kalPaar: string = KALIBRIER_PAARE.find((x) => x === einer(p.kal)) ?? KALIBRIER_PAARE[0];
  const variante: Variante = VARIANTEN.find((v) => v.key === einer(p.var))?.key ?? "synth";

  return (
    <>
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Faktor &amp; Grenze</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Zwanzig Jahre COT gegen zwanzig Jahre Kurs. Die erste Frage ist, ob
          Commercials gegen Retail überhaupt etwas vorhersagen — erst danach
          lohnt die zweite, wo die Grenze liegen soll.
        </p>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Trägt der Faktor überhaupt?</CardTitle>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {VARIANTEN.map((v) => (
              <Link key={v.key} title={v.hilfe} href={hier({ kal: kalPaar, variante: v.key })}
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
          Welche Paare das gerade betrifft, steht auf{" "}
          <Link href="/trading/confluence" className="text-accent-soft hover:underline">
            Monty
          </Link>{" "}
          in der Paar-Tabelle, Zeilen mit „strittig".
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Wie streng soll die Grenze sein?</CardTitle>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {KALIBRIER_PAARE.map((x) => (
              <Link key={x} href={hier({ kal: x, variante })}
                className={cx("num rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
                  kalPaar === x ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
                {x}
              </Link>
            ))}
          </span>
        </div>

        <Suspense key={`${kalPaar}-${variante}`} fallback={<SchwellenTabelleLaedt paar={kalPaar} />}>
          {/* Eigene Suspense-Grenze: hier werden zwanzig Jahre COT-Historie
              gerechnet. Die Karte darüber soll derweil schon dastehen. */}
          <KalibrierLader paar={kalPaar} heute={heute} variante={variante} />
        </Suspense>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          <code>COT_GRENZE</code> steht auf 75/25, und diese Zahl war bisher eine
          Überlegung, keine Messung. Hier steht daneben, was die anderen Schwellen
          über {KALIBRIER_JAHRE} Jahre gebracht hätten. Geändert wird dadurch
          nichts — die Tabelle ist die Grundlage für die Entscheidung, nicht die
          Entscheidung.
        </p>
        <p className="mt-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
          <strong>Eine Warnung zur Benutzung dieser Tabelle.</strong> Fünf
          Schwellen mal vier Horizonte sind zwanzig Kombinationen je Paar. Unter
          zwanzig findet sich immer eine gute — auch in Zufallszahlen. Ein
          Ergebnis zählt erst, wenn dieselbe Schwelle über <em>mehrere</em>
          Paare vorne liegt. Deshalb steht die Karte darüber und nicht darunter.
        </p>
      </Card>
    </>
  );
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
