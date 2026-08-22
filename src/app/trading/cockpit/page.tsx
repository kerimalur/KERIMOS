import Link from "next/link";
import {
  fetchSignale, fetchOutlooks, fetchTrades, tradingUserId,
  type Signal, type Outlook,
} from "@/lib/trading/journal";
import {
  tradingConfigured, fetchScreener, fetchRanking, checkFundamental,
  fetchWeekEvents, pairTf, tfLabel,
  type ScreenerPair, type RankingCurrency, type EconEvent,
} from "@/lib/supabase/trading";
import { signalStatusSetzen, signalUebernehmen } from "@/lib/journal-actions";
import { JournalHinweis } from "@/components/journal-hinweis";
import { Card, CardTitle, Stat, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Cockpit — der Lebenszyklus eines Setups auf einer Seite.
 *
 * Umgezogen aus dem GVA-Screener (`/cockpit`), siehe TRADING-UMBAU.md.
 *
 * Ein GVA-Setup durchläuft immer dieselben vier Stufen, und jede Stufe stellt
 * genau eine Frage:
 *
 *   1. **Getroffen** — der Screener hat eine Linie berührt gesehen.
 *      Frage: Ist das für mich relevant?
 *   2. **Beobachtet** — ich habe „ja" gesagt, es gibt eine These.
 *      Frage: Sind die Bedingungen erfüllt?
 *   3. **Nah dran** — der Preis läuft auf eine Linie zu, aber noch kein Hit.
 *      Frage: Sollte ich das vorbereiten?
 *   4. **Gehandelt** — daraus wurde ein Trade.
 *      Frage: keine mehr, das erledigt das Journal.
 *
 * Der Wert der Seite liegt darin, dass die Frage jeweils **nur einmal**
 * gestellt wird. Ein Hit, den man einmal verworfen hat, taucht nicht wieder
 * auf; eine These, die man angenommen hat, wandert eine Spur weiter. Ohne das
 * beantwortet man jeden Morgen dieselben 28 Fragen neu.
 */

function ScreenerInfo({ pair, pairs }: { pair: string; pairs: ScreenerPair[] }) {
  const p = pairs.find(
    (x) => x.pair.replace(/[^A-Za-z]/g, "").toUpperCase() === pair.replace(/[^A-Za-z]/g, "").toUpperCase(),
  );
  if (!p) return null;
  const tf = pairTf(p);
  return (
    <>
      {tf && <Badge tone={tf === "W" ? "warn" : "neutral"}>{tfLabel(tf)}</Badge>}
      {p.status === "HIT" && <Badge tone="good">live getroffen</Badge>}
      {p.status === "PREPARE" && p.distance !== null && (
        <span className="tabular text-xs text-ink-muted">{Math.round(p.distance)} Pips</span>
      )}
      {p.stale && <Badge tone="neutral">nicht live</Badge>}
    </>
  );
}

function FundamentalBadge({
  pair, seite, ranking,
}: { pair: string; seite: "LONG" | "SHORT"; ranking: RankingCurrency[] }) {
  const f = checkFundamental(pair, seite, ranking);
  if (f.urteil === "unbekannt") return null;
  return (
    <Badge
      tone={f.urteil === "bestaetigt" ? "good" : f.urteil === "dagegen" ? "bad" : "neutral"}
      title={f.grund || undefined}>
      {f.urteil === "bestaetigt" ? "fundamental dafür"
        : f.urteil === "dagegen" ? "fundamental dagegen" : "fundamental neutral"}
    </Badge>
  );
}

/** Ein frischer GVA-Hit — hier fällt die Entscheidung „relevant oder nicht". */
function HitZeile({
  s, pairs, ranking,
}: { s: Signal; pairs: ScreenerPair[]; ranking: RankingCurrency[] }) {
  const seite = s.lineType === "long" ? "LONG" : "SHORT";
  const zeit = new Date(s.hitAt).toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Zurich",
  });

  return (
    <div className="border-t border-line/70 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="w-[76px] shrink-0 font-display text-sm font-bold text-ink">
          {s.pair}
        </span>
        <Badge tone={s.lineType === "long" ? "good" : "bad"}>
          {s.lineType === "long" ? "Long" : "Short"}
        </Badge>
        <span className="tabular text-xs text-ink-muted">{s.lineLevel}</span>
        <ScreenerInfo pair={s.pair} pairs={pairs} />
        <FundamentalBadge pair={s.pair} seite={seite} ranking={ranking} />
        <span className="ml-auto text-xs text-ink-faint">{zeit}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[76px]">
        <form action={signalUebernehmen}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="pair" value={s.pair} />
          <input type="hidden" name="lineType" value={s.lineType} />
          <input type="hidden" name="lineLevel" value={String(s.lineLevel)} />
          <button type="submit"
            className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-ink-on
                       shadow-glow-accent transition active:scale-95">
            → These anlegen
          </button>
        </form>
        <form action={signalStatusSetzen}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="status" value="dismissed" />
          <button type="submit"
            className="rounded-lg bg-sand px-2.5 py-1 text-xs text-ink-muted transition hover:text-ink-soft">
            verwerfen
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function CockpitSeite() {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const [neueSignale, outlooks, screener, ranking, events, trades] = await Promise.all([
    fetchSignale(["new"]),
    fetchOutlooks(),
    fetchScreener(),
    fetchRanking(),
    fetchWeekEvents(),
    fetchTrades({ sessionType: "live" }),
  ]);

  const pairs = screener?.data ?? [];

  const beobachtet = outlooks.filter(
    (o) => (o.status === "observation" || o.status === "active") && !o.executedTradeId,
  );

  // "Nah dran" zeigt nur, was noch keine These hat — sonst stünde dasselbe
  // Paar in zwei Spuren und man müsste jedes Mal überlegen, welche gilt.
  const mitThese = new Set(beobachtet.map((o) => o.symbol.replace(/[^A-Za-z]/g, "").toUpperCase()));
  const nahDran = pairs
    .filter((p) => p.status === "PREPARE")
    .filter((p) => !mitThese.has(p.pair.replace(/[^A-Za-z]/g, "").toUpperCase()))
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));

  const heuteISO = new Date().toISOString().slice(0, 10);
  const heutigeEvents = events.filter((e) => e.event_time.slice(0, 10) === heuteISO);
  const gehandeltHeute = trades.filter((t) => t.date === heuteISO);

  const aktualisiert = screener?.updated
    ? new Date(screener.updated * 1000).toLocaleTimeString("de-CH",
        { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Cockpit</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Vom Hit zur These zum Trade. Jede Frage wird einmal gestellt —
            verworfen ist verworfen.
            {aktualisiert && ` Screener-Stand ${aktualisiert} Uhr.`}
          </p>
        </div>
        <Link href="/trading" className="text-xs text-accent-soft transition hover:underline">
          ← Trading-Übersicht
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card area={neueSignale.length > 0 ? "trading" : undefined}>
          <Stat label="Neue Hits" value={neueSignale.length}
            tone={neueSignale.length > 0 ? "good" : "neutral"}
            sub="warten auf Entscheidung" />
        </Card>
        <Card>
          <Stat label="Beobachtet" value={beobachtet.length}
            sub="These steht, Einstieg offen" />
        </Card>
        <Card>
          <Stat label="Nah dran" value={nahDran.length}
            tone={nahDran.length > 0 ? "warn" : "neutral"}
            sub="≤ 100 Pips, noch kein Hit" />
        </Card>
        <Card>
          <Stat label="Heute gehandelt" value={gehandeltHeute.length}
            sub="Live-Trades von heute" />
        </Card>
      </div>

      {heutigeEvents.length > 0 && (
        <Card area="accent">
          <CardTitle>High-Impact-News heute</CardTitle>
          <ul className="space-y-1">
            {heutigeEvents.map((e: EconEvent, i) => (
              <li key={i} className="text-sm text-ink-soft">
                <span className="tabular font-medium">
                  {new Date(e.event_time).toLocaleTimeString("de-CH",
                    { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })}
                </span>
                {e.currency && <span className="ml-2 font-medium">{e.currency}</span>}
                <span className="ml-2">{e.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>1 · Getroffen — entscheiden</CardTitle>
        {neueSignale.length === 0 ? (
          <Empty>
            Kein offener Hit. Entweder hat der Screener nichts gesehen, oder du
            hast schon alles beantwortet.
          </Empty>
        ) : (
          <div>
            {neueSignale.map((s) => (
              <HitZeile key={s.id} s={s} pairs={pairs} ranking={ranking} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">2 · Beobachtet — auf den Einstieg warten</CardTitle>
          <Link href="/trading"
            className="text-xs text-accent-soft transition hover:underline">
            Beobachtung →
          </Link>
        </div>
        {beobachtet.length === 0 ? (
          <Empty>Keine offene These.</Empty>
        ) : (
          <div>
            {beobachtet.map((o: Outlook) => (
              <div key={o.id}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-line/70 py-3 first:border-t-0">
                <span className="w-[76px] shrink-0 font-display text-sm font-bold text-ink">
                  {o.symbol}
                </span>
                <Badge tone={o.direction === "long" ? "good" : "bad"}>
                  {o.direction === "long" ? "Long" : "Short"}
                </Badge>
                {o.status === "active" && <Badge tone="accent">aktiv</Badge>}
                {o.source === "gva" && <Badge tone="neutral">aus Hit</Badge>}
                <ScreenerInfo pair={o.symbol} pairs={pairs} />
                <FundamentalBadge pair={o.symbol}
                  seite={o.direction === "long" ? "LONG" : "SHORT"} ranking={ranking} />
                <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                  {o.thesis || "ohne Notiz"}
                </span>
                {o.targetEntry !== null && (
                  <span className="tabular text-xs text-ink-soft">@ {o.targetEntry}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>3 · Nah dran — vorbereiten</CardTitle>
        {!screener ? (
          <Empty>
            Der Screener antwortet gerade nicht. Das Backend liegt auf Render und
            schläft nach längerer Pause ein.
          </Empty>
        ) : nahDran.length === 0 ? (
          <Empty>Kein Paar innerhalb von 100 Pips zu einer Linie.</Empty>
        ) : (
          <div>
            {nahDran.map((p) => (
              <div key={p.pair}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-line/70 py-3 first:border-t-0">
                <span className="w-[76px] shrink-0 font-display text-sm font-bold text-ink">
                  {p.pair}
                </span>
                {p.near && (
                  <Badge tone={p.near === "LONG" ? "good" : "bad"}>{p.near}</Badge>
                )}
                <ScreenerInfo pair={p.pair} pairs={pairs} />
                {p.near && (
                  <FundamentalBadge pair={p.pair} seite={p.near} ranking={ranking} />
                )}
                <span className="tabular ml-auto text-xs text-ink-soft">
                  {p.price !== null
                    ? p.price.toFixed(p.pair.toUpperCase().includes("JPY") ? 3 : 5)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card flat>
        <CardTitle>Wie das gemeint ist</CardTitle>
        <div className="space-y-2 text-sm text-ink-muted">
          <p>
            <strong className="text-ink-soft">These anlegen</strong> setzt den Hit
            auf „beobachtet" und legt einen Outlook an. Von da an gehört das Setup
            dir, nicht mehr dem Screener.
          </p>
          <p>
            <strong className="text-ink-soft">Verworfen</strong> heisst endgültig.
            Der Hit taucht nicht wieder auf — genau darin liegt der Sinn: Eine
            Entscheidung, die man morgen wieder trifft, ist keine.
          </p>
          <p className="text-ink-faint">
            „Fundamental dagegen" ist kein Verbot. Es heisst nur, dass die
            Wochenlage in die andere Richtung zeigt — wer trotzdem einsteigt,
            sollte einen Grund haben und ihn in die These schreiben.
          </p>
        </div>
      </Card>
    </div>
  );
}
