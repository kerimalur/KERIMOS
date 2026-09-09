import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

/**
 * Zugang zum Gym-Projekt.
 *
 * Der Gym-Tracker liegt in einer eigenen Supabase-Datenbank mit eigener
 * Anmeldung. Ein in KerimOS angemeldeter Nutzer existiert dort nicht, kann
 * also auch keine Zeilen sehen. Deshalb greift KerimOS serverseitig mit einem
 * eigenen Schlüssel zu.
 *
 * WICHTIG: Diese Datei darf ausschliesslich in Server Components und Server
 * Actions verwendet werden. Die Variablen tragen bewusst kein NEXT_PUBLIC_ —
 * damit landet der Schlüssel nie im Browser.
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
 * Besitzer der Gym-Zeilen. Die Gym-Datenbank hat eine eigene Anmeldung, ein
 * KerimOS-Nutzer existiert dort nicht - deshalb muss die user_id von aussen
 * kommen. Bevorzugt aus GYM_USER_ID, sonst vom ersten vorhandenen
 * Trainingstag übernommen (Ein-Personen-Datenbank).
 */
export async function gymUserId(supabase: GymClient): Promise<string | null> {
  const ausEnv = process.env.GYM_USER_ID;
  if (ausEnv) return ausEnv;

  // Reihenfolge nach Wahrscheinlichkeit: Trainingstage gibt es fast sicher,
  // Gewichtseinträge nur, wenn schon mal etwas erfasst wurde.
  for (const tabelle of ["training_days", "workout_sessions", "body_weight_entries"]) {
    const { data } = await supabase.from(tabelle)
      .select("user_id").not("user_id", "is", null).limit(1);
    const id = data?.[0]?.user_id as string | undefined;
    if (id) return id;
  }
  return null;
}

/* ------------------------------------------------------------ Stammdaten */

export interface MuscleGroup {
  id: string;
  name: string;
  base_recovery_hours: number;
}

export interface GymExercise {
  id: string;
  name: string;
  description: string | null;
  primary_muscle_id: string;
  muscleName: string;
  /**
   * Muskelgruppen, die mitarbeiten, ohne die Hauptgruppe zu sein — beim
   * Bankdrücken Trizeps und Schultern. Stand seit jeher in der Datenbank und
   * wurde nirgends gelesen; die Analyse-Seite braucht sie, sonst sehen Arme
   * und Schultern unterversorgt aus, obwohl sie bei jedem Drücken mitgehen.
   */
  secondary_muscle_ids: string[];
  equipment_needed: string | null;
  is_cardio: boolean;
}

/**
 * Stammdaten-Cache.
 *
 * Muskelgruppen und Übungen sind Nachschlagetabellen: wenige Zeilen, die sich
 * höchstens beim Anlegen einer neuen Übung ändern. Ohne Cache holt jede Seite
 * sie erneut — und weil Vercel-Funktion und Datenbank in verschiedenen
 * Rechenzentren stehen, kostet jeder dieser Aufrufe eine volle Netzwerkrunde.
 * fetchExercises zieht zusätzlich fetchMuscleGroups nach, das schlägt also
 * doppelt zu.
 *
 * `revalidate` hält sie eine Stunde vor; `createExercise` und Verwandte rufen
 * ohnehin revalidatePath auf, das den Cache mitleert.
 */
const STAMMDATEN_TTL = 3600;

export const fetchMuscleGroups = unstable_cache(
  async (): Promise<MuscleGroup[]> => {
    const supabase = createGymClient();
    if (!supabase) return [];
    const { data } = await supabase.from("muscle_groups")
      .select("id, name, base_recovery_hours").order("name");
    return ((data ?? []) as unknown as MuscleGroup[]).map((m) => ({
      ...m, base_recovery_hours: Number(m.base_recovery_hours ?? 0),
    }));
  },
  ["gym-muscle-groups"],
  { revalidate: STAMMDATEN_TTL, tags: ["gym-stammdaten"] },
);

/**
 * Übungen samt Muskelgruppen-Namen. Bewusst zwei flache Abfragen statt eines
 * eingebetteten Joins - dasselbe Muster wie im Menüplan, weil PostgREST bei
 * Joins keinen ableitbaren Typ liefert.
 */
export const fetchExercises = unstable_cache(
  async (): Promise<GymExercise[]> => {
  const supabase = createGymClient();
  if (!supabase) return [];

  const [{ data: ex }, gruppen] = await Promise.all([
    supabase.from("exercises")
      .select("id, name, description, primary_muscle_id, secondary_muscle_ids, equipment_needed, is_cardio")
      .order("name"),
    fetchMuscleGroups(),
  ]);

  const namen = new Map(gruppen.map((g) => [g.id, g.name]));
  return (ex ?? []).map((e) => ({
    id: e.id as string,
    name: e.name as string,
    description: (e.description as string | null) ?? null,
    primary_muscle_id: e.primary_muscle_id as string,
    muscleName: namen.get(e.primary_muscle_id as string) ?? "Ohne Gruppe",
    secondary_muscle_ids: Array.isArray(e.secondary_muscle_ids)
      ? (e.secondary_muscle_ids as string[]) : [],
    equipment_needed: (e.equipment_needed as string | null) ?? null,
    is_cardio: Boolean(e.is_cardio),
  }));
  },
  ["gym-exercises-v2"],
  { revalidate: STAMMDATEN_TTL, tags: ["gym-stammdaten"] },
);

/* --------------------------------------------------------- Trainingstage */

/** Eine Übung innerhalb eines Trainingstags. */

/* -------------------------------------------------------------- Kalender */


/* ------------------------------------------------------- Erholung, Ziele */

/** Erholungsstand einer Muskelgruppe in Prozent (100 = vollständig erholt). */



/** Wochenziel. Fällt auf 4 zurück, solange nichts gesetzt ist. */

/* --------------------------------------------------------- Laufendes Training */

/** Eine Übung, wie sie während des Trainings auf dem Bildschirm steht. */


/* ------------------------------------------------------------- Verlauf */

export interface HistorySet {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number;
}

export interface HistoryCardio {
  id: string;
  exerciseName: string;
  durationMinutes: number;
  distanceKm: number | null;
}

export interface HistorySession {
  id: string;
  trainingDayName: string;
  startedAt: string;
  completedAt: string;
  sets: HistorySet[];
  cardio: HistoryCardio[];
  /** Gewicht × Wiederholungen über alle Sätze. */
  volumen: number;
  /** Woher die Einheit stammt - 'garmin' kommt von der Uhr. */
  logSource: string;
}

/** Abgeschlossene Einheiten samt Sätzen - die Grundlage der Verlauf-Seite. */
export async function fetchHistory(limit = 40): Promise<HistorySession[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const { data: sessions } = await supabase.from("workout_sessions")
    .select("id, training_day_id, started_at, completed_at, log_source")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false }).limit(limit);
  const liste = sessions ?? [];
  if (liste.length === 0) return [];

  const sessionIds = liste.map((s) => s.id as string);
  const tagIds = [...new Set(liste.map((s) => s.training_day_id as string))];

  const [{ data: tage }, { data: logs }, { data: cardio }, uebungen] = await Promise.all([
    supabase.from("training_days").select("id, name").in("id", tagIds),
    supabase.from("exercise_logs")
      .select("id, workout_session_id, exercise_id, set_number, weight_kg, reps, rir")
      .in("workout_session_id", sessionIds).order("set_number"),
    supabase.from("cardio_logs")
      .select("id, workout_session_id, exercise_id, duration_minutes, distance_km")
      .in("workout_session_id", sessionIds),
    fetchExercises(),
  ]);

  const tagName = new Map((tage ?? []).map((t) => [t.id as string, t.name as string]));
  const uebungName = new Map(uebungen.map((u) => [u.id, u.name]));

  const saetzeNachSession = new Map<string, HistorySet[]>();
  for (const l of logs ?? []) {
    const sid = l.workout_session_id as string;
    const list = saetzeNachSession.get(sid) ?? [];
    list.push({
      id: l.id as string,
      exerciseId: l.exercise_id as string,
      exerciseName: uebungName.get(l.exercise_id as string) ?? "Unbekannte Übung",
      setNumber: Number(l.set_number ?? 0),
      weightKg: Number(l.weight_kg ?? 0),
      reps: Number(l.reps ?? 0),
      rir: Number(l.rir ?? 0),
    });
    saetzeNachSession.set(sid, list);
  }

  const cardioNachSession = new Map<string, HistoryCardio[]>();
  for (const c of cardio ?? []) {
    const sid = c.workout_session_id as string;
    const list = cardioNachSession.get(sid) ?? [];
    list.push({
      id: c.id as string,
      exerciseName: uebungName.get(c.exercise_id as string) ?? "Cardio",
      durationMinutes: Number(c.duration_minutes ?? 0),
      distanceKm: c.distance_km === null ? null : Number(c.distance_km),
    });
    cardioNachSession.set(sid, list);
  }

  return liste.map((s) => {
    const sets = saetzeNachSession.get(s.id as string) ?? [];
    return {
      id: s.id as string,
      trainingDayName: tagName.get(s.training_day_id as string) ?? "Freies Training",
      startedAt: s.started_at as string,
      completedAt: s.completed_at as string,
      sets,
      cardio: cardioNachSession.get(s.id as string) ?? [],
      volumen: Math.round(sets.reduce((sum, x) => sum + x.weightKg * x.reps, 0)),
      logSource: (s.log_source as string | null) ?? "tracked",
    };
  });
}

/* ------------------------------------------------- Fortschritt pro Übung */

/** Gesamtzahlen für die Fortschritt-Seite. */


/** Eine Zeile aus v_exercise_progress: der schwerste Satz einer Einheit. */

/** Eine Zeile aus body_weight_entries. */
export interface BodyWeightEntry {
  entry_date: string;
  weight_kg: number;
}

