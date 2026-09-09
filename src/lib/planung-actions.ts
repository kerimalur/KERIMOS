"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions für Projekte und Aufgaben.
 *
 * Eigene Datei statt `actions.ts`: Next bündelt eine `"use server"`-Datei als
 * Einheit — wer eine Aktion importiert, zieht alle mit.
 */

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const istDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Startseite und Planung zeigen dieselben Aufgaben. */
function aktualisieren() {
  revalidatePath("/");
  revalidatePath("/planung");
}

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht angemeldet.");
  return { supabase, userId };
}

/* ---------------------------------------------------------------- Projekte */

export async function projektAnlegen(fd: FormData) {
  const name = txt(fd, "name");
  if (!name) return;

  const { supabase, userId } = await zugang();

  const { data: letzte } = await supabase
    .from("planung_projects").select("sort_order")
    .order("sort_order", { ascending: false }).limit(1);
  const naechste = Number(
    ((letzte ?? []) as { sort_order: number }[])[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("planung_projects").insert({
    user_id: userId, name, color: txt(fd, "color") || "#9A8C74",
    sort_order: naechste,
  });
  if (error) throw new Error(`Projekt anlegen: ${error.message}`);

  aktualisieren();
}

export async function projektUmbenennen(fd: FormData) {
  const id = txt(fd, "id");
  const name = txt(fd, "name");
  if (!id || !name) return;

  const { supabase, userId } = await zugang();
  const { error } = await supabase.from("planung_projects")
    .update({ name, color: txt(fd, "color") || "#9A8C74" })
    .eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Projekt ändern: ${error.message}`);

  aktualisieren();
}

/**
 * Projekt löschen — die Aufgaben bleiben.
 *
 * Dafür sorgt `ON DELETE SET NULL` in der Migration, nicht dieser Code: eine
 * Regel im Schema gilt auch dann, wenn eine Zeile mal über den SQL-Editor
 * verschwindet. Die Aufgaben stehen danach unter „ohne Projekt".
 */
export async function projektLoeschen(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;

  const { supabase, userId } = await zugang();
  const { error } = await supabase.from("planung_projects")
    .delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Projekt löschen: ${error.message}`);

  aktualisieren();
}

/* ---------------------------------------------------------------- Aufgaben */

export async function aufgabeAnlegen(fd: FormData) {
  const name = txt(fd, "name");
  if (!name) return;

  const datum = txt(fd, "due_date");
  const projekt = txt(fd, "project_id");
  const { supabase, userId } = await zugang();

  const { error } = await supabase.from("planung_tasks").insert({
    user_id: userId,
    name,
    due_date: istDatum(datum) ? datum : null,
    project_id: projekt || null,
  });
  if (error) throw new Error(`Aufgabe anlegen: ${error.message}`);

  aktualisieren();
}

/**
 * Haken setzen oder wegnehmen.
 *
 * Der gewünschte Zustand kommt aus dem Formular, statt ihn hier zu lesen: so
 * kann ein doppelter Klick nichts umdrehen, was der erste gerade gesetzt hat.
 * `done_at` hält fest, wann — nicht für eine Auswertung, sondern damit die
 * erledigte Gruppe eine sinnvolle Reihenfolge hat.
 */
export async function aufgabeAbhaken(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;

  const erledigt = txt(fd, "done") === "1";
  const { supabase, userId } = await zugang();

  const { error } = await supabase.from("planung_tasks")
    .update({ done: erledigt, done_at: erledigt ? new Date().toISOString() : null })
    .eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Aufgabe abhaken: ${error.message}`);

  aktualisieren();
}

export async function aufgabeAendern(fd: FormData) {
  const id = txt(fd, "id");
  const name = txt(fd, "name");
  if (!id || !name) return;

  const datum = txt(fd, "due_date");
  const projekt = txt(fd, "project_id");
  const { supabase, userId } = await zugang();

  const { error } = await supabase.from("planung_tasks").update({
    name,
    due_date: istDatum(datum) ? datum : null,
    project_id: projekt || null,
  }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Aufgabe ändern: ${error.message}`);

  aktualisieren();
}

/**
 * Eine Aufgabe auf einen anderen Tag legen — das Ziel des Ziehens im Kalender.
 *
 * Eigene Aktion statt `aufgabeAendern` mit halbleerem Formular: dort müsste
 * der Kalender Name und Projekt mitschicken, die er gar nicht ändern will,
 * und ein vergessenes Feld würde still etwas überschreiben. Hier ist das
 * Datum das Einzige, was sich bewegen kann.
 *
 * Leeres `datum` nimmt den Termin weg — so zieht man eine Aufgabe aus dem
 * Kalender wieder heraus, ohne sie zu löschen.
 */
export async function aufgabeVerschieben(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;

  const datum = txt(fd, "datum");
  const { supabase, userId } = await zugang();

  const { error } = await supabase.from("planung_tasks")
    .update({ due_date: istDatum(datum) ? datum : null })
    .eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Aufgabe verschieben: ${error.message}`);

  aktualisieren();
}

export async function aufgabeLoeschen(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;

  const { supabase, userId } = await zugang();
  await supabase.from("planung_tasks").delete().eq("id", id).eq("user_id", userId);

  aktualisieren();
}

/** Räumt die erledigten Aufgaben weg — für den Frühjahrsputz. */
export async function erledigteAufraeumen() {
  const { supabase, userId } = await zugang();
  await supabase.from("planung_tasks").delete()
    .eq("user_id", userId).eq("done", true);

  aktualisieren();
}
