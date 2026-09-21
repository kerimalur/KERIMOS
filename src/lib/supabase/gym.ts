import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Zugang zur Gym-Datenbank (Supabase-Projekt „Gymapp Cursor").
 *
 * Der Gym-Bereich ist seit 09.09.2026 aus KerimOS raus. Seit 21.09.2026 liest
 * und schreibt der Bereich „Woche" hier wieder genau eine Tabelle: das
 * Körpergewicht (`body_weight_entries`). Dort liegt der ganze bisherige
 * Verlauf, und Claude trägt Werte aus dem Chat ebenfalls dort ein.
 *
 * Die Menüplan-Tabellen liegen im selben Projekt; lib/supabase/menu.ts hat
 * dafür seinen eigenen Zugang mit denselben Variablen.
 *
 * Trainings-Tabellen (workout_sessions, exercise_logs, …) bleiben unberührt
 * in der Datenbank stehen, werden aber nicht mehr gelesen.
 *
 * WICHTIG: nur serverseitig verwenden. Die Variablen tragen bewusst kein
 * NEXT_PUBLIC_ — der Schlüssel landet nie im Browser.
 */
export function createGymClient() {
  const url = process.env.GYM_SUPABASE_URL;
  const key = process.env.GYM_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Ist der Zugang überhaupt eingerichtet? */
export function gymConfigured(): boolean {
  return Boolean(process.env.GYM_SUPABASE_URL && process.env.GYM_SUPABASE_SERVICE_ROLE_KEY);
}

type GymClient = NonNullable<ReturnType<typeof createGymClient>>;

/**
 * Besitzer der Zeilen. Die Gym-Datenbank hat eine eigene Anmeldung, ein
 * KerimOS-Nutzer existiert dort nicht — deshalb kommt die user_id von aussen:
 * bevorzugt aus GYM_USER_ID, sonst vom ersten vorhandenen Gewichtseintrag
 * (Ein-Personen-Datenbank).
 */
export async function gymUserId(supabase: GymClient): Promise<string | null> {
  const ausEnv = process.env.GYM_USER_ID;
  if (ausEnv) return ausEnv;

  for (const tabelle of ["body_weight_entries", "training_days"]) {
    const { data } = await supabase.from(tabelle)
      .select("user_id").not("user_id", "is", null).limit(1);
    const id = data?.[0]?.user_id as string | undefined;
    if (id) return id;
  }
  return null;
}
