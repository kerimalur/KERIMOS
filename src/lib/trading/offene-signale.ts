import "server-only";
import { fetchSignale, type Signal } from "@/lib/trading/journal";
import { fetchWatchlist, tradingConfigured } from "@/lib/supabase/trading";

/**
 * GVA-Hits, die noch auf eine Entscheidung warten.
 *
 * Steht hier und nicht in der Anzeige, seit die Startseite die Zahl auch im
 * Empfang nennt (26.09.2026). Zwei Stellen, die „offen" verschieden
 * auslegen, wären der sichere Weg zu „2 Hits warten" über einer Liste mit
 * drei Einträgen.
 *
 * Offen heisst: Status `new`, je Paar nur der jüngste, und nicht schon in
 * den aktiven Trades. Der Vergleich läuft über Paar UND Linienniveau —
 * dasselbe Paar kann zwei Linien haben, und dann ist nur eine davon
 * übernommen.
 */

export const sauberesPaar = (p: string) => p.replace(/[^A-Za-z]/g, "").toUpperCase();

export async function ladeOffeneHits(): Promise<Signal[]> {
  if (!tradingConfigured()) return [];

  const [signale, aktive] = await Promise.all([fetchSignale(["new"]), fetchWatchlist()]);

  const inListe = (s: Signal) => aktive.some((w) =>
    sauberesPaar(w.pair) === sauberesPaar(s.pair) && w.line_level !== null
    && Math.abs(w.line_level - s.lineLevel) < Math.max(1e-6, Math.abs(s.lineLevel) * 1e-5));

  // fetchSignale liefert absteigend nach hit_at → das erste je Paar ist das jüngste.
  const jePaar = new Map<string, Signal>();
  for (const s of signale) {
    const k = sauberesPaar(s.pair);
    if (!jePaar.has(k)) jePaar.set(k, s);
  }
  return [...jePaar.values()].filter((s) => !inListe(s));
}
