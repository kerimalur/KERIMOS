"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createGymClient, gymUserId, SCHNELL } from "@/lib/supabase/gym";
import {
  erlaubtesDatum, istSplit, zeitstempel, ausDatumUndZeit,
} from "@/lib/schnell-training";

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

/**
 * Eine Aktion ausführen und ihren Fehler als Text zurückgeben.
 *
 * Der Grund dafür steht in einem Screenshot vom 27.08.2026: ein Klick auf
 * „Pull" endete in „Da ist etwas schiefgegangen", und in der Konsole stand
 * nur *„The specific message is omitted in production builds"*. Eine
 * geworfene Ausnahme in einer Server-Aktion sagt im Betrieb nichts — die
 * Ursache liegt dann in den Vercel-Logs, also genau dort, wo man abends in
 * der Garderobe nicht nachschaut.
 *
 * Deshalb wird hier gefangen und die Meldung an die Seite gehängt. Ein
 * `redirect` ist auch ein Wurf (`NEXT_REDIRECT`) und darf deshalb NICHT im
 * Try stehen, sonst fängt dieser Block seine eigene Weiterleitung ab.
 */
async function versuche(tun: () => Promise<void>): Promise<string | null> {
  try {
    await tun();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Unbekannter Fehler";
  }
}

function neuLaden() {
  revalidatePath("/gym");
  revalidatePath("/gym/verlauf");
  revalidatePath("/");
}

/**
 * Den Trainingstag für einen Split finden — oder anlegen.
 *
 * **Warum nicht `fetchTrainingDays()`:** die Funktion liest alle Tage ohne
 * Nutzerfilter und zieht über `fetchExercises` zwei `unstable_cache`-Abfragen
 * nach. Für eine Aktion, die genau eine Zeile braucht, ist das der falsche
 * Weg — hier wird direkt und nutzergefiltert gefragt, wie es der
 * Garmin-Import auch tut.
 *
 * **Und warum angelegt statt abgebrochen:** ein Knopf, der mit „kein
 * Trainingstag gefunden" abbricht, ist für Kerim eine Sackgasse mitten in
 * der Garderobe. Der Garmin-Import legt sich seinen Tag ebenso selbst an.
 */
async function trainingstagFuer(
  gym: NonNullable<ReturnType<typeof createGymClient>>,
  userId: string, split: "push" | "pull",
): Promise<string> {
  const { data: tage, error } = await gym.from("training_days")
    .select("id, name").eq("user_id", userId);
  if (error) throw new Error(`Trainingstage lesen: ${error.message}`);

  const liste = (tage ?? []) as { id: string; name: string | null }[];
  const name = (t: { name: string | null }) => String(t.name ?? "").trim().toLowerCase();

  // Erst der genaue Name, dann einer, der ihn enthält („Pull A").
  const treffer = liste.find((t) => name(t) === split)
    ?? liste.find((t) => name(t).includes(split));
  if (treffer) return treffer.id;

  const { data: angelegt, error: neuFehler } = await gym.from("training_days")
    .insert({
      user_id: userId,
      name: split === "push" ? "Push" : "Pull",
      description: "Angetippt statt erfasst — keine Übungsliste",
    })
    .select("id").single();
  if (neuFehler || !angelegt) {
    throw new Error(`Trainingstag anlegen: ${neuFehler?.message ?? "unbekannt"}`);
  }
  return angelegt.id as string;
}

/**
 * Postgres-Meldungen, bei denen die Ursache eine Einrichtung ist.
 *
 * Der erste Versuch am 27.08.2026 scheiterte an
 * `workout_sessions_log_source_check` — die Spalte `log_source` hat eine
 * Prüfregel, und „schnell" stand nicht darin. Die rohe Meldung sagt das zwar,
 * aber nicht, was zu tun ist. Hier steht der Satz, mit dem Kerim weiterkommt,
 * statt eines Datenbankfehlers zum Nachschlagen.
 */
function alsKlartext(meldung: string): string {
  if (/log_source_check/.test(meldung)) {
    return "Die Spalte log_source lässt „schnell\" noch nicht zu. In der "
      + "Gym-Datenbank einmal die Prüfregel erweitern — die SQL steht auf "
      + "dieser Seite unter den Knöpfen.";
  }
  return `Einheit eintragen: ${meldung}`;
}

export async function schnellTraining(fd: FormData) {
  const split = String(fd.get("split") ?? "").trim().toLowerCase();
  if (!istSplit(split)) return;

  // Das Datum kommt aus dem Formular, damit „für gestern" möglich ist —
  // geprüft wird es in `erlaubtesDatum`, wo es sich testen lässt.
  const jetzt = new Date().toISOString();
  const heute = jetzt.slice(0, 10);
  const datum = erlaubtesDatum(fd.get("datum"), heute);

  // Uhrzeit nur, wenn eine mitkam. Ohne bleibt es beim bisherigen Verhalten:
  // heute die echte Uhrzeit, ein nachgetragener Tag mittags.
  const zeitFeld = String(fd.get("zeit") ?? "").trim();
  const wann = zeitFeld
    ? ausDatumUndZeit(datum, zeitFeld)
    : zeitstempel(datum, heute, jetzt);

  const fehler = await versuche(async () => {
    const { gym, userId } = await zugang();
    const tagId = await trainingstagFuer(gym, userId, split);

    const { error } = await gym.from("workout_sessions").insert({
      user_id: userId,
      training_day_id: tagId,
      started_at: wann,
      completed_at: wann,
      log_source: SCHNELL,
    });
    if (error) throw new Error(alsKlartext(error.message));
  });

  if (fehler) redirect(`/gym?fehler=${encodeURIComponent(fehler)}`);
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

  const fehler = await versuche(() => loesche(id));
  if (fehler) redirect(`/gym?fehler=${encodeURIComponent(fehler)}`);
  neuLaden();
}

async function loesche(id: string) {
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
}
