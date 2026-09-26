import Link from "next/link";
import { Logo } from "@/components/logo";
import { OffeneHits } from "@/components/trading/offene-hits";
import { Brett } from "@/components/start/brett";
import { Willkommen } from "@/components/start/willkommen";
import { ladeOffeneHits } from "@/lib/trading/offene-signale";
import { fetchTrades } from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { begruessung, type Lage } from "@/lib/start/begruessung";
import { heuteISO, addDays } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Die Startseite ist das Bild.
 *
 * Kerims Entwurf vom 26.09.2026: eine Collage, in der jeder Ausschnitt ein
 * Knopf ist — manche führen in einen Bereich von KerimOS, manche nach
 * draussen (Google Kalender, TradingView). Davor liegt beim Öffnen ein
 * Empfang, den man wegscrollt: er grüsst und sagt EINE Sache, die heute
 * zählt. Danach steht das Brett da.
 *
 * Was hier bewusst NICHT steht: Kennzahlen, Wetter, Tagessatz, eine Liste
 * aktiver Trades. Genau daran ist die Seite im September schon einmal
 * erstickt. Die einzige Ausnahme ist die Hit-Karte unter dem Brett — sie
 * hat Knöpfe, die eine Entscheidung abnehmen, und ist damit Arbeit und
 * nicht Anzeige.
 *
 * Wer welche Kachel ist, steht in `lib/start/kacheln.ts` — eine Zeile pro
 * Feld. Umhängen heisst dort eine Zeile ändern, nicht hier etwas umbauen.
 */
export default async function Start() {
  const heute = heuteISO();
  const jetzt = new Date();

  /*
   * Nur die letzten 90 Tage. Der Empfang braucht zwei Zahlen, nicht die
   * ganze Historie — und die Startseite ist die eine Seite, die immer
   * schnell sein muss.
   */
  const [hits, trades] = await Promise.all([
    ladeOffeneHits(),
    tradingConfigured() ? fetchTrades({ von: addDays(heute, -90) }) : Promise.resolve([]),
  ]);

  const lage: Lage = {
    stunde: jetzt.getHours(),
    wochentag: jetzt.getDay(),
    hits: hits.length,
    laufende: trades.filter((t) => t.status === "open").length,
    // Abgeschlossen, aber ohne Ausgang: das sind die, die man nach dem
    // Schliessen vergessen hat nachzutragen.
    unvollstaendig: trades.filter((t) => t.status !== "open" && !t.result).length,
  };

  const ansage = begruessung(lage);
  const datum = jetzt.toLocaleDateString("de-CH", {
    weekday: "long", day: "2-digit", month: "long",
  });

  return (
    <>
      <Willkommen gruss={ansage.gruss} satz={ansage.satz}
        ziel={ansage.ziel} zielText={ansage.zielText} datum={datum} />

      <div className="py-2">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Logo inverted className="h-10 w-10 rounded-2xl" />
          <div>
            <p className="font-display text-lg font-bold leading-tight text-ink">
              {ansage.gruss}
            </p>
            <p className="text-sm text-ink-muted">
              {ansage.satz}
              {ansage.ziel && ansage.zielText && (
                <>
                  {" "}
                  <Link href={ansage.ziel} className="text-accent-soft hover:underline">
                    {ansage.zielText} →
                  </Link>
                </>
              )}
            </p>
          </div>
          <span className="ml-auto hidden text-xs text-ink-faint sm:block">{datum}</span>
        </div>

        <Brett />

        <div className="mt-5">
          <OffeneHits />
        </div>
      </div>
    </>
  );
}
