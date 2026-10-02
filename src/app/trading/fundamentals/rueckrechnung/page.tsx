import Link from "next/link";
import { tradingConfigured } from "@/lib/supabase/trading";
import { ladeRueckrechnung } from "@/lib/makro/rueckrechnung";
import { rueckrechnungJetzt, variantenJetzt } from "@/lib/wochenideen-actions";
import { RueckrechnungKarte } from "@/components/makro/rueckrechnung-teile";
import { VariantenVergleich } from "@/components/makro/varianten-vergleich";
import { ladeVarianten } from "@/lib/makro/varianten";
import { variantenBild } from "@/lib/makro/varianten-rechnen";
import { Card, CardTitle, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
// „Jetzt neu rechnen" läuft als Server-Aktion dieser Seite und braucht Zeit.
export const maxDuration = 300;

/**
 * Makro-Backtest (02.10.2026): die Rückrechnung ab März 2024 auf eigener
 * Seite. Sie beantwortet: Hätten die Ideen „stark gegen schwach" des
 * Makro-Modells in den 2 Wochen danach Geld gebracht — und besser als Zufall?
 */
export default async function RueckrechnungSeite() {
  if (!tradingConfigured()) {
    return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  }
  const [rueck, varianten] = await Promise.all([ladeRueckrechnung(), ladeVarianten()]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Makro-Backtest · Rückrechnung</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Für jeden Montag ab März 2024 das Urteil, das das Terminal damals gezeigt hätte, und daraus die
            Paare stärkste gegen schwächste Währung. Gemessen wird, ob sie nach 2 Wochen in Richtung der Idee
            gelaufen sind. Grün heisst klar besser als Zufall, rot klar schlechter.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form action={rueckrechnungJetzt}>
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-on">
              Jetzt neu rechnen
            </button>
          </form>
          <Link href="/trading/fundamentals/wochenideen" className="text-xs text-accent-soft hover:underline">Wochenaussicht →</Link>
        </div>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Varianten-Vergleich · was trägt?</CardTitle>
          <form action={variantenJetzt} className="ml-auto">
            <button type="submit" className="rounded-lg bg-sand px-3 py-1 text-xs text-ink-muted hover:text-ink">Varianten neu rechnen</button>
          </form>
        </div>
        {varianten.zeilen.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Noch nicht gerechnet. Einmal <code className="text-xs">supabase/trading/09_makro_varianten.sql</code> ausführen,
            dann „Varianten neu rechnen" drücken (dauert 1–3 Minuten).
          </p>
        ) : (
          <VariantenVergleich bild={variantenBild(varianten.zeilen)} gerechnetAm={varianten.gerechnetAm} />
        )}
      </Card>

      <RueckrechnungKarte rueck={rueck} />

      <Card>
        <p className="text-xs leading-relaxed text-ink-muted">
          So liest du es: Eine Trefferquote zählt erst, wenn sie ausserhalb des Zufallsbands liegt. Klasse A
          (stark gegen schwach) sollte besser sein als Klasse B. Ändert sich das Modell, etwa die halbe
          Gewichtung von Inflation im Zielband (01.10.2026), nach dem Deploy einmal neu rechnen und die Zahlen
          mit vorher vergleichen. Die Rückrechnung ist ein Test des Bias, nicht deiner Einstiege. Die stehen
          im Trade-Backtest.
        </p>
      </Card>
    </div>
  );
}
