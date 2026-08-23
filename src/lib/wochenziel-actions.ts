"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions für die Wochenziele.
 *
 * Eigene Datei statt `actions.ts`: die dortige Sammlung ist auf über 130
 * Aktionen gewachsen, und Next bündelt eine `"use server"`-Datei als Einheit —
 * wer eine Aktion importiert, zieht alle mit.
 */

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Startseite und Rückblick zeigen dieselben Ziele. */
function zieleAktualisieren() {
  revalidatePath("/");
  revalidatePath("/rueckblick");
}

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht angemeldet.");
  return { supabase, userId };
}

export async function wochenzielAnlegen(fd: FormData) {
  const titel = txt(fd, "titel");
  const weekStart = txt(fd, "week_start");
  if (!titel || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return;

  const { supabase, userId } = await zugang();

  // Neue Ziele hängen sich hinten an. Reihenfolge zum Umsortieren gibt es
  // bewusst nicht: bei drei Zielen sortiert man nicht, man streicht.
  const { data: letzte } = await supabase
    .from("weekly_goals").select("sort_order")
    .eq("week_start", weekStart).order("sort_order", { ascending: false }).limit(1);
  const naechste = Number(
    ((letzte ?? []) as { sort_order: number }[])[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("weekly_goals").insert({
    user_id: userId, week_start: weekStart, title: titel, sort_order: naechste,
  });
  if (error) throw new Error(`Wochenziel anlegen: ${error.message}`);

  zieleAktualisieren();
}

/**
 * Abhaken und wieder öffnen. Der gewünschte Zustand kommt mit, statt ihn aus
 * der Datenbank zu lesen — so kann ein Doppelklick nichts durcheinanderbringen.
 */
export async function wochenzielAbhaken(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;
  const { supabase, userId } = await zugang();

  await supabase.from("weekly_goals")
    .update({ done_at: txt(fd, "done") ? new Date().toISOString() : null })
    .eq("id", id).eq("user_id", userId);

  zieleAktualisieren();
}

export async function wochenzielLoeschen(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;
  const { supabase, userId } = await zugang();

  await supabase.from("weekly_goals").delete().eq("id", id).eq("user_id", userId);
  zieleAktualisieren();
}
