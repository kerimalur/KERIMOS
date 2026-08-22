import Link from "next/link";
import {
  fetchScreener, fetchWatchlist, tradingConfigured, type ScreenerPair,
} from "@/lib/supabase/trading";
import { baueBeobachtung, GRUND_TEXT } from "@/lib/trading/beobachtung";
import { addWatchlistPair, removeWatchlistPair } from "@/lib/trading-actions";
import { Card, CardTitle, Badge, Button, Input, Label, Empty } from "@/components/ui";

/**
 * Die eigene Watchlist — was gerade beobachtet wird.
 *
 * Ersetzt das TradingView-Widget, das hier stand. Das kannte weder die
 * GVA-Linien noch die Setup-Zustände und war damit eine zweite, blinde Liste
 * neben der eigentlichen. Diese hier zeigt genau das, was Kerim selbst
 * markiert hat: „Setup läuft noch" aus dem Radar und was er von Hand
 * dazuschreibt.
 *
 * `kompakt` ist die Fassung für die Startseite: dieselben Zeilen, aber ohne
 * Eingabefeld und höchstens sechs davon. Gepflegt wird unter /trading.
 */
export async function BeobachtungKarte({ kompakt = false }: { kompakt?: boolean }) {
  if (!tradingConfigured()) return null;

  const [screener, watchlist] = await Promise.all([fetchScreener(), fetchWatchlist()]);
  const zeilen = baueBeobachtung(
    (screener?.data ?? []) as ScreenerPair[], watchlist,
  );

  // Auf der Startseite gilt dieselbe Regel wie bei allen anderen Karten: ist
  // nichts da, blendet sie sich aus, statt eine leere Fläche zu belegen.
  if (kompakt && zeilen.length === 0) return null;

  const sichtbar = kompakt ? zeilen.slice(0, 6) : zeilen;

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Beobachtung</CardTitle>
        {kompakt ? (
          <Link href="/trading" className="text-xs text-accent-soft hover:underline">
            verwalten ↗
          </Link>
        ) : (
          <Link href="/trading/cockpit" className="text-xs text-accent-soft hover:underline">
            Cockpit ↗
          </Link>
        )}
      </div>

      {zeilen.length === 0 ? (
        <Empty>
          Nichts in Beobachtung. Markier im Cockpit ein Setup als „läuft noch",
          oder trag hier unten ein Paar ein, das du im Blick behalten willst.
        </Empty>
      ) : (
        <ul className="space-y-1.5">
          {sichtbar.map((z) => (
            <li key={z.pair}
              className={"flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm "
                + (z.status === "HIT" ? "bg-bad-tint"
                  : z.status === "PREPARE" ? "bg-warn-tint" : "bg-sand/60")}>
              <span className="font-medium text-ink">{z.pair}</span>

              {z.near && (
                <Badge tone={z.near === "LONG" ? "good" : "bad"}>{z.near}</Badge>
              )}
              {z.status === "HIT" && <Badge tone="bad">Treffer</Badge>}

              <span className="text-[11px] text-ink-faint">{GRUND_TEXT[z.grund]}</span>

              {z.distanz !== null && z.status !== "HIT" && (
                <span className="tabular text-xs text-ink-soft">
                  {Math.round(z.distanz)} Pips
                </span>
              )}
              {z.notiz && <span className="truncate text-xs text-ink-muted">{z.notiz}</span>}

              <span className="ml-auto flex items-center gap-2">
                {z.preis !== null && (
                  <span className="tabular text-xs text-ink-faint">{z.preis}</span>
                )}
                {/* Ein Tagesschlusskurs sieht aus wie ein Live-Kurs. Wer damit
                    einen Abstand abschätzt, rechnet falsch — also dranschreiben. */}
                {z.stale && <Badge tone="neutral">Schlusskurs</Badge>}
                {!kompakt && z.watchlistId && (
                  <form action={removeWatchlistPair}>
                    <input type="hidden" name="id" value={z.watchlistId} />
                    <button className="text-xs text-ink-faint transition hover:text-bad">
                      entfernen
                    </button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {kompakt ? (
        zeilen.length > sichtbar.length && (
          <p className="mt-2 text-[11px] text-ink-faint">
            {zeilen.length - sichtbar.length} weitere unter /trading.
          </p>
        )
      ) : (
        <>
          {/* Kein Level-Feld: eine Zeile MIT Level ist eine GVA-Linie und
              gehört in die Karte darüber. Hier geht es nur ums Beobachten. */}
          <form action={addWatchlistPair} className="mt-4 flex flex-wrap items-end gap-2.5">
            <div>
              <Label htmlFor="beob-pair">Paar</Label>
              <Input id="beob-pair" name="pair" placeholder="EURUSD" className="w-32" required />
            </div>
            <div>
              <Label htmlFor="beob-note">Notiz</Label>
              <Input id="beob-note" name="note" placeholder="warum?" className="w-56" />
            </div>
            <Button type="submit" variant="ghost">Beobachten</Button>
          </form>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            „Setup läuft" kommt aus dem Radar und verschwindet hier wieder,
            sobald du es dort auf „fertig" setzt. Von Hand eingetragene Paare
            bleiben, bis du sie entfernst.
          </p>
        </>
      )}
    </Card>
  );
}
