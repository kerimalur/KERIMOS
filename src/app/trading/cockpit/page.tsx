import {
  tradingConfigured, fetchScreener, fetchWatchlist, pairTf,
  type ScreenerPair, type GvaTf, type WatchlistPair,
} from "@/lib/supabase/trading";
import { fetchSignale, tradingUserId, type Signal } from "@/lib/trading/journal";
import { JournalHinweis } from "@/components/journal-hinweis";
import { HitRaster, type Kachel, type Gruppe } from "@/components/trading/hit-raster";
import { Card, CardTitle, Stat, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Cockpit — eine Seite, ein Raster, sonst nichts.
 *
 * Vorher waren es fünf Reiter (Lebenszyklus, Radar, Heatmap, GVA-Board, News)
 * und vier Stufenlisten untereinander. Alle fünf zeigten dieselben 28 Paare in
 * fünf Anordnungen, und jede Anordnung wollte beim Öffnen gelesen werden.
 *
 * Übrig bleibt die Heatmap-Form, weil sie als einzige eine feste Position je
 * Paar hat: man erkennt am Muster, was los ist, ohne zu lesen. Die
 * Entscheidung „beobachten oder verwerfen" ist in das Popup gewandert, wo
 * neben dem Chart auch steht, was Ranking und Monty dazu sagen — vorher musste
 * man dafür zwei weitere Seiten öffnen und sich das Urteil selbst merken.
 */

/**
 * Die 28 Majors in Kerims Watchlist-Reihenfolge.
 *
 * Reihenfolge und Gruppierung sind aus seiner TradingView-Liste übernommen,
 * nicht alphabetisch sortiert und nicht nach Schönheit umgestellt. Der Grund
 * ist banal und wichtig: Er sucht ein Paar nicht, er weiss, wo es steht. Jede
 * Umsortierung macht diese Gewohnheit einmalig kaputt und spart nichts.
 *
 * Gruppiert wird nach der Basiswährung des Paarnamens, absteigend nach
 * Gruppengrösse — EUR sieben, GBP sechs, AUD fünf, NZD vier, USD drei, CAD
 * zwei, CHF eines. Die Treppe ist keine Design-Idee, sondern die Struktur der
 * Sache: jede Währung bildet mit den verbleibenden ein Paar weniger.
 */
const GRUPPEN: { titel: string; paare: string[] }[] = [
  { titel: "EUR", paare: ["EURAUD", "EURCAD", "EURGBP", "EURCHF", "EURNZD", "EURJPY", "EURUSD"] },
  { titel: "GBP", paare: ["GBPAUD", "GBPNZD", "GBPUSD", "GBPCAD", "GBPJPY", "GBPCHF"] },
  { titel: "AUD", paare: ["AUDCAD", "AUDJPY", "AUDNZD", "AUDUSD", "AUDCHF"] },
  { titel: "NZD", paare: ["NZDCAD", "NZDCHF", "NZDJPY", "NZDUSD"] },
  { titel: "USD", paare: ["USDCAD", "USDCHF", "USDJPY"] },
  { titel: "CAD", paare: ["CADCHF", "CADJPY"] },
  { titel: "CHF", paare: ["CHFJPY"] },
];

const sauber = (p: string) => p.replace(/[^A-Za-z]/g, "").toUpperCase();

/**
 * Der Zeitrahmen zu einem getroffenen Signal.
 *
 * Die `signals`-Tabelle speichert ihn nicht, und eine getroffene Linie ist im
 * Live-Screener verbraucht — sie steht dort nicht mehr. Hier wird deshalb nur
 * das Naheliegende versucht: passt das Level noch auf eine Linie desselben
 * Paares, gilt deren Zeitrahmen. Sonst bleibt die Kachel ohne Angabe, und das
 * Popup rekonstruiert ihn aus den Kerzen. Lieber nichts anzeigen als raten.
 */
function tfFuerSignal(s: Signal, p: ScreenerPair | undefined): GvaTf | null {
  if (!p) return null;
  const nah = (a: number | null) =>
    a !== null && Math.abs(a - s.lineLevel) < Math.max(1e-5, Math.abs(s.lineLevel) * 1e-4);
  if (s.lineType === "short" && nah(p.short)) return p.short_tf ?? null;
  if (s.lineType === "long" && nah(p.long)) return p.long_tf ?? null;
  return null;
}

export default async function CockpitSeite() {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const [screener, signale, aktive] = await Promise.all([
    fetchScreener(),
    fetchSignale(["new", "watchlist"]),
    fetchWatchlist(),
  ]);

  const pairs = screener?.data ?? [];
  const nachPaar = new Map(pairs.map((p) => [sauber(p.pair), p]));

  // Je Paar zählt das jüngste offene Signal. Mehrere gleichzeitig gibt es nach
  // dem Sticky-Modell des Screeners nicht; falls doch, ist das neueste gemeint
  // — fetchSignale liefert absteigend nach hit_at.
  const hitNachPaar = new Map<string, Signal>();
  for (const s of signale) {
    const k = sauber(s.pair);
    if (!hitNachPaar.has(k)) hitNachPaar.set(k, s);
  }

  /**
   * Steht diese Linie schon in den aktiven Trades?
   *
   * Verglichen wird über Paar und Level, also über dieselbe Kennung, unter der
   * `signalUebernehmen` die Zeile anlegt. Der Signal-Status taugt dafür nicht:
   * er stand bei Altbestand auf „watchlist", ohne dass je eine Zeile entstand.
   * Genau daran hing der tote Zustand, in dem sich ein Treffer weder ansehen
   * noch verwerfen liess.
   */
  const inListe = (paar: string, level: number): boolean =>
    aktive.some((w: WatchlistPair) =>
      sauber(w.pair) === paar
      && w.line_level !== null
      && Math.abs(w.line_level - level) < Math.max(1e-6, Math.abs(level) * 1e-5));

  const baueKachel = (paar: string): Kachel => {
    const p = nachPaar.get(paar);
    const s = hitNachPaar.get(paar);
    const seite = s ? s.lineType
      : p?.near === "LONG" ? "long" : p?.near === "SHORT" ? "short" : null;

    // Ohne Treffer ist die Linie die, auf die der Screener gerade zeigt —
    // `near` sagt, welche der beiden Seiten das ist.
    const linie = s ? s.lineLevel
      : p?.near === "LONG" ? p.long : p?.near === "SHORT" ? p.short : null;

    return {
      paar, seite, linie: linie ?? null,
      zeitrahmen: s ? tfFuerSignal(s, p) : (p ? pairTf(p) : null),
      distanz: s ? null : p?.distance ?? null,
      hit: s
        ? {
          signalId: s.id, level: s.lineLevel, formiert: s.lineFormedDate,
          inListe: inListe(paar, s.lineLevel), seite: s.lineType,
        }
        : null,
    };
  };

  const bekannt = new Set(GRUPPEN.flatMap((g) => g.paare));
  const uebrig = [...new Set([...nachPaar.keys(), ...hitNachPaar.keys()])]
    .filter((p) => !bekannt.has(p))
    .sort();

  const gruppen: Gruppe[] = [
    ...GRUPPEN.map((g) => ({ titel: g.titel, kacheln: g.paare.map(baueKachel) })),
    // Meldet der Screener irgendwann ein Paar ausserhalb der 28 Majors, soll
    // es sichtbar sein und nicht stillschweigend fehlen.
    ...(uebrig.length > 0
      ? [{ titel: "Weitere", kacheln: uebrig.map(baueKachel) }]
      : []),
  ];

  const alle = gruppen.flatMap((g) => g.kacheln);
  const offen = alle.filter((k) => k.hit && !k.hit.inListe).length;
  const beobachtet = alle.filter((k) => k.hit?.inListe).length;
  const mitLinie = alle.filter((k) => k.seite !== null && !k.hit).length;

  const stand = screener?.updated
    ? new Date(screener.updated * 1000).toLocaleTimeString("de-CH",
      { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Cockpit</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-muted">
          Alle 28 Paare in deiner Watchlist-Reihenfolge. Der gelbe Balken links
          heisst: getroffen und wartet auf dich. Gruppen lassen sich zuklappen.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card area={offen > 0 ? "trading" : undefined}>
          <Stat label="Wartet auf dich" value={offen}
            tone={offen > 0 ? "warn" : "neutral"}
            sub={offen > 0 ? "gelb markierte Zeilen" : "alles beantwortet"} />
        </Card>
        <Card>
          <Stat label="In aktiven Trades" value={beobachtet} sub="steht auf der Übersicht" />
        </Card>
        <Card>
          <Stat label="Linien in Reichweite" value={mitLinie} sub="mit Richtung, noch kein Treffer" />
        </Card>
      </div>

      <Card>
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Die 28 Paare</CardTitle>
          <span className="text-[11px] text-ink-faint">
            {stand ? `Screener-Stand ${stand} Uhr` : "Screener-Stand unbekannt"}
            {screener && !screener.live && " · Tagesschluss-Preise"}
          </span>
        </div>

        {!screener && signale.length === 0 ? (
          <Empty>
            Der Screener antwortet gerade nicht. Das Backend liegt auf Render
            und schläft nach längerer Pause ein — in einer Minute nochmal laden.
          </Empty>
        ) : (
          <HitRaster gruppen={gruppen} />
        )}
      </Card>

      <Card flat>
        <CardTitle>Legende</CardTitle>
        <div className="grid gap-x-6 gap-y-2.5 text-xs text-ink-muted sm:grid-cols-2">
          <span className="flex items-center gap-2">
            <span className="h-4 w-[3px] shrink-0 rounded-full bg-warn" />
            getroffen — Zeile anklicken und entscheiden
          </span>
          <span className="flex items-center gap-2">
            <span className="h-4 w-[3px] shrink-0 rounded-full bg-accent-deep" />
            schon in den aktiven Trades
          </span>
          <span className="flex items-center gap-2">
            <span className="shrink-0 text-good-bright">Long</span>
            <span className="shrink-0 text-bad-bright">Short</span>
            Richtung der Linie
          </span>
          <span>TF = Zeitrahmen der Linie (3D oder W)</span>
          <span>Linie = Kurs, auf dem sie liegt</span>
          <span>Abstand = Pips bis dorthin</span>
        </div>
      </Card>
    </div>
  );
}
