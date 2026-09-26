import Link from "next/link";
import { Brett } from "@/components/start/brett";
import { Willkommen } from "@/components/start/willkommen";
import { ladeOffeneHits } from "@/lib/trading/offene-signale";
import { fetchTrades } from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { begruessung, type Lage } from "@/lib/start/begruessung";
import { spruchFuer } from "@/lib/start/sprueche";
import { fetchWeather, regenSatz } from "@/lib/weather";
import { ladeRoutinen } from "@/lib/routinen/laden";
import { heuteFaellig, zusatz } from "@/lib/routinen/typen";
import { ladeWochenziele, aktuelleWoche } from "@/lib/wochenziele/laden";
import { WochenzieleKurz } from "@/components/wochenziele/kurz";
import { RoutinenHeute } from "@/components/routinen/heute";
import { heuteISO, heuteWochentag, addDays } from "@/lib/time";

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
 * Nachtrag 26.09.2026 nachmittags, auf Kerims Wunsch: der Empfang zeigt
 * zusätzlich Wetter samt Regen, den Spruch des Tages und die heutigen
 * Routinen. Neben dem Brett stehen NUR die Wochenziele — Gruss, Wetter,
 * Spruch, Routinen und offene Hits gibt es ausschliesslich im Empfang
 * (bzw. die Hits auf der GVA-Übersicht). Später am selben Abend: links
 * oben die Wochenziele, links unten die Routinen von heute zum Abhaken.
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
  const [hits, trades, wetter, routinen, wochenziele] = await Promise.all([
    ladeOffeneHits(),
    tradingConfigured() ? fetchTrades({ von: addDays(heute, -90) }) : Promise.resolve([]),
    fetchWeather(),
    ladeRoutinen().catch(() => []),
    ladeWochenziele(aktuelleWoche()).catch(() => []),
  ]);
  const wochentag = heuteWochentag();
  const spruch = spruchFuer(heute);
  // Im Empfang nur, was heute noch zu tun ist — Abgehaktes fällt raus.
  const routinenHeute = heuteFaellig(routinen, wochentag, heute)
    .map((g) => ({
      ziel: g.ziel.titel,
      handlungen: g.handlungen
        .filter((h) => !h.erledigt.includes(heute))
        .map((h) => ({ titel: h.titel, uhrzeit: h.uhrzeit, zusatz: zusatz(h) })),
    }))
    .filter((g) => g.handlungen.length > 0);

  const lage: Lage = {
    stunde: jetzt.getHours(),
    wochentag,
    hits: hits.length,
    laufende: trades.filter((t) => t.status === "open").length,
    // Abgeschlossen, aber ohne Ausgang: das sind die, die man nach dem
    // Schliessen vergessen hat nachzutragen.
    unvollstaendig: trades.filter((t) => t.status !== "open" && !t.result).length,
  };

  const ansage = begruessung(lage);
  const datum = jetzt.toLocaleDateString("de-CH", {
    weekday: "long", day: "2-digit", month: "long", timeZone: "Europe/Zurich",
  });

  return (
    <>
      <Willkommen gruss={ansage.gruss} satz={ansage.satz}
        ziel={ansage.ziel} zielText={ansage.zielText} datum={datum}
        wetter={wetter ? {
          temperatur: `${wetter.jetzt}°`,
          text: `${wetter.text} · ${wetter.min}–${wetter.max}°`,
          regen: regenSatz(wetter),
          nass: wetter.nass || wetter.regenChance >= 50,
        } : null}
        spruch={spruch}
        routinen={routinenHeute} />

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
            Platz trägt nur die Wochenziele (Kerim, 26.09.2026: alles andere —
            Gruss, Wetter, Spruch, Routinen — steht ausschliesslich im
            Scroll-Empfang). Schmaler als xl stehen sie über dem Brett.
          */}
          {/* Links neben dem Brett: oben die Wochenziele, unten die Routinen
              von heute — beide als eigene Karte (Kerim, 26.09.2026). Die
              Spalte ist so hoch wie das Brett; die Karten sitzen an ihren
              Enden. Schmaler als xl stehen beide über dem Brett. */}
          <aside className="flex flex-col gap-4 xl:w-[340px] xl:shrink-0 xl:self-stretch xl:justify-between xl:pl-4">
            <div className="rounded-2xl border border-line-strong/80 bg-card/85 p-5 shadow-card backdrop-blur-sm">
              <WochenzieleKurz ziele={wochenziele} gross />
            </div>
            <div className="rounded-2xl border border-line-strong/80 bg-card/85 p-5 shadow-card backdrop-blur-sm">
              <Link href="/routinen"
                className="mb-3 flex items-baseline justify-between border-b border-line/70 pb-2.5 hover:text-ink-soft">
                <span className="font-display text-base font-bold text-ink">Routinen heute</span>
                <span className="text-xs text-ink-muted">alle →</span>
              </Link>
              {heuteFaellig(routinen, wochentag, heute).length > 0
                ? <RoutinenHeute ziele={routinen} wochentag={wochentag} heute={heute} />
                : <p className="text-sm text-ink-faint">Heute steht nichts an.</p>}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <Brett />
          </div>
        </div>
      </div>
    </>
  );
}
