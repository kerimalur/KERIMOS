import Link from "next/link";
import { Logo } from "@/components/logo";
import { OffeneHits } from "@/components/trading/offene-hits";
import { Brett } from "@/components/start/brett";
import { Willkommen } from "@/components/start/willkommen";
import { ladeOffeneHits } from "@/lib/trading/offene-signale";
import { fetchTrades } from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { begruessung, type Lage } from "@/lib/start/begruessung";
import { spruchFuer } from "@/lib/start/sprueche";
import { fetchWeather, regenSatz } from "@/lib/weather";
import { WeatherIcon } from "@/components/weather-icon";
import { ladeRoutinen } from "@/lib/routinen/laden";
import { heuteFaellig } from "@/lib/routinen/typen";
import { RoutinenHeute } from "@/components/routinen/heute";
import { ladeWochenziele, aktuelleWoche } from "@/lib/wochenziele/laden";
import { WochenzieleKurz } from "@/components/wochenziele/kurz";
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
 * Nachtrag 26.09.2026 nachmittags, auf Kerims Wunsch: im Empfang und
 * zwischen Titel und Kacheln stehen jetzt auch das Wetter samt Regen, der
 * Spruch des Tages, die heutigen Routinen und die Wochenziele. Keine
 * Kennzahlen, keine Liste aktiver Trades — daran ist die Seite im September
 * schon einmal erstickt.
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
  const routinenHeute = heuteFaellig(routinen, wochentag).map((g) => ({
    ziel: g.ziel.titel,
    handlungen: g.handlungen.map((h) => ({ titel: h.titel, uhrzeit: h.uhrzeit })),
  }));

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

            {wetter && (
              <div className="flex items-center gap-3 rounded-xl bg-sand/70 px-3 py-2">
                <WeatherIcon name={wetter.icon} className="h-8 w-8 shrink-0" />
                <div className="min-w-0">
                  <p className="tabular text-sm text-ink">
                    {wetter.jetzt}°
                    <span className="ml-1.5 text-xs text-ink-muted">
                      {wetter.min}–{wetter.max}° · {wetter.text}
                    </span>
                  </p>
                  <p className={wetter.regenChance >= 50 ? "text-xs text-sky-300" : "text-xs text-ink-muted"}>
                    {regenSatz(wetter)}
                  </p>
                </div>
              </div>
            )}

            {spruch && (
              <p className="border-l-2 border-accent/60 pl-3 text-sm italic leading-relaxed text-ink-soft">
                „{spruch}"
              </p>
            )}

            {routinenHeute.length > 0 && (
              <div>
                <Link href="/routinen"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em]
                             text-ink-muted hover:text-ink-soft">
                  Heute für deine Ziele →
                </Link>
                <RoutinenHeute ziele={routinen} wochentag={wochentag} />
              </div>
            )}

            <WochenzieleKurz ziele={wochenziele} />

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
