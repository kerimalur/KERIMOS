/**
 * Was gerade beobachtet wird — die eigene Watchlist.
 *
 * Zwei Quellen, bewusst getrennt gehalten:
 *
 * 1. **„Setup läuft noch"** — was im Radar auf `pending` steht. Das ist eine
 *    Entscheidung, die Kerim schon getroffen hat; sie soll ihm nicht in einer
 *    Unterseite verlorengehen.
 * 2. **Von Hand eingetragen** — Zeilen aus `trading_watchlist` OHNE Level.
 *    Eine Zeile MIT Level ist eine GVA-Linie und gehört in die Linien-Karte;
 *    eine ohne Level heisst nur „das will ich im Blick haben".
 *
 * Ein Paar kann in beiden stehen. Dann steht es einmal da, mit beiden Gründen —
 * doppelt wäre es keine Übersicht mehr.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit `tools/checks/beobachtung.mts`.
 */
import type { ScreenerPair, WatchlistPair } from "@/lib/supabase/trading";

export type Grund = "setup" | "manuell" | "beides";

export interface BeobachtungsZeile {
  pair: string;
  grund: Grund;
  /** Live-Preis, falls der Screener einen hat. */
  preis: number | null;
  /** true = Tagesschluss statt live. Muss sichtbar sein, sonst rechnet man mit einem alten Kurs. */
  stale: boolean;
  status: ScreenerPair["status"] | null;
  near: ScreenerPair["near"];
  /** Pips bis zur nächsten GVA-Linie. */
  distanz: number | null;
  notiz: string | null;
  /** Nur bei von Hand eingetragenen Zeilen — zum Entfernen. */
  watchlistId: string | null;
}

/** Getroffen vor nah dran vor Rest — dieselbe Stufenlogik wie im Radar. */
const STUFE: Record<string, number> = { HIT: 0, PREPARE: 1, NEUTRAL: 2 };

/**
 * Reihenfolge: was eine Entscheidung braucht, steht oben.
 *
 * Erst der Screener-Zustand (HIT vor PREPARE vor Rest, unbekannt ganz unten),
 * dann der Abstand zur Linie, dann der Name. Ein Paar ohne Abstandsangabe
 * landet am Ende seiner Stufe, statt mit einer erfundenen Null nach oben zu
 * rutschen.
 */
function vergleiche(a: BeobachtungsZeile, b: BeobachtungsZeile): number {
  const sa = a.status === null ? 3 : STUFE[a.status];
  const sb = b.status === null ? 3 : STUFE[b.status];
  if (sa !== sb) return sa - sb;
  const da = a.distanz ?? Number.POSITIVE_INFINITY;
  const db = b.distanz ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return a.pair.localeCompare(b.pair);
}

export function baueBeobachtung(
  screener: ScreenerPair[], watchlist: WatchlistPair[],
): BeobachtungsZeile[] {
  const nachPaar = new Map<string, ScreenerPair>();
  for (const p of screener) nachPaar.set(p.pair.toUpperCase(), p);

  // Nur Zeilen ohne Level: mit Level ist es eine Linie, keine Beobachtung.
  const manuell = watchlist.filter((w) => w.line_level === null && !w.archived);
  const manuellPaare = new Set(manuell.map((w) => w.pair.toUpperCase()));
  const setupPaare = new Set(
    screener.filter((p) => p.pending).map((p) => p.pair.toUpperCase()),
  );

  const alle = [...new Set([...setupPaare, ...manuellPaare])];

  return alle.map((pair) => {
    const s = nachPaar.get(pair) ?? null;
    const m = manuell.find((w) => w.pair.toUpperCase() === pair) ?? null;
    const imSetup = setupPaare.has(pair);
    return {
      pair,
      grund: imSetup && m ? "beides" : imSetup ? "setup" : "manuell",
      preis: s?.price ?? null,
      stale: s?.stale ?? false,
      status: s?.status ?? null,
      near: s?.near ?? null,
      distanz: s?.distance ?? null,
      notiz: m?.note ?? null,
      watchlistId: m?.id ?? null,
    } satisfies BeobachtungsZeile;
  }).sort(vergleiche);
}

/** Wie der Grund auf der Karte steht. */
export const GRUND_TEXT: Record<Grund, string> = {
  setup: "Setup läuft",
  manuell: "beobachtet",
  beides: "Setup läuft · beobachtet",
};
