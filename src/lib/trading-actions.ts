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

/**
 * Eine Linie speichern.
 *
 * Ein Paar darf MEHRERE Linien haben — Widerstand, Unterstützung, Ziel.
 * Vorher stand hier ein `upsert` mit `onConflict: "pair"`; zusammen mit der
 * eindeutigen Spalte in der Datenbank hat damit jede zweite Linie desselben
 * Paares die erste stillschweigend überschrieben. Kein Fehler, keine Meldung,
 * die alte Linie einfach weg.
 *
 * Was bleibt: dieselbe Linie zweimal zu speichern heisst „ändern", nicht
 * „danebenlegen". Gleiches Paar UND gleiches Level gilt als dieselbe Linie —
 * sonst sammeln sich beim Nachjustieren des Alarms Karteileichen an.
 */
export async function addWatchlistPair(fd: FormData) {
  const pair = normalisierePair(text(fd, "pair"));
  if (pair.length < 6) return; // z.B. "EURUSD" - kürzer ist sicher unvollständig

  const seite = text(fd, "side");
  const level = zahl(fd, "line_level");
  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const werte = {
    pair,
    note: text(fd, "note") || null,
    line_level: level,
    side: seite === "long" || seite === "short" ? seite : null,
    alarm_pips: zahl(fd, "alarm_pips"),
    alarm_on_hit: fd.get("alarm_on_hit") !== null,
    alarm_time: text(fd, "alarm_time") || null,
    show_until: text(fd, "show_until") || null,
    archived: false,
  };

  // `null` braucht `is`, nicht `eq` — in SQL ist `= null` nie wahr, die Suche
  // liefe leer und jede Linie ohne Level käme doppelt in die Liste.
  const suche = supabase
    .from("trading_watchlist").select("id")
    .eq("pair", pair).eq("archived", false);
  const { data: gleiche } = level === null
    ? await suche.is("line_level", null).limit(1)
    : await suche.eq("line_level", level).limit(1);

  const treffer = ((gleiche ?? []) as { id: string }[])[0];
  const { error } = treffer
    ? await supabase.from("trading_watchlist").update(werte).eq("id", treffer.id)
    : await supabase.from("trading_watchlist").insert(werte);

  if (error) {
    // 23505 = unique_violation. Dann steht die alte Bedingung noch in der
    // Datenbank und der Code allein reicht nicht — das muss dranstehen,
    // sonst sucht man den Fehler im Formular.
    if (error.code === "23505") {
      throw new Error(
        "Watchlist: die Datenbank lässt weiterhin nur eine Zeile je Pair zu. "
        + "Führ die Migration aus — sie steht auf /trading unter "
        + "„Mehrere Linien je Pair“ zum Kopieren.",
      );
    }
    throw new Error(`Watchlist: ${error.message}`);
  }

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
