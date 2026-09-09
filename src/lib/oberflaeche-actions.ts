"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AKZENTE, STANDARD_OBERFLAECHE } from "@/lib/oberflaeche";

/**
 * Server Action für die Oberflächen-Einstellungen.
 *
 * Eigene Datei statt `actions.ts`: Next bündelt eine `"use server"`-Datei als
 * Einheit — wer eine Aktion importiert, zieht alle mit.
 */

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function oberflaecheSpeichern(fd: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht angemeldet.");

  // Nur Töne aus der geprüften Liste. Ein durchgereichter Wert aus einem
  // veränderten Formular könnte sonst die Beschriftung auf Knöpfen
  // unlesbar machen — und das fällt erst zwei Seiten später auf.
  const gewaehlt = txt(fd, "akzent");
  const akzent = AKZENTE.some((a) => a.wert === gewaehlt)
    ? gewaehlt : STANDARD_OBERFLAECHE.akzent;

  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    akzent,
    ambient: txt(fd, "ambient") === "1",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(`Oberfläche speichern: ${error.message}`);

  // Die Farbe hängt am Layout und gilt damit überall — deshalb die Wurzel
  // und nicht nur die Einstellungsseite.
  revalidatePath("/", "layout");
}
