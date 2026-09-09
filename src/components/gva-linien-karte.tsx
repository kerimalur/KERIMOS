import Link from "next/link";
import {
  fetchWatchlistFuerStart, fetchScreener, fetchKategorien, tradingConfigured,
  type ScreenerPair, type WatchlistPair,
} from "@/lib/supabase/trading";
import { gruppiereNachKategorie, farbPunkt } from "@/lib/trading/kategorien";
import { GruppenBox } from "@/components/trading/gruppen-box";
import { KlappKarte } from "@/components/klapp-karte";
import { Badge } from "@/components/ui";
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
 *
 * Zwei Ebenen zum Zuklappen, beide bleiben über das Schliessen der App hinweg
 * so, wie Kerim sie gelassen hat: die ganze Karte (`KlappKarte`) und jede
 * Kategorie darin (`GruppenBox`). Damit lässt sich alles wegräumen oder genau
 * die eine Kategorie offen lassen, die heute zählt. Wie viele Linien erreicht
 * sind, steht auch im zugeklappten Zustand daneben - sonst müsste man
 * aufklappen, um zu sehen, ob es sich lohnt.
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

  const erreicht = linien.filter((l) => {
    const preis = preise.get(l.pair.toUpperCase());
    return preis !== undefined && pips(l.pair, preis, l.line_level!) < 1;
  }).length;

  return (
    <KlappKarte
      schluessel="start:trades"
      titel="Aktive Trades"
      zusatz={
        <span className="ml-1 flex items-center gap-2">
          <span className="tabular text-[11px] text-ink-faint">{linien.length}</span>
          {erreicht > 0 && <Badge tone="bad">{erreicht} erreicht</Badge>}
        </span>
      }
      aktion={
        <Link href="/trading" className="shrink-0 text-xs text-accent-soft hover:underline">
          verwalten ↗
        </Link>
      }>
      <div className="space-y-3">
        {gruppen.map((g) => {
          const liste = (
            <ul className="space-y-1.5">
              {g.zeilen.map((linie) => {
                const preis = preise.get(linie.pair.toUpperCase()) ?? null;
                const abstand = preis === null ? null : pips(linie.pair, preis, linie.line_level!);
                const getroffen = abstand !== null && abstand < 1;

                return (
                  <li key={linie.id}
                    className={"flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm " +
                      (getroffen ? "bg-bad-tint" : "bg-sand/60")}>
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
                      <span className="tabular text-xs text-ink-soft">
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
          );

          if (kategorien.length === 0) return <div key="ohne">{liste}</div>;

          return (
            <GruppenBox key={g.kategorie?.id ?? "ohne"}
              schluessel={`start:${g.kategorie?.id ?? "ohne"}`}
              titel={g.kategorie?.name ?? "ohne Kategorie"}
              punkt={g.kategorie ? farbPunkt(g.kategorie.farbe) : null}
              anzahl={g.zeilen.length}>
              {liste}
            </GruppenBox>
          );
        })}
      </div>
    </KlappKarte>
  );
}
