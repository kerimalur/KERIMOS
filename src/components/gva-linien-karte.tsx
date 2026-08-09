import Link from "next/link";
import {
  fetchWatchlistFuerStart, fetchScreener, tradingConfigured,
  type ScreenerPair,
} from "@/lib/supabase/trading";
import { Card, CardTitle, Badge } from "@/components/ui";
import { heuteISO } from "@/lib/time";

/** JPY-Paare rechnen mit 0.01 Pip, alles andere mit 0.0001. */
function pips(pair: string, a: number, b: number): number {
  return Math.abs(a - b) / (pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001);
}

/**
 * Die eigenen GVA-Linien auf der Startseite.
 *
 * Zeigt nur Linien, deren Anzeigedauer (`show_until`) noch läuft - eine
 * Linie, die Kerim für diese Woche gesetzt hat, verschwindet danach von
 * selbst, statt die Startseite langsam zuzumüllen. Unter /trading bleibt
 * sie sichtbar.
 *
 * Die Karte blendet sich komplett aus, wenn nichts ansteht - gleiche Regel
 * wie bei allen anderen Karten der Startseite.
 */
export async function GvaLinienKarte() {
  if (!tradingConfigured()) return null;

  const linien = (await fetchWatchlistFuerStart(heuteISO()))
    .filter((l) => l.line_level !== null);
  if (linien.length === 0) return null;

  const screener = await fetchScreener();
  const preise = new Map<string, number>();
  for (const p of (screener?.data ?? []) as ScreenerPair[]) {
    if (typeof p.price === "number") preise.set(p.pair.toUpperCase(), p.price);
  }

  // Was am nächsten dran ist, steht oben - Linien ohne bekannten Preis
  // ganz unten, statt sie mit einem erfundenen Abstand einzusortieren.
  const mitAbstand = linien.map((l) => {
    const preis = preise.get(l.pair.toUpperCase());
    return {
      linie: l, preis: preis ?? null,
      abstand: preis === undefined ? null : pips(l.pair, preis, l.line_level!),
    };
  }).sort((a, b) => (a.abstand ?? 1e9) - (b.abstand ?? 1e9));

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Meine GVA-Linien</CardTitle>
        <Link href="/trading" className="text-xs text-accent-soft hover:underline">
          verwalten ↗
        </Link>
      </div>

      <ul className="space-y-1.5">
        {mitAbstand.map(({ linie, preis, abstand }) => {
          const nah = abstand !== null && linie.alarm_pips !== null
            && abstand <= linie.alarm_pips;
          const getroffen = abstand !== null && abstand < 1;

          return (
            <li key={linie.id}
              className={"flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm " +
                (getroffen ? "bg-bad-tint" : nah ? "bg-warn-tint" : "bg-sand/60")}>
              <span className="font-medium text-ink">{linie.pair}</span>
              {linie.side && (
                <Badge tone={linie.side === "long" ? "good" : "bad"}>
                  {linie.side.toUpperCase()}
                </Badge>
              )}
              <span className="tabular text-xs text-ink-muted">@ {linie.line_level}</span>

              {abstand === null ? (
                <Badge tone="neutral">kein Live-Preis</Badge>
              ) : getroffen ? (
                <Badge tone="bad">erreicht</Badge>
              ) : (
                <span className={"tabular text-xs " + (nah ? "text-accent" : "text-ink-soft")}>
                  {Math.round(abstand)} Pips
                </span>
              )}

              {linie.alarm_time && (
                <Badge tone="neutral">{linie.alarm_time.slice(0, 5)}</Badge>
              )}
              {linie.note && (
                <span className="truncate text-xs text-ink-muted">{linie.note}</span>
              )}
              {preis !== null && (
                <span className="ml-auto tabular text-xs text-ink-faint">{preis}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
