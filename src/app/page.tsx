import Link from "next/link";
import { Brett } from "@/components/start/brett";
import { Empfang } from "@/components/start/empfang";
import { fetchTrades } from "@/lib/trading/journal";
import { tradingConfigured, fetchTodayEvents, fetchWeekEvents, type EconEvent } from "@/lib/supabase/trading";
import { begruessung, type Lage } from "@/lib/start/begruessung";
import { spruchFuer } from "@/lib/start/sprueche";
import { fetchWeather, regenSatz } from "@/lib/weather";
import { ladeRoutinen } from "@/lib/routinen/laden";
import { heuteFaellig } from "@/lib/routinen/typen";
import { ladeWochenziele, aktuelleWoche } from "@/lib/wochenziele/laden";
import { WochenzieleKurz } from "@/components/wochenziele/kurz";
import { RoutinenHeute } from "@/components/routinen/heute";
import { heuteISO, heuteWochentag, addDays } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Die Startseite nach Design D „Fokus mit Brett“ (07.10.2026).
 *
 *   1. Empfang: die Collage als Hintergrund, davor der Tag und der eine
 *      Satz, der heute zählt (components/start/empfang.tsx).
 *   2. Das Brett: dieselbe Collage als elf Eingänge (components/start/brett.tsx,
 *      Felder in lib/start/kacheln.ts). Daneben Wochenziele und die Routinen
 *      von heute zum Abhaken — wie vorher.
 *   3. Diese Woche: die wichtigen Termine aus dem Wirtschaftskalender.
 *
 * Ersetzt den Scroll-Empfang vom 26.09.2026, der die Seite beim Öffnen
 * festhielt. Die Daten sind dieselben; nur die Bühne ist neu.
 */
const ZEIT = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
const TAG = new Intl.DateTimeFormat("de-CH", { weekday: "short", timeZone: "Europe/Zurich" });
const TAG_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" });

export default async function Start() {
  const heute = heuteISO();
  const jetzt = new Date();
  const mitTrading = tradingConfigured();
  /*
   * Nur die letzten 90 Tage Trades: der Empfang braucht zwei Zahlen, nicht
   * die ganze Historie — die Startseite ist die eine Seite, die immer schnell
   * sein muss.
   */
  const [trades, wetter, routinen, wochenziele, termineHeute, termineWoche] = await Promise.all([
    mitTrading ? fetchTrades({ von: addDays(heute, -90) }) : Promise.resolve([]),
    fetchWeather(),
    ladeRoutinen().catch(() => []),
    ladeWochenziele(aktuelleWoche()).catch(() => []),
    mitTrading ? fetchTodayEvents().catch(() => [] as EconEvent[]) : Promise.resolve([] as EconEvent[]),
    mitTrading ? fetchWeekEvents().catch(() => [] as EconEvent[]) : Promise.resolve([] as EconEvent[]),
  ]);
  const wochentag = heuteWochentag();
  const spruch = spruchFuer(heute);

  const faellig = heuteFaellig(routinen, wochentag, heute);
  const routinenGesamt = faellig.reduce((s, g) => s + g.handlungen.length, 0);
  const routinenErledigt = faellig.reduce((s, g) => s + g.handlungen.filter((h) => h.erledigt.includes(heute)).length, 0);

  const lage: Lage = {
    stunde: Number(new Intl.DateTimeFormat("de-CH", { hour: "numeric", hour12: false, timeZone: "Europe/Zurich" }).format(jetzt)),
    wochentag,
    hits: 0,
    laufende: trades.filter((t) => t.status === "open").length,
    // Abgeschlossen, aber ohne Ausgang: die nach dem Schliessen vergessenen.
    unvollstaendig: trades.filter((t) => t.status !== "open" && !t.result).length,
  };
  const ansage = begruessung(lage);

  // Der nächste Termin von heute; ist alles vorbei, der letzte.
  const kommend = termineHeute.filter((e) => Date.parse(e.event_time) >= jetzt.getTime() - 30 * 60_000);
  const t = kommend[0] ?? termineHeute[termineHeute.length - 1] ?? null;

  return (
    <>
      <Empfang
        wochentag={jetzt.toLocaleDateString("de-CH", { weekday: "long", timeZone: "Europe/Zurich" })}
        datum={jetzt.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" })}
        gruss={ansage.gruss}
        satz={ansage.satz}
        ziel={ansage.ziel}
        zielText={ansage.zielText}
        spruch={spruch}
        wetter={wetter ? { temperatur: `${wetter.jetzt}°`, text: `${wetter.text}, ${wetter.min} bis ${wetter.max}°`, regen: regenSatz(wetter) } : null}
        termin={t ? { zeit: ZEIT.format(new Date(t.event_time)), titel: t.title, waehrung: t.currency, vorbei: kommend.length === 0 } : null}
        weitereTermine={Math.max(0, (kommend.length || (t ? 1 : 0)) - 1)}
        routinen={{ erledigt: routinenErledigt, gesamt: routinenGesamt }}
        tradesMonat={trades.filter((x) => x.date >= `${heute.slice(0, 7)}-01`).length}
        laufende={lage.laufende}
        ziele={{ fertig: wochenziele.filter((z) => z.status === "fertig").length, gesamt: wochenziele.length }}
      />

      <section className="mt-14">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[30px] font-bold tracking-tight">Dein Brett</h2>
              <span className="text-sm text-ink-muted">Jedes Bild ist ein Eingang</span>
            </div>
            <Brett />
          </div>
          <aside className="flex flex-col gap-8 xl:w-[330px] xl:shrink-0">
            <WochenzieleKurz ziele={wochenziele} gross />
            <div>
              <Link href="/routinen"
                className="mb-3 flex items-baseline justify-between border-b border-line pb-2.5 hover:text-ink-soft">
                <span className="font-display text-base font-bold text-ink">Routinen heute</span>
                <span className="text-xs text-ink-muted">alle →</span>
              </Link>
              {faellig.length > 0
                ? <RoutinenHeute ziele={routinen} wochentag={wochentag} heute={heute} />
                : <p className="text-sm text-ink-faint">Heute steht nichts an.</p>}
            </div>
          </aside>
        </div>
      </section>

      {termineWoche.length > 0 && (
        <section className="mt-10">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-bold tracking-tight text-ink-soft">Diese Woche</h2>
            <Link href="/trading/fundamentals/kalender" className="text-xs text-ink-muted hover:text-ink-soft">
              nur hohe Wirkung, Zeit Zürich →
            </Link>
          </div>
          <ul>
            {termineWoche.map((e, i) => {
              const d = new Date(e.event_time);
              const istHeute = TAG_ISO.format(d) === heute;
              const vorbei = d.getTime() < jetzt.getTime();
              return (
                <li key={`${e.event_time}-${e.title}-${i}`}
                  className="grid grid-cols-1 gap-0.5 border-b border-line/60 py-1.5 text-sm sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-3">
                  <span className={istHeute ? "text-xs font-semibold text-accent" : "text-xs text-ink-muted"}>
                    {istHeute ? "Heute" : TAG.format(d)}, {ZEIT.format(d)}
                  </span>
                  <span className={vorbei ? "text-ink-muted" : ""}>
                    <span className="mr-2 text-xs font-semibold text-accent">{e.currency}</span>
                    <span className="text-sm">{e.title}</span>
                    {(e.forecast || e.previous || e.actual) && (
                      <span className="ml-2 text-xs text-ink-muted">
                        {e.actual ? `Ist ${e.actual}, ` : ""}
                        {e.forecast ? `Prognose ${e.forecast}` : ""}
                        {e.forecast && e.previous ? ", " : ""}
                        {e.previous ? `vorher ${e.previous}` : ""}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
