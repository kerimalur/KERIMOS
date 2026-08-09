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

const zahl = (fd: FormData, k: string): number | null => {
  const v = text(fd, k);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function addWatchlistPair(fd: FormData) {
  const pair = normalisierePair(text(fd, "pair"));
  if (pair.length < 6) return; // z.B. "EURUSD" - kürzer ist sicher unvollständig

  const seite = text(fd, "side");
  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  // Upsert statt Insert: ein Pair, das schon drauf ist, wird aktualisiert
  // statt einen Fehler wegen der eindeutigen Spalte zu werfen.
  const { error } = await supabase
    .from("trading_watchlist")
    .upsert({
      pair,
      note: text(fd, "note") || null,
      line_level: zahl(fd, "line_level"),
      side: seite === "long" || seite === "short" ? seite : null,
      alarm_pips: zahl(fd, "alarm_pips"),
      alarm_on_hit: fd.get("alarm_on_hit") !== null,
      alarm_time: text(fd, "alarm_time") || null,
      show_until: text(fd, "show_until") || null,
      archived: false,
    }, { onConflict: "pair" });
  if (error) throw new Error(`Watchlist: ${error.message}`);

  revalidatePath("/trading");
  revalidatePath("/");
}

/** Alarme einer bestehenden Linie ändern, ohne sie neu anzulegen. */
export async function updateWatchlistAlarm(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase
    .from("trading_watchlist")
    .update({
      line_level: zahl(fd, "line_level"),
      alarm_pips: zahl(fd, "alarm_pips"),
      alarm_on_hit: fd.get("alarm_on_hit") !== null,
      alarm_time: text(fd, "alarm_time") || null,
      show_until: text(fd, "show_until") || null,
    })
    .eq("id", id);
  if (error) throw new Error(`Alarm ändern: ${error.message}`);

  revalidatePath("/trading");
  revalidatePath("/");
}

export async function removeWatchlistPair(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("trading_watchlist").delete().eq("id", id);
  if (error) throw new Error(`Watchlist entfernen: ${error.message}`);

  revalidatePath("/trading");
  revalidatePath("/");
}
