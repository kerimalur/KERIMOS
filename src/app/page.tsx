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

      {/*
        Volle Fensterbreite, nicht die Textbreite des Layouts.
        `mx-[calc(50%-50vw)]` bricht aus dem max-w-6xl der Hülle aus — die
        Collage ist ein Bild und kein Fliesstext, und in einer Spalte von
        1150 px stand sie mit 400 px Leere links und rechts da.
      */}
      <div className="mx-[calc(50%-50vw)] w-screen px-3 sm:px-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          {/*
            Der Randstreifen. Auf breiten Bildschirmen bleibt neben einem
            5:4-Brett zwangsläufig Platz — 5:4 auf 16:9 geht nicht auf. Der
            Platz trägt jetzt den Gruss und die offenen Hits, statt leer zu
            sein. Darunter (schmaler als xl) steht beides wieder oben.
          */}
          <aside className="space-y-4 xl:w-[320px] xl:shrink-0">
            <div className="flex items-start gap-3">
              <Logo inverted className="mt-0.5 h-10 w-10 shrink-0 rounded-2xl" />
              <div className="min-w-0">
                <p className="font-display text-lg font-bold leading-tight text-ink">
                  {ansage.gruss}
                </p>
                <p className="text-xs text-ink-faint">{datum}</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-ink-muted">
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

            <OffeneHits />
          </aside>

          <div className="min-w-0 flex-1">
            <Brett />
          </div>
        </div>
      </div>
    </>
  );
}
