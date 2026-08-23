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
    kategorie_id: text(fd, "kategorie_id") || null,
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


/* ------------------------------------------------------------- Kategorien */

/**
 * Kategorien der aktiven Trades — angelegt unter /trading/einstellungen.
 *
 * Warum es sie gibt: Die Liste auf /trading ist bewusst EINE Liste. Sobald
 * mehr als eine Handvoll Zeilen darin steht, will man sie trotzdem ordnen
 * können — nach Setup-Art, nach Zeithorizont, nach was auch immer gerade
 * trägt. Feste Rubriken wären geraten; frei benannte lassen sich ändern,
 * wenn sich die Arbeitsweise ändert.
 *
 * Alle drei Aktionen erneuern auch die Startseite: die Linien-Karte dort
 * zeigt dieselben Zeilen, nur gefiltert.
 */

/** Alles, was eine Änderung an Kategorien sehen muss. */
function kategorienAktualisieren() {
  revalidatePath("/trading");
  revalidatePath("/trading/einstellungen");
  revalidatePath("/");
}

export async function kategorieAnlegen(fd: FormData) {
  const name = text(fd, "name");
  if (!name) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("trading_kategorien").insert({
    name,
    farbe: text(fd, "farbe") || "neutral",
    sort_order: zahl(fd, "sort_order") ?? 0,
  });

  if (error) {
    // 42P01 = Tabelle fehlt. Das ist kein Fehler im Formular, sondern die
    // noch nicht ausgefuehrte Migration — und das muss dranstehen, sonst
    // sucht man an der falschen Stelle.
    if (error.code === "42P01") {
      throw new Error(
        "Die Tabelle trading_kategorien fehlt. Fuehr die Migration aus — sie "
        + "steht auf /trading/einstellungen unter „Kategorien einrichten“ zum Kopieren.",
      );
    }
    // 23505 = doppelter Name.
    if (error.code === "23505") {
      throw new Error(`Es gibt schon eine Kategorie „${name}“.`);
    }
    throw new Error(`Kategorie anlegen: ${error.message}`);
  }

  kategorienAktualisieren();
}

export async function kategorieAendern(fd: FormData) {
  const id = text(fd, "id");
  const name = text(fd, "name");
  if (!id || !name) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase
    .from("trading_kategorien")
    .update({
      name,
      farbe: text(fd, "farbe") || "neutral",
      sort_order: zahl(fd, "sort_order") ?? 0,
    })
    .eq("id", id);
  if (error) throw new Error(`Kategorie aendern: ${error.message}`);

  kategorienAktualisieren();
}

/**
 * Eine Kategorie löschen — die Trades darin bleiben.
 *
 * Das erledigt die Datenbank über `on delete set null` (siehe
 * `kategorien-migration.ts`). Hier wird bewusst NICHT vorher aufgeräumt:
 * zwei Stellen, die dasselbe sicherstellen, laufen irgendwann auseinander.
 */
export async function kategorieLoeschen(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("trading_kategorien").delete().eq("id", id);
  if (error) throw new Error(`Kategorie loeschen: ${error.message}`);

  kategorienAktualisieren();
}

/** Einen aktiven Trade in eine andere Kategorie schieben. */
export async function watchlistKategorieSetzen(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase
    .from("trading_watchlist")
    .update({ kategorie_id: text(fd, "kategorie_id") || null })
    .eq("id", id);
  if (error) throw new Error(`Kategorie zuordnen: ${error.message}`);

  kategorienAktualisieren();
}
