"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createGymClient, gymUserId, fetchMuskelGrenzen } from "@/lib/supabase/gym";
import type { MuskelGrenzen } from "@/lib/supabase/gym";

/**
 * Eigene Satzgrenzen je Muskelgruppe.
 *
 * Gespeichert als JSON auf der einen `gym_settings`-Zeile. Eigene Tabelle
 * wäre sauberer und hier trotzdem falsch: elf Zeilen für einen Nutzer, die
 * sich fast nie ändern — das spart Tabelle, Policy und einen zweiten Zugriff.
 *
 * Eigene Datei statt `actions.ts`: Next lädt eine `"use server"`-Datei als
 * Ganzes, und `actions.ts` ist mit über hundert Aktionen der grösste Brocken.
 * In einer solchen Datei muss **jeder** Export eine async-Funktion sein —
 * eine exportierte Konstante lässt den Bau scheitern.
 */

const zahl = (fd: FormData, k: string) =>
  Math.round(Number(String(fd.get(k) ?? "").replace(",", ".")));

/**
 * Anmeldung prüfen und den Gym-Zugang holen.
 *
 * Angemeldet sein ist Pflicht, obwohl der Gym-Zugang mit dem Dienstschlüssel
 * läuft: sonst könnte jeder, der die Adresse kennt, die Grenzen verstellen.
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
 * Schreiben, ohne das Wochenziel zu überfahren.
 *
 * Ein Upsert mit `weekly_goal: 4` wäre der bequeme Weg und würde Kerims
 * eingestelltes Ziel bei jedem Speichern zurücksetzen — lautlos, weil das
 * Ziel auf einer ganz anderen Seite steht. Deshalb: erst versuchen zu
 * ändern; nur wenn es die Zeile noch gar nicht gibt, eine neue anlegen.
 */
async function schreibe(
  gym: NonNullable<ReturnType<typeof createGymClient>>,
  userId: string,
  ziele: MuskelGrenzen,
) {
  const { data, error } = await gym.from("gym_settings")
    .update({ muscle_targets: ziele, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw new Error(`Grenzen speichern: ${error.message}`);
  if (data && data.length > 0) return;

  const { error: neuFehler } = await gym.from("gym_settings").insert({
    user_id: userId, weekly_goal: 4, muscle_targets: ziele,
    updated_at: new Date().toISOString(),
  });
  if (neuFehler) throw new Error(`Grenzen anlegen: ${neuFehler.message}`);
}

export async function grenzeSetzen(fd: FormData) {
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return;
  const { gym, userId } = await zugang();

  const min = zahl(fd, "min");
  const max = zahl(fd, "max");

  const { grenzen } = await fetchMuskelGrenzen();
  const neu = { ...grenzen };

  // Unsinn wird nicht gespeichert, sondern räumt den Eintrag weg — dann gilt
  // wieder die Faustregel. Eine verdrehte Grenze (max <= min) würde eine
  // Gruppe sonst für immer als „über dem Rahmen" markieren.
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    delete neu[id];
  } else {
    neu[id] = { min, max };
  }

  await schreibe(gym, userId, neu);
  revalidatePath("/gym/analyse");
}

/** Alles zurück auf die Faustregel. */
export async function grenzenZuruecksetzen() {
  const { gym, userId } = await zugang();
  await schreibe(gym, userId, {});
  revalidatePath("/gym/analyse");
}
