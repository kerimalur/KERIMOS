"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { heuteISO } from "@/lib/time";

/**
 * Server Actions für die Gewohnheiten.
 *
 * Eigene Datei statt `actions.ts`: Next bündelt eine `"use server"`-Datei als
 * Einheit — wer eine Aktion importiert, zieht alle mit, und die dortige
 * Sammlung ist auf über 130 Aktionen gewachsen.
 */

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Startseite, Gewohnheiten-Seite und Gym zeigen dieselben Haken. */
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

/**
 * Den Haken für einen Tag setzen oder wegnehmen.
 *
 * Der gewünschte Zustand kommt aus dem Formular, statt ihn hier aus der
 * Datenbank zu lesen: so kann ein doppelter Klick nichts umdrehen, was der
 * erste gerade gesetzt hat.
 *
 * Ohne `datum` gilt heute. Der Nachtrag für einen vergangenen Tag schickt das
 * Datum mit — man merkt am Mittwoch, dass Montag fehlt.
 */
export async function gewohnheitAbhaken(fd: FormData) {
  const habitId = txt(fd, "id");
  if (!habitId) return;
  const datum = txt(fd, "datum") || heuteISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return;

  const { supabase, userId } = await zugang();

  if (txt(fd, "getan")) {
    // upsert statt insert: ein zweiter Klick auf denselben Tag ist kein
    // Fehler, sondern dieselbe Aussage.
    const { error } = await supabase.from("habit_entries").upsert(
      { habit_id: habitId, user_id: userId, entry_date: datum },
      { onConflict: "habit_id,entry_date" },
    );
    if (error) throw new Error(`Gewohnheit abhaken: ${error.message}`);
  } else {
    await supabase.from("habit_entries").delete()
      .eq("habit_id", habitId).eq("entry_date", datum).eq("user_id", userId);
  }

  aktualisieren();
}

export async function gewohnheitAnlegen(fd: FormData) {
  const name = txt(fd, "name");
  if (!name) return;

  const { supabase, userId } = await zugang();

  // Neue Gewohnheiten hängen sich hinten an.
  const { data: letzte } = await supabase
    .from("habits").select("sort_order")
    .order("sort_order", { ascending: false }).limit(1);
  const naechste = Number(
    ((letzte ?? []) as { sort_order: number }[])[0]?.sort_order ?? 0) + 1;

  const ziel = Number(txt(fd, "ziel_pro_woche"));
  const { error } = await supabase.from("habits").insert({
    user_id: userId,
    name,
    icon: txt(fd, "icon") || null,
    color: txt(fd, "color") || "#9A8C74",
    ziel_pro_woche: Number.isFinite(ziel) ? Math.min(Math.max(ziel, 0), 7) : 0,
    bereich: txt(fd, "bereich") || "allgemein",
    sort_order: naechste,
  });
  if (error) throw new Error(`Gewohnheit anlegen: ${error.message}`);

  aktualisieren();
}

export async function gewohnheitAendern(fd: FormData) {
  const id = txt(fd, "id");
  const name = txt(fd, "name");
  if (!id || !name) return;

  const { supabase, userId } = await zugang();
  const ziel = Number(txt(fd, "ziel_pro_woche"));

  const { error } = await supabase.from("habits").update({
    name,
    icon: txt(fd, "icon") || null,
    color: txt(fd, "color") || "#9A8C74",
    ziel_pro_woche: Number.isFinite(ziel) ? Math.min(Math.max(ziel, 0), 7) : 0,
    bereich: txt(fd, "bereich") || "allgemein",
  }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Gewohnheit ändern: ${error.message}`);

  aktualisieren();
}

/**
 * Archivieren, nicht löschen: die abgehakten Tage bleiben stehen. Wer eine
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
