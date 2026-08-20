import Link from "next/link";
import {
  fetchScreener, fetchWatchlist,
  type ScreenerPair, type WatchlistPair,
} from "@/lib/supabase/trading";
import { addWatchlistPair, removeWatchlistPair } from "@/lib/trading-actions";
import { Card, CardTitle, Badge, Empty, Input, Select, Label, Button } from "@/components/ui";
import { TradingViewWatchlist } from "@/components/tradingview-watchlist";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Übersicht — ausschliesslich die selbst gepflegte Watchlist.
 *
 * Vorher stand hier alles gleichzeitig: Watchlist, GVA-Board, Wochen-News,
 * Engine-Backtest, Sessions, Hit-Historie. Die eigene Liste ging darin unter,
 * und genau sie ist der Punkt.
 *
 * Der Sinn dieser Seite ist, dass Kerim selbst arbeitet: Sonntagabend und
 * Mittwoch die Charts durchgehen, die Linien von Hand eintragen, Alarm
 * setzen — fertig. Automatik ist bequem, aber sie ersetzt das Hinschauen
 * nicht. Was der Screener von sich aus findet, steht im Cockpit.
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
  const [screener, watchlist] = await Promise.all([fetchScreener(), fetchWatchlist()]);
  const pairs = (screener?.data ?? []) as ScreenerPair[];

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
          <h1 className="font-display text-xl font-bold text-ink">Meine GVA-Linien</h1>
          {erreicht > 0 && <Badge tone="bad">{erreicht} erreicht</Badge>}
          {nah > 0 && <Badge tone="warn">{nah} nah dran</Badge>}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Deine Watchlist — von Hand eingetragen, mit eigenem Alarm. Was der
          Screener selbst findet, steht im{" "}
          <Link href="/trading/cockpit" className="text-accent-soft hover:underline">
            Cockpit
          </Link>.
        </p>
      </div>

      <Card>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Linien</CardTitle>
          <Link href="/trading/einstellungen" className="text-xs text-accent-soft hover:underline">
            Alarme einstellen ↗
          </Link>
        </div>

        {watchlist.length === 0 ? (
          <Empty>
            Noch keine Linie gesetzt. Geh die Charts durch, trag die Level ein,
            die du beobachten willst, und setz den Alarm — dann meldet sich
            KerimOS, statt dass du nachsehen musst.
          </Empty>
        ) : (
          <ul className="mb-4 space-y-1.5">
            {watchlist.map((w) => {
              const live = livePreis(w.pair, pairs);
              const preis = live?.price ?? null;
              const abstand = preis !== null && w.line_level !== null
                ? pipsZu(w.pair, preis, w.line_level) : null;

              return (
                <li key={w.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-sand/60 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{w.pair}</span>
                  {w.side && (
                    <Badge tone={w.side === "long" ? "good" : "bad"}>
                      {w.side.toUpperCase()}
                    </Badge>
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

                  {w.alarm_pips !== null && (
                    <Badge tone="neutral">Warnung {w.alarm_pips} Pips</Badge>
                  )}
                  {w.alarm_on_hit && <Badge tone="neutral">bei Treffer</Badge>}
                  {w.alarm_time && <Badge tone="neutral">{w.alarm_time.slice(0, 5)}</Badge>}
                  {w.show_until && (
                    <span className="text-[11px] text-ink-faint">
                      bis {dateLabel(w.show_until)}
                    </span>
                  )}
                  {w.note && <span className="text-xs text-ink-muted">{w.note}</span>}

                  <form action={removeWatchlistPair} className="ml-auto">
                    <input type="hidden" name="id" value={w.id} />
                    <button className="text-xs text-ink-faint transition hover:text-bad">
                      entfernen
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
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
          <div className="min-w-36 flex-1">
            <Label htmlFor="wl-note">Notiz</Label>
            <Input id="wl-note" name="note" placeholder="optional" />
          </div>
          <Button type="submit" variant="ghost">Linie speichern</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Markt im Blick</CardTitle>
        <TradingViewWatchlist />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Live-Kurse aller 28 Paare direkt von TradingView. Das Widget kennt deine
          GVA-Linien und Setup-Zustände <strong>nicht</strong> — was im Radar auf
          „läuft noch" steht, siehst du weiter im Cockpit. Hier steht der Markt
          daneben, nicht statt dessen.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Eine <strong>Anmeldung ist nicht möglich</strong>: die frei einbettbaren
          TradingView-Widgets sind anonym und kennen keinen Benutzer, deshalb lässt
          sich deine persönliche Watchlist von tradingview.com hier nicht spiegeln.
          Die Liste ist stattdessen fest hinterlegt — dieselben 28 Paare wie im
          Screener, nach Basiswährung gruppiert.
        </p>
      </Card>

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
