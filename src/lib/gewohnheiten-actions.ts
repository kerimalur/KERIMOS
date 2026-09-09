"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { heuteISO } from "@/lib/time";

/**
 * Server Actions für die Gewohnheiten.
 *
 * Eigene Datei statt `actions.ts`: Next bündelt eine `"use server"`-Datei als
 * Einheit — wer eine Aktion importiert, zieht alle mit, und die dortige
 * Sammlung ist über Jahre gewachsen.
 */

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Startseite, Gewohnheiten-Seite und Gym zeigen dieselben Einträge. */
function aktualisieren() {
  revalidatePath("/");
  revalidatePath("/gewohnheiten");
  revalidatePath("/gym");
}

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht angemeldet.");
  return { supabase, userId };
}

/** Ein Datum, das die Datenbank annimmt — sonst nichts. */
const istDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Einen Tag eintragen oder wieder wegnehmen.
 *
 * Der gewünschte Zustand kommt aus dem Formular, statt ihn hier aus der
 * Datenbank zu lesen: so kann ein doppelter Klick nichts umdrehen, was der
 * erste gerade gesetzt hat.
 *
 * Ohne `datum` gilt heute. Der Nachtrag für einen vergangenen Tag schickt das
 * Datum mit — man merkt am Mittwoch, dass Montag fehlt. In die Zukunft geht
 * nichts: ein Haken für übermorgen wäre keine Aufzeichnung, sondern ein Vorsatz.
 *
 * `variante` unterscheidet Push von Pull. Leer heisst „keine" und ist bei
 * Gewohnheiten ohne Unterteilung der Normalfall.
 */
export async function gewohnheitAbhaken(fd: FormData) {
  const habitId = txt(fd, "id");
  if (!habitId) return;

  const datum = txt(fd, "datum") || heuteISO();
  if (!istDatum(datum) || datum > heuteISO()) return;

  const variante = txt(fd, "variante") || null;
  const { supabase, userId } = await zugang();

  if (txt(fd, "getan")) {
    /**
     * Einfaches `insert`, und eine Dublette gilt als Erfolg.
     *
     * Hier stand ein `upsert` mit `onConflict: "habit_id,entry_date,variante"`
     * — und es hat vom 09.09.2026 an KEINEN einzigen Eintrag gespeichert.
     * Der Grund ist eine Feinheit von Postgres: der eindeutige Index steht
     * auf dem AUSDRUCK `coalesce(variante, '')` (nötig, weil zwei NULL dort
     * nicht als gleich gelten), und eine ON-CONFLICT-Spaltenliste lässt sich
     * auf einen Ausdrucks-Index nicht abbilden. Postgres wies jedes Einfügen
     * mit 42P10 ab, die Aktion warf, und in der Oberfläche passierte
     * scheinbar nichts.
     *
     * Der Index bleibt, wie er ist — er ist richtig und verhindert Dubletten
     * verlässlich. Nur der Weg dorthin ist jetzt einer, der ihn nicht
     * benennen muss: einfügen, und 23505 (Dublette) als „steht schon da"
     * durchgehen lassen. Denn genau das ist es: derselbe Tag zweimal
     * gedrückt ist kein Fehler, sondern dieselbe Aussage.
     */
    const { error } = await supabase.from("habit_entries")
      .insert({ habit_id: habitId, user_id: userId, entry_date: datum, variante });

    if (error && error.code !== "23505") {
      throw new Error(`Gewohnheit eintragen: ${error.message}`);
    }
  } else {
    let weg = supabase.from("habit_entries").delete()
      .eq("habit_id", habitId).eq("entry_date", datum).eq("user_id", userId);
    // Ohne Variante ist die Zeile die mit NULL — `eq` würde dort nie treffen.
    weg = variante === null ? weg.is("variante", null) : weg.eq("variante", variante);
    await weg;
  }

  aktualisieren();
}

/**
 * Nimmt alles weg, was an einem Tag steht.
 *
 * Der Weg für das Raster: dort drückt man auf einen Tag, nicht auf eine
 * einzelne Variante. Ein Tag mit Push UND Ausdauer soll mit einem Druck leer
 * sein, statt zweimal dieselbe Frage zu stellen.
 */
export async function gewohnheitTagLeeren(fd: FormData) {
  const habitId = txt(fd, "id");
  const datum = txt(fd, "datum");
  if (!habitId || !istDatum(datum)) return;

  const { supabase, userId } = await zugang();
  await supabase.from("habit_entries").delete()
    .eq("habit_id", habitId).eq("entry_date", datum).eq("user_id", userId);

  aktualisieren();
}

/** Aus „Push, Pull, Ausdauer" wird die Liste. Leeres und Dubletten fallen weg. */
function varianten(roh: string): string[] {
  const gesehen = new Set<string>();
  return roh.split(",").map((v) => v.trim()).filter((v) => {
    if (!v || gesehen.has(v.toLowerCase())) return false;
    gesehen.add(v.toLowerCase());
    return true;
  });
}

/** Gemeinsame Felder von Anlegen und Ändern. */
function felder(fd: FormData) {
  const ziel = Number(txt(fd, "ziel_pro_woche"));
  return {
    name: txt(fd, "name"),
    icon: txt(fd, "icon") || null,
    color: txt(fd, "color") || "#9A8C74",
    ziel_pro_woche: Number.isFinite(ziel) ? Math.min(Math.max(ziel, 0), 7) : 0,
    bereich: txt(fd, "bereich") || "allgemein",
    varianten: varianten(txt(fd, "varianten")),
    mit_datum: txt(fd, "mit_datum") === "1",
  };
}

export async function gewohnheitAnlegen(fd: FormData) {
  const werte = felder(fd);
  if (!werte.name) return;

  const { supabase, userId } = await zugang();

  // Neue Gewohnheiten hängen sich hinten an.
  const { data: letzte } = await supabase
    .from("habits").select("sort_order")
    .order("sort_order", { ascending: false }).limit(1);
  const naechste = Number(
    ((letzte ?? []) as { sort_order: number }[])[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("habits")
    .insert({ ...werte, user_id: userId, sort_order: naechste });
  if (error) throw new Error(`Gewohnheit anlegen: ${error.message}`);

  aktualisieren();
}

export async function gewohnheitAendern(fd: FormData) {
  const id = txt(fd, "id");
  const werte = felder(fd);
  if (!id || !werte.name) return;

  const { supabase, userId } = await zugang();
  const { error } = await supabase.from("habits").update(werte)
    .eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Gewohnheit ändern: ${error.message}`);

  aktualisieren();
}

/**
 * Archivieren, nicht löschen: die eingetragenen Tage bleiben stehen. Wer eine
 * Gewohnheit aufgibt, will trotzdem sehen können, dass er sie ein halbes Jahr
 * lang gehalten hat.
 */
export async function gewohnheitArchivieren(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;
  const { supabase, userId } = await zugang();

  await supabase.from("habits").update({ archived: true })
    .eq("id", id).eq("user_id", userId);

  aktualisieren();
}
