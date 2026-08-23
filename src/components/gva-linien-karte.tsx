import Link from "next/link";
import {
  fetchWatchlistFuerStart, fetchScreener, fetchKategorien, tradingConfigured,
  type ScreenerPair, type WatchlistPair,
} from "@/lib/supabase/trading";
import { gruppiereNachKategorie, farbPunkt } from "@/lib/trading/kategorien";
import { Card, CardTitle, Badge, cx } from "@/components/ui";
import { heuteISO } from "@/lib/time";

/** JPY-Paare rechnen mit 0.01 Pip, alles andere mit 0.0001. */
function pips(pair: string, a: number, b: number): number {
  return Math.abs(a - b) / (pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001);
}

/**
 * Die aktiven Trades auf der Startseite — nach Kategorie gruppiert.
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

  const [screener, kategorien] = await Promise.all([fetchScreener(), fetchKategorien()]);
  const preise = new Map<string, number>();
  for (const p of (screener?.data ?? []) as ScreenerPair[]) {
    if (typeof p.price === "number") preise.set(p.pair.toUpperCase(), p.price);
  }

  /**
   * Was am nächsten dran ist, steht oben — Linien ohne bekannten Preis ganz
   * unten, statt sie mit einem erfundenen Abstand einzusortieren.
   *
   * Sortiert wird INNERHALB der Kategorie, nicht über alle: sonst würde die
   * Einteilung, die Kerim in den Einstellungen vorgenommen hat, hier wieder
   * von der Dringlichkeit überstimmt — und dann bräuchte man sie nicht.
   */
  const nachAbstand = (a: WatchlistPair, b: WatchlistPair) => {
    const d = (l: WatchlistPair) => {
      const preis = preise.get(l.pair.toUpperCase());
      return preis === undefined ? 1e9 : pips(l.pair, preis, l.line_level!);
    };
    return d(a) - d(b);
  };

  const gruppen = gruppiereNachKategorie(linien, kategorien)
    .map((g) => ({ ...g, zeilen: [...g.zeilen].sort(nachAbstand) }));

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Aktive Trades</CardTitle>
        <Link href="/trading" className="text-xs text-accent-soft hover:underline">
          verwalten ↗
        </Link>
      </div>

      <div className="space-y-3">
        {gruppen.map((g) => (
          <div key={g.kategorie?.id ?? "ohne"}>
            {/* Ueberschrift nur, wenn es ueberhaupt Kategorien gibt — sonst
                stuende ueber der einen Liste „ohne Kategorie", und das ist
                keine Information, sondern Rauschen. */}
            {kategorien.length > 0 && (
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cx("h-2 w-2 shrink-0 rounded-full",
                  g.kategorie ? farbPunkt(g.kategorie.farbe) : "bg-transparent ring-1 ring-line")} />
                <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  {g.kategorie?.name ?? "ohne Kategorie"}
                </span>
                <span className="h-px flex-1 bg-line/40" />
              </div>
            )}

            <ul className="space-y-1.5">
              {g.zeilen.map((linie) => {
                const preis = preise.get(linie.pair.toUpperCase()) ?? null;
                const abstand = preis === null ? null : pips(linie.pair, preis, linie.line_level!);
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
          </div>
        ))}
      </div>
    </Card>
  );
}
