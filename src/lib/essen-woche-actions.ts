"use server";
import { revalidatePath } from "next/cache";
import { createMenuClient } from "@/lib/supabase/menu";

/**
 * Trainingszeit eines Tages setzen oder löschen.
 *
 * Liegt in der Menü-Datenbank statt beim Gym: das Board braucht sie, um
 * Mahlzeiten davor und danach einzuordnen, und eine Abfrage über zwei
 * Datenbanken pro Seitenaufruf wäre der teurere Weg für eine Uhrzeit.
 * Was tatsächlich trainiert wurde, steht weiterhin im Gym-Bereich - hier
 * geht es um die Planung der Woche.
 */
export async function setzeTrainingszeit(fd: FormData) {
  const datum = String(fd.get("datum") ?? "").trim();
  if (!datum) return;

  const zeit = String(fd.get("zeit") ?? "").trim();
  const notiz = String(fd.get("notiz") ?? "").trim();

  const supabase = createMenuClient();
  if (!supabase) throw new Error("Menü-Datenbank nicht verbunden");

  if (!zeit) {
    // Leeres Feld heisst "kein Training an diesem Tag" - Zeile weg, statt
    // eine Zeile mit leerer Zeit stehen zu lassen.
    const { error } = await supabase.from("day_training").delete().eq("date", datum);
    if (error) throw new Error(`Training löschen: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("day_training")
      .upsert({ date: datum, start_time: zeit, note: notiz || null }, { onConflict: "date" });
    if (error) throw new Error(`Training speichern: ${error.message}`);
  }

  revalidatePath("/m/Essen");
}
