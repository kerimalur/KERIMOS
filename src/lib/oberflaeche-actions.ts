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

/**
 * Nur die Felder schreiben, die das Formular überhaupt schickt.
 *
 * Design und Planung sind zwei getrennte Formulare auf zwei Seiten. Würde
 * jedes den ganzen Datensatz schreiben, setzte das Design-Formular die
 * Kalenderschalter still auf ihre Vorgabe zurück — ein Fehler, den man erst
 * bemerkt, wenn man zwei Seiten weiter ist.
 */
async function speichern(felder: Record<string, unknown>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht angemeldet.");

  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId, ...felder, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(`Einstellung speichern: ${error.message}`);

  // Die Farbe hängt am Layout und gilt damit überall — deshalb die Wurzel
  // und nicht nur die Einstellungsseite.
  revalidatePath("/", "layout");
}

/** Wie der Planungskalender aussieht. */
export async function planungAnsichtSpeichern(fd: FormData) {
  await speichern({
    planung_erledigte: txt(fd, "planung_erledigte") === "1",
    planung_gewohnheiten: txt(fd, "planung_gewohnheiten") === "1",
  });
}

export async function oberflaecheSpeichern(fd: FormData) {
  // Nur Töne aus der geprüften Liste. Ein durchgereichter Wert aus einem
  // veränderten Formular könnte sonst die Beschriftung auf Knöpfen
  // unlesbar machen — und das fällt erst zwei Seiten später auf.
  const gewaehlt = txt(fd, "akzent");

  await speichern({
    akzent: AKZENTE.some((a) => a.wert === gewaehlt)
      ? gewaehlt : STANDARD_OBERFLAECHE.akzent,
    ambient: txt(fd, "ambient") === "1",
  });
}
