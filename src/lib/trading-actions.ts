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

  // Eine neue Kategorie kommt ans Ende. Eine Zahl dafür zu tippen waere die
  // Art Bedienung, bei der man beim dritten Mal aufgibt — verschoben wird
  // danach mit den Pfeilen.
  const { data: letzte } = await supabase
    .from("trading_kategorien").select("sort_order")
    .order("sort_order", { ascending: false }).limit(1);
  const naechste = Number(
    ((letzte ?? []) as { sort_order: number }[])[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("trading_kategorien").insert({
    name,
    farbe: text(fd, "farbe") || "neutral",
    sort_order: naechste,
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
    .update({ name, farbe: text(fd, "farbe") || "neutral" })
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

/**
 * Eine Kategorie eine Position nach oben oder unten schieben.
 *
 * Warum Pfeile und kein Zahlenfeld: Die Reihenfolge ist das, was man beim
 * Anschauen der Liste sofort ändern will — „Live gehört nach oben". Eine
 * Sortierzahl dafür einzutippen heisst, sich erst die Zahlen aller anderen
 * anzusehen und dann zu rechnen. Das macht niemand zweimal.
 *
 * Geschrieben werden ALLE Zeilen neu (0, 1, 2 …), nicht nur die zwei
 * getauschten. Das kostet bei einer Handvoll Kategorien nichts und räumt
 * nebenbei doppelte oder gerissene Zahlen auf, die sich sonst über die Zeit
 * ansammeln und die Pfeile stillstehen lassen.
 */
export async function kategorieVerschieben(fd: FormData) {
  const id = text(fd, "id");
  const richtung = text(fd, "richtung");
  if (!id || (richtung !== "hoch" && richtung !== "runter")) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { data } = await supabase
    .from("trading_kategorien").select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  const liste = ((data ?? []) as { id: string; name: string; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "de"));

  const i = liste.findIndex((k) => k.id === id);
  const j = richtung === "hoch" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= liste.length) return; // schon ganz oben bzw. unten

  [liste[i], liste[j]] = [liste[j], liste[i]];

  for (let n = 0; n < liste.length; n++) {
    if (liste[n].sort_order === n) continue; // nichts zu tun
    const { error } = await supabase
      .from("trading_kategorien").update({ sort_order: n }).eq("id", liste[n].id);
    if (error) throw new Error(`Reihenfolge speichern: ${error.message}`);
  }

  kategorienAktualisieren();
}
