"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createGymClient, gymUserId, fetchTrainingDays, SCHNELL } from "@/lib/supabase/gym";
import { erlaubtesDatum, istSplit, zeitstempel } from "@/lib/schnell-training";

/**
 * Push oder Pull mit einem Fingertipp.
 *
 * Kerims Ansage vom 24.08.2026: er weiss inzwischen, welche Übungen zu Push
 * und Pull gehören, und will sie nicht mehr einzeln erfassen. Die Einheit
 * soll trotzdem normal zählen — Wochenziel, Kalender, Serie.
 *
 * Deshalb wird eine **echte** `workout_sessions`-Zeile angelegt und nicht
 * irgendein Zähler: alles, was schon existiert (Wochenzählung, Verlauf,
 * Garmin-Abgleich), rechnet damit unverändert weiter. Der einzige
 * Unterschied steht in `log_source` — sie hat keine Sätze, taucht also in
 * keiner Fortschrittskurve auf. Das ist kein Mangel, sondern die Wahrheit:
 * ohne Gewichte gibt es nichts zu zeichnen.
 *
 * Eigene Datei statt `actions.ts`: Next lädt eine `"use server"`-Datei als
 * Ganzes, und `actions.ts` ist mit über hundert Aktionen der grösste Brocken.
 */

async function zugang() {
  const kerimos = await createClient();
  const { data: wer } = await kerimos.auth.getUser();
  if (!wer.user) throw new Error("Nicht angemeldet.");

  const gym = createGymClient();
  if (!gym) throw new Error("Gym-Zugang nicht eingerichtet");
  const userId = await gymUserId(gym);
  if (!userId) throw new Error("Gym: keine Nutzerzuordnung gefunden.");
  return { gym, userId };
}

function neuLaden() {
  revalidatePath("/gym");
  revalidatePath("/gym/verlauf");
  revalidatePath("/");
}

export async function schnellTraining(fd: FormData) {
  const split = String(fd.get("split") ?? "").trim().toLowerCase();
  if (!istSplit(split)) return;

  // Das Datum kommt aus dem Formular, damit „für gestern" möglich ist —
  // geprüft wird es in `erlaubtesDatum`, wo es sich testen lässt.
  const jetzt = new Date().toISOString();
  const heute = jetzt.slice(0, 10);
  const datum = erlaubtesDatum(fd.get("datum"), heute);

  const { gym, userId } = await zugang();

  const tage = await fetchTrainingDays();
  const tag = tage.find((t) => t.name.toLowerCase().includes(split));
  if (!tag) {
    throw new Error(
      `Kein Trainingstag gefunden, dessen Name „${split}" enthält. ` +
      "Unter Gym → Tage einen anlegen."
    );
  }

  const wann = zeitstempel(datum, heute, jetzt);

  const { error } = await gym.from("workout_sessions").insert({
    user_id: userId,
    training_day_id: tag.id,
    started_at: wann,
    completed_at: wann,
    log_source: SCHNELL,
  });
  if (error) throw new Error(`Einheit eintragen: ${error.message}`);

  neuLaden();
}

/**
 * Einen Fehltipp zurücknehmen.
 *
 * Gelöscht wird **nur**, was auch wirklich ein Fingertipp war: `log_source`
 * muss `"schnell"` sein UND es darf kein einziger Satz und kein Cardio-Eintrag
 * daranhängen. Beide Bedingungen, nicht eine — sonst reichte ein manipuliertes
 * Formularfeld, um eine echte, mühsam erfasste Einheit zu löschen. Ein
 * Rückgängig, das mehr löschen kann als es angelegt hat, ist kein Rückgängig.
 */
export async function schnellTrainingLoeschen(fd: FormData) {
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return;

  const { gym, userId } = await zugang();

  const { data: session } = await gym.from("workout_sessions")
    .select("id, log_source").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!session) return;
  if ((session as { log_source: string | null }).log_source !== SCHNELL) {
    throw new Error("Nur angetippte Einheiten lassen sich hier zurücknehmen.");
  }

  const [{ data: saetze }, { data: cardio }] = await Promise.all([
    gym.from("exercise_logs").select("id").eq("workout_session_id", id).limit(1),
    gym.from("cardio_logs").select("id").eq("workout_session_id", id).limit(1),
  ]);
  if ((saetze ?? []).length > 0 || (cardio ?? []).length > 0) {
    throw new Error("An dieser Einheit hängen Daten — sie wird nicht gelöscht.");
  }

  const { error } = await gym.from("workout_sessions")
    .delete().eq("id", id).eq("user_id", userId).eq("log_source", SCHNELL);
  if (error) throw new Error(`Zurücknehmen: ${error.message}`);

  neuLaden();
}
