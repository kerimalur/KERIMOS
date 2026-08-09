"use server";
import { revalidatePath } from "next/cache";
import { createTradingClient } from "@/lib/supabase/trading";

/**
 * Server Actions für die manuelle Watchlist unter /trading.
 *
 * Eigene Datei statt actions.ts - dasselbe Muster wie garmin-actions.ts:
 * ein abgeschlossenes Thema bläht die grosse Sammlung dort nicht weiter auf.
 */

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** "eurusd", "EUR/USD", " eurusd " -> "EURUSD". */
function normalisierePair(roh: string): string {
  return roh.toUpperCase().replace(/[^A-Z]/g, "");
}

export async function addWatchlistPair(fd: FormData) {
  const pair = normalisierePair(text(fd, "pair"));
  if (pair.length < 6) return; // z.B. "EURUSD" - kürzer ist sicher unvollständig
  const note = text(fd, "note") || null;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  // Upsert statt Insert: ein Pair, das schon drauf ist, aktualisiert nur die
  // Notiz, statt einen Fehler wegen der eindeutigen Spalte zu werfen.
  const { error } = await supabase
    .from("trading_watchlist")
    .upsert({ pair, note }, { onConflict: "pair" });
  if (error) throw new Error(`Watchlist: ${error.message}`);

  revalidatePath("/trading");
}

export async function removeWatchlistPair(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("trading_watchlist").delete().eq("id", id);
  if (error) throw new Error(`Watchlist entfernen: ${error.message}`);

  revalidatePath("/trading");
}
