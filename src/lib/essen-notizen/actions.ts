"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Notiz eines Tages speichern. Leerer Text löscht die Zeile — ein Tag ohne
 * Notiz soll im Kalender auch wieder leer aussehen.
 */
export async function essenNotizSpeichern(datum: string, text: string): Promise<string | null> {
  if (!ISO.test(datum)) return "Ungültiges Datum.";
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return "Nicht angemeldet.";

  const inhalt = text.slice(0, 10_000);
  const { error } = inhalt.trim()
    ? await supabase.from("essen_notizen").upsert(
        { user_id: data.user.id, datum, text: inhalt, aktualisiert: new Date().toISOString() },
        { onConflict: "user_id,datum" })
    : await supabase.from("essen_notizen").delete().eq("user_id", data.user.id).eq("datum", datum);

  revalidatePath("/m/Essen");
  return error ? error.message : null;
}
