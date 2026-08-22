import {
  tradingConfigured, fetchScreener, pairTf,
  type ScreenerPair, type GvaTf,
} from "@/lib/supabase/trading";
import { fetchSignale, tradingUserId, type Signal } from "@/lib/trading/journal";
import { PAARE } from "@/lib/confluence/faktoren";
import { JournalHinweis } from "@/components/journal-hinweis";
import { HitRaster, type Kachel } from "@/components/trading/hit-raster";
import { Card, CardTitle, Empty } from "@/components/ui";

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

  const [screener, signale] = await Promise.all([
    fetchScreener(),
    fetchSignale(["new", "watchlist"]),
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

  // Feste Reihenfolge: die 28 Standardpaare, danach alles, was der Screener
  // sonst noch meldet. Eine Kachel darf ihren Platz nicht wechseln, sonst ist
  // das Raster kein Raster mehr, sondern eine Liste mit Lücken.
  const namen = [
    ...PAARE,
    ...[...nachPaar.keys()].filter((p) => !PAARE.includes(p as (typeof PAARE)[number])),
  ];

  const kacheln: Kachel[] = namen.map((paar) => {
    const p = nachPaar.get(paar);
    const s = hitNachPaar.get(paar);
    return {
      paar,
      seite: s ? s.lineType : p?.near === "LONG" ? "long" : p?.near === "SHORT" ? "short" : null,
      zeitrahmen: s ? tfFuerSignal(s, p) : (p ? pairTf(p) : null),
      hit: s
        ? {
          signalId: s.id, level: s.lineLevel, formiert: s.lineFormedDate,
          status: s.status, seite: s.lineType,
        }
        : null,
    };
  });

  const offen = kacheln.filter((k) => k.hit?.status === "new").length;
  const beobachtet = kacheln.filter((k) => k.hit?.status === "watchlist").length;

  const stand = screener?.updated
    ? new Date(screener.updated * 1000).toLocaleTimeString("de-CH",
      { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="font-display text-xl font-bold text-ink">Cockpit</h1>
        <span className="text-xs text-ink-faint">
          {offen > 0 ? `${offen} wartet auf Entscheidung` : "nichts offen"}
          {beobachtet > 0 && ` · ${beobachtet} in Beobachtung`}
          {stand && ` · Stand ${stand}`}
          {screener && !screener.live && " · Tagesschluss"}
        </span>
      </div>

      <Card>
        {!screener && signale.length === 0 ? (
          <Empty>
            Der Screener antwortet gerade nicht. Das Backend liegt auf Render
            und schläft nach längerer Pause ein — in einer Minute nochmal laden.
          </Empty>
        ) : (
          <HitRaster kacheln={kacheln} />
        )}
      </Card>

      <Card flat>
        <CardTitle>Legende</CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-good-tint" /> Long-Linie
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-bad-tint" /> Short-Linie
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-sand/40" /> keine Linie in Reichweite
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded ring-2 ring-warn" /> getroffen — draufdrücken
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded ring-1 ring-accent-deep" /> schon in Beobachtung
          </span>
          <span>3D / W = Zeitrahmen der Linie</span>
        </div>
      </Card>
    </div>
  );
}
