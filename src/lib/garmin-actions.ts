"use server";
import { revalidatePath } from "next/cache";
import { createGymClient } from "@/lib/supabase/gym";

/**
 * Server Actions für den Garmin-Bereich.
 *
 * Bewusst eine eigene Datei statt in actions.ts: der Garmin-Import ist ein
 * abgeschlossenes Thema und soll die gewachsene Sammlung dort nicht weiter
 * aufblähen.
 */

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Ordnet eine Garmin-Übung einer Übung aus `exercises` zu.
 *
 * `garminKey` kommt als "KATEGORIE" oder "KATEGORIE/NAME". Ohne Namensteil
 * wird '*' gespeichert - das gilt dann als Fallback für die ganze Kategorie.
 */
export async function saveGarminMapping(fd: FormData) {
  const garminKey = text(fd, "garminKey");
  const exerciseId = text(fd, "exerciseId");
  if (!garminKey || !exerciseId) return;

  const [kategorie, name] = garminKey.split("/");

  const supabase = createGymClient();
  if (!supabase) throw new Error("Gym-Datenbank nicht verbunden");

  const { error } = await supabase.from("garmin_exercise_map").upsert(
    {
      garmin_category: kategorie,
      garmin_name: name || "*",
      exercise_id: exerciseId,
    },
    { onConflict: "garmin_category,garmin_name" },
  );
  if (error) throw new Error(`Zuordnung speichern: ${error.message}`);

  revalidatePath("/gym/garmin");
}

export async function deleteGarminMapping(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createGymClient();
  if (!supabase) throw new Error("Gym-Datenbank nicht verbunden");

  const { error } = await supabase.from("garmin_exercise_map").delete().eq("id", id);
  if (error) throw new Error(`Zuordnung löschen: ${error.message}`);

  revalidatePath("/gym/garmin");
}

/**
 * Stösst den Sync von Hand an.
 *
 * Der Endpoint ist eine Python-Function und lebt ausserhalb von Next.js,
 * deshalb der Umweg über fetch. Das CRON_SECRET bleibt serverseitig - der
 * Browser sieht es nie.
 */
export async function triggerGarminSync(): Promise<string> {
  const basis = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

  const geheimnis = process.env.CRON_SECRET;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  const headers: Record<string, string> = {};
  if (geheimnis) headers.Authorization = `Bearer ${geheimnis}`;
  // Das Projekt steht hinter Vercel Authentication. Ohne diesen Header
  // antwortet Vercel dem eigenen Server mit der Login-Seite statt mit der
  // Function. Der Cron braucht ihn nicht - der läuft intern.
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  try {
    const antwort = await fetch(`${basis}/api/garmin-sync`, {
      headers,
      cache: "no-store",
    });

    const typ = antwort.headers.get("content-type") ?? "";
    if (!typ.includes("application/json")) {
      return bypass
        ? `Unerwartete Antwort (${antwort.status}) von ${basis} — kein JSON.`
        : "Vercel hat die Login-Seite geliefert statt den Sync. " +
          "In den Projekt-Einstellungen unter Deployment Protection " +
          "\"Protection Bypass for Automation\" aktivieren und neu deployen.";
    }

    const ergebnis = await antwort.json();

    revalidatePath("/gym/garmin");
    revalidatePath("/gym/verlauf");

    if (!ergebnis.ok) return `Fehler: ${ergebnis.fehler ?? "unbekannt"}`;

    const kern =
      `${ergebnis.gefunden} Krafttrainings gefunden, ${ergebnis.importiert} importiert, ` +
      `${ergebnis.uebersprungen} schon vorhanden.`;

    // Bei null Treffern hilft nur die Liste dessen, was tatsächlich da war.
    const typen: string[] = ergebnis.vorhandene_typen ?? [];
    if (ergebnis.gefunden === 0) {
      if (typen.length === 0) {
        return `${kern} Garmin hat für die letzten ${ergebnis.zeitraum_tage} Tage ` +
          `überhaupt keine Aktivität geliefert.`;
      }
      return `${kern} Vorhanden waren nur: ${typen.join(", ")}.`;
    }

    // Trainings da, aber keines übernommen: die Rohmeldung durchreichen,
    // sonst sieht man nur eine Null und weiss nicht warum.
    if (ergebnis.importiert === 0 && ergebnis.uebersprungen === 0) {
      return `${kern} Details: ${JSON.stringify(ergebnis.details)}`;
    }

    return kern;
  } catch (fehler) {
    return `Sync nicht erreichbar: ${fehler instanceof Error ? fehler.message : fehler}`;
  }
}
