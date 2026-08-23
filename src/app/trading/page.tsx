import Link from "next/link";
import {
  fetchScreener, fetchWatchlist, fetchKategorien,
  type ScreenerPair, type WatchlistPair,
} from "@/lib/supabase/trading";
import {
  gruppiereNachKategorie, farbPunkt, type Kategorie,
} from "@/lib/trading/kategorien";
import { KategorieWahl } from "@/components/trading/kategorie-wahl";
import { GruppenBox } from "@/components/trading/gruppen-box";
import { addWatchlistPair, removeWatchlistPair } from "@/lib/trading-actions";
import { GVA_NOTIZ } from "@/lib/trading/herkunft";
import { Card, CardTitle, Badge, Empty, Input, Select, Label, Button } from "@/components/ui";
import { KopierFeld } from "@/components/alarm/kopierfeld";
import { WATCHLIST_MIGRATION_SQL } from "@/lib/trading/watchlist-migration";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Übersicht — **eine** Liste: die aktiven Trades.
 *
 * Vorher standen hier zwei Listen nebeneinander: „Meine GVA-Linien" aus
 * `trading_watchlist` und darunter eine Karte „Beobachtung", die aus zwei
 * ganz anderen Quellen kam (im Screener auf `pending` markierte Paare und
 * Watchlist-Zeilen OHNE Level). Dazu legte das Cockpit beim Übernehmen eines
 * Hits einen `outlooks`-Eintrag an — eine dritte Tabelle, die keine Seite
 * anzeigte. Ergebnis: ein übernommener Hit war nirgends zu sehen, nicht zu
 * löschen und nicht weiterzuverarbeiten, während das Cockpit „steht schon in
 * Beobachtung" meldete.
 *
 * Jetzt gilt: Was Kerim aktiv verfolgt, steht in `trading_watchlist` und
 * nirgends sonst. Zwei Wege führen hinein — das Formular unten und der Knopf
 * „In aktive Trades" im Cockpit — und beide landen in derselben Zeile, die man
 * an einer Stelle ändern und löschen kann. Kategorien kommen später, wenn sie
 * gebraucht werden; erst muss die Liste stimmen.
 */

/** Live-Preis eines Paares aus dem Screener, falls vorhanden. */
function livePreis(pair: string, pairs: ScreenerPair[]): ScreenerPair | null {
  return pairs.find((x) => x.pair.toUpperCase() === pair.toUpperCase()) ?? null;
}

/** JPY-Paare rechnen mit 0.01 Pip, alles andere mit 0.0001. */
function pipsZu(pair: string, a: number, b: number): number {
  return Math.abs(a - b) / (pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001);
}

export default async function TradingPage() {
  const [screener, watchlist, kategorien] = await Promise.all([
    fetchScreener(), fetchWatchlist(), fetchKategorien(),
  ]);
  const pairs = (screener?.data ?? []) as ScreenerPair[];
  const gruppen = gruppiereNachKategorie(watchlist, kategorien);

  const erreicht = watchlist.filter((w) => {
    const live = livePreis(w.pair, pairs);
    if (!live?.price || w.line_level === null) return false;
    return pipsZu(w.pair, live.price, w.line_level) < 1;
  }).length;

  const nah = watchlist.filter((w) => {
    const live = livePreis(w.pair, pairs);
    if (!live?.price || w.line_level === null || w.alarm_pips === null) return false;
    const d = pipsZu(w.pair, live.price, w.line_level);
    return d >= 1 && d <= w.alarm_pips;
  }).length;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-bold text-ink">Aktive Trades</h1>
          {erreicht > 0 && <Badge tone="bad">{erreicht} erreicht</Badge>}
          {nah > 0 && <Badge tone="warn">{nah} nah dran</Badge>}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Alles, was du gerade verfolgst — von Hand eingetragen oder aus einem
          Treffer im{" "}
          <Link href="/trading/cockpit" className="text-accent-soft hover:underline">
            Cockpit
          </Link>{" "}
          übernommen. Eine Liste, ein Ort zum Ändern und Löschen.
        </p>
      </div>

      <Card>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Was gerade läuft</CardTitle>
          <Link href="/trading/einstellungen" className="text-xs text-accent-soft hover:underline">
            Alarme einstellen ↗
          </Link>
        </div>

        {watchlist.length === 0 ? (
          <Empty>
            Nichts aktiv. Geh die Charts durch, trag die Level ein, die du
            verfolgen willst, und setz den Alarm — dann meldet sich KerimOS,
            statt dass du nachsehen musst. Treffer aus dem Cockpit landen
            über „In aktive Trades" ebenfalls hier.
          </Empty>
        ) : (
          <div className="mb-5 space-y-4">
            {gruppen.map((g) => {
              const liste = (
                <ul className="space-y-1.5">
                  {g.zeilen.map((w) => (
                    <TradeZeile key={w.id} w={w} pairs={pairs} kategorien={kategorien} />
                  ))}
                </ul>
              );

              // Ohne Kategorien gibt es nichts zu gruppieren — dann steht die
              // Liste blank da, statt unter einer Ueberschrift „ohne Kategorie".
              if (kategorien.length === 0) return <div key="ohne">{liste}</div>;

              return (
                <GruppenBox key={g.kategorie?.id ?? "ohne"}
                  schluessel={`trading:${g.kategorie?.id ?? "ohne"}`}
                  titel={g.kategorie?.name ?? "ohne Kategorie"}
                  punkt={g.kategorie ? farbPunkt(g.kategorie.farbe) : null}
                  anzahl={g.zeilen.length}>
                  {liste}
                </GruppenBox>
              );
            })}
          </div>
        )}

        <form action={addWatchlistPair} className="flex flex-wrap items-end gap-2.5">
          <div>
            <Label htmlFor="wl-pair">Pair</Label>
            <Input id="wl-pair" name="pair" placeholder="EURUSD" required
              className="w-28 uppercase" />
          </div>
          <div>
            <Label htmlFor="wl-side">Seite</Label>
            <Select id="wl-side" name="side" defaultValue="" className="w-28">
              <option value="">—</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="wl-level">Linie</Label>
            <Input id="wl-level" name="line_level" type="number" step="0.00001"
              placeholder="1.0850" className="w-28" />
          </div>
          <div>
            <Label htmlFor="wl-pips">Warnung ab</Label>
            <Input id="wl-pips" name="alarm_pips" type="number" min="0"
              defaultValue={30} className="w-24" />
          </div>
          <div>
            <Label htmlFor="wl-zeit">Uhrzeit</Label>
            <Input id="wl-zeit" name="alarm_time" type="time" className="w-28" />
          </div>
          <div>
            <Label htmlFor="wl-bis">Anzeigen bis</Label>
            <Input id="wl-bis" name="show_until" type="date" className="w-36" />
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-ink-soft">
            <input type="checkbox" name="alarm_on_hit" defaultChecked className="accent-accent" />
            bei Treffer
          </label>
          {kategorien.length > 0 && (
            <div>
              <Label htmlFor="wl-kat">Kategorie</Label>
              <Select id="wl-kat" name="kategorie_id" defaultValue="" className="w-40">
                <option value="">— ohne —</option>
                {kategorien.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="min-w-36 flex-1">
            <Label htmlFor="wl-note">Notiz</Label>
            <Input id="wl-note" name="note" placeholder="optional" />
          </div>
          <Button type="submit" variant="ghost">Aufnehmen</Button>
        </form>
      </Card>

      <details className="rounded-xl border border-line/60 bg-sand/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Mehrere Linien je Pair — einmalige Migration
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Bis 21.08.2026 liess die Datenbank nur <strong>eine</strong> Zeile je
          Paar zu. Eine zweite Linie fuer dasselbe Paar hat die erste
          stillschweigend ueberschrieben. Der Code legt jetzt mehrere an — die
          Bedingung in der Datenbank muss aber einmal von Hand weg, sonst
          kommt beim Speichern ein Fehler. SQL kopieren, im Supabase-SQL-Editor
          des Trading-Projekts ausfuehren, fertig. Laeuft die Migration ein
          zweites Mal, tut sie nichts.
        </p>
        <div className="mt-3">
          <KopierFeld text={WATCHLIST_MIGRATION_SQL} />
        </div>
      </details>

      <Card>
        <CardTitle>So ist es gedacht</CardTitle>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>
            Sonntagabend und Mittwoch die Charts durchgehen — in TradingView,
            wie gewohnt.
          </li>
          <li>
            Die Level, die du wirklich beobachten willst, hier eintragen. Das
            Aufschreiben ist der Punkt: danach weisst du, worauf du wartest.
          </li>
          <li>
            Alarm setzen. Bei Treffer oder ab einer Pip-Distanz kommt die
            Telegram-Nachricht, ohne dass du nachsiehst.
          </li>
          <li>
            Vor dem Einstieg kurz auf{" "}
            <Link href="/trading/confluence" className="text-accent-soft hover:underline">
              Confluence
            </Link>{" "}
            schauen: spricht die Fundamentallage dafür oder dagegen?
          </li>
        </ol>
      </Card>
    </div>
  );
}

/**
 * Eine Zeile der aktiven Trades.
 *
 * Eigene Komponente, seit die Liste nach Kategorien gruppiert wird: Sonst
 * stuende derselbe Block zweimal im JSX, einmal je Gruppe, und beim naechsten
 * Feld haette man ihn an einer Stelle vergessen.
 */
function TradeZeile({
  w, pairs, kategorien,
}: { w: WatchlistPair; pairs: ScreenerPair[]; kategorien: Kategorie[] }) {
  const live = livePreis(w.pair, pairs);
  const preis = live?.price ?? null;
  const abstand = preis !== null && w.line_level !== null
    ? pipsZu(w.pair, preis, w.line_level) : null;

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-sand/60 px-3 py-2 text-sm">
      <span className="font-medium text-ink">{w.pair}</span>
      {w.side && (
        <Badge tone={w.side === "long" ? "good" : "bad"}>{w.side.toUpperCase()}</Badge>
      )}
      {w.line_level !== null && (
        <span className="tabular text-xs text-ink-muted">@ {w.line_level}</span>
      )}

      {abstand !== null ? (
        <span className={"tabular text-xs " +
          (abstand < 1 ? "text-bad-bright"
            : w.alarm_pips !== null && abstand <= w.alarm_pips ? "text-accent"
              : "text-ink-soft")}>
          {abstand < 1 ? "erreicht" : `${Math.round(abstand)} Pips`}
        </span>
      ) : !live ? (
        <Badge tone="neutral">kein Live-Preis</Badge>
      ) : null}

      {w.alarm_pips !== null && <Badge tone="neutral">Warnung {w.alarm_pips} Pips</Badge>}
      {w.alarm_on_hit && <Badge tone="neutral">bei Treffer</Badge>}
      {w.alarm_time && <Badge tone="neutral">{w.alarm_time.slice(0, 5)}</Badge>}
      {w.show_until && (
        <span className="text-[11px] text-ink-faint">bis {dateLabel(w.show_until)}</span>
      )}

      {w.note?.startsWith(GVA_NOTIZ)
        ? <Badge tone="accent" title={w.note}>aus dem Cockpit</Badge>
        : w.note && <span className="text-xs text-ink-muted">{w.note}</span>}

      <span className="ml-auto flex items-center gap-3">
        <KategorieWahl id={w.id} aktuell={w.kategorie_id} kategorien={kategorien} />
        <Link href={`/trading/journal/trades?paar=${w.pair}`}
          className="text-xs text-accent-soft transition hover:underline">
          Trade eintragen →
        </Link>
        <form action={removeWatchlistPair}>
          <input type="hidden" name="id" value={w.id} />
          <button className="text-xs text-ink-faint transition hover:text-bad">
            entfernen
          </button>
        </form>
      </span>
    </li>
  );
}
