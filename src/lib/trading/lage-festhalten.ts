import "server-only";
import { createTradingClient } from "@/lib/supabase/trading";
import { baueHitLage } from "@/lib/trading/hit-detail";
import type { LageSnapshot } from "@/lib/trading/lage-snapshot";

/**
 * Rechnet die Lage für einen Trade und legt sie an ihm ab.
 *
 * Gibt eine Fehlermeldung zurück statt zu werfen: der Cron soll bei einem
 * Trade, der scheitert, nicht die anderen Aufgaben mitreissen, und der Dialog
 * soll sagen können, was los war (meist: Migration noch nicht gelaufen).
 */
export async function lageFesthalten(
  tradeId: string, pair: string, richtung: "long" | "short",
  quelle: LageSnapshot["quelle"],
): Promise<string | null> {
  const supabase = createTradingClient();
  if (!supabase) return "Trading-Datenbank nicht verbunden.";

  let lage;
  try {
    // Immer mit Service-Schlüssel: der Aufruf kommt meist aus dem Cron, wo
    // niemand angemeldet ist.
    lage = await baueHitLage(pair, richtung, true);
  } catch (e) {
    return `Lage liess sich nicht rechnen: ${e instanceof Error ? e.message : "unbekannt"}`;
  }

  const snapshot: LageSnapshot = { ...lage, erfasstAm: new Date().toISOString(), quelle };
  const { error } = await supabase.from("trades")
    .update({ fundamental_snapshot: snapshot }).eq("id", tradeId);
  if (error) {
    return /fundamental_snapshot/.test(error.message)
      ? "Die Spalte fundamental_snapshot fehlt noch — Migration "
        + "supabase/trading/05_journal_und_hit_meldung.sql ausführen."
      : `Lage speichern: ${error.message}`;
  }
  return null;
}
