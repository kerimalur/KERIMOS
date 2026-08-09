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
      .select("id, name, description, primary_muscle_id, equipment_needed, is_cardio")
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
    equipment_needed: (e.equipment_needed as string | null) ?? null,
    is_cardio: Boolean(e.is_cardio),
  }));
  },
  ["gym-exercises"],
  { revalidate: STAMMDATEN_TTL, tags: ["gym-stammdaten"] },
);

/* --------------------------------------------------------- Trainingstage */

/** Eine Übung innerhalb eines Trainingstags. */
export interface TrainingDayExercise {
  id: string;
  exercise_id: string;
  exerciseName: string;
  muscleName: string;
  is_cardio: boolean;
  order_index: number;
  target_sets: number | null;
  target_reps: string | null;
}

export interface TrainingDay {
  id: string;
  name: string;
  description: string | null;
  exercises: TrainingDayExercise[];
  /** Muskelgruppen, die dieser Tag abdeckt - für die Kurzanzeige. */
  muscles: string[];
}

export async function fetchTrainingDays(): Promise<TrainingDay[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const { data: tage } = await supabase.from("training_days")
    .select("id, name, description").order("created_at", { ascending: false });
  const liste = tage ?? [];
  if (liste.length === 0) return [];

  const { data: zuordnungen } = await supabase.from("training_day_exercises")
    .select("id, training_day_id, exercise_id, order_index, target_sets, target_reps")
    .in("training_day_id", liste.map((t) => t.id as string))
    .order("order_index");

  const uebungen = await fetchExercises();
  const byId = new Map(uebungen.map((u) => [u.id, u]));

  const nachTag = new Map<string, TrainingDayExercise[]>();
  for (const z of zuordnungen ?? []) {
    const u = byId.get(z.exercise_id as string);
    const list = nachTag.get(z.training_day_id as string) ?? [];
    list.push({
      id: z.id as string,
      exercise_id: z.exercise_id as string,
      exerciseName: u?.name ?? "Unbekannte Übung",
      muscleName: u?.muscleName ?? "Ohne Gruppe",
      is_cardio: u?.is_cardio ?? false,
      order_index: Number(z.order_index ?? 0),
      target_sets: z.target_sets === null ? null : Number(z.target_sets),
      target_reps: (z.target_reps as string | null) ?? null,
    });
    nachTag.set(z.training_day_id as string, list);
  }

  return liste.map((t) => {
    const exercises = nachTag.get(t.id as string) ?? [];
    return {
      id: t.id as string,
      name: t.name as string,
      description: (t.description as string | null) ?? null,
      exercises,
      muscles: [...new Set(exercises.map((e) => e.muscleName))],
    };
  });
}

/* -------------------------------------------------------------- Kalender */

export interface GymCalendarEntry {
  id: string;
  training_day_id: string;
  trainingDayName: string;
  scheduled_date: string;
  status: string;
  /** Läuft für diesen Eintrag bereits eine unbeendete Einheit? */
  offeneSessionId: string | null;
}

/**
 * Geplante Trainings ab einem Datum. Enthält auch die Information, ob schon
 * eine Einheit läuft - dann führt der Knopf dorthin zurück, statt eine
 * zweite Einheit anzulegen.
 */
export async function fetchCalendarEntries(
  von: string, bis?: string
): Promise<GymCalendarEntry[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  let q = supabase.from("calendar_entries")
    .select("id, training_day_id, scheduled_date, status")
    .gte("scheduled_date", von).order("scheduled_date");
  if (bis) q = q.lte("scheduled_date", bis);

  const { data: eintraege } = await q;
  const liste = eintraege ?? [];
  if (liste.length === 0) return [];

  const tagIds = [...new Set(liste.map((e) => e.training_day_id as string))];
  const namen = new Map<string, string>();
  if (tagIds.length > 0) {
    const { data: tage } = await supabase.from("training_days")
      .select("id, name").in("id", tagIds);
    for (const t of tage ?? []) namen.set(t.id as string, t.name as string);
  }

  // Unbeendete Einheiten - eine angefangene soll man fortsetzen, nicht doppeln
  const { data: offene } = await supabase.from("workout_sessions")
    .select("id, calendar_entry_id")
    .is("completed_at", null)
    .in("calendar_entry_id", liste.map((e) => e.id as string));
  const sessionNachEintrag = new Map<string, string>();
  for (const s of offene ?? []) {
    const ce = s.calendar_entry_id as string | null;
    if (ce) sessionNachEintrag.set(ce, s.id as string);
  }

  return liste.map((e) => ({
    id: e.id as string,
    training_day_id: e.training_day_id as string,
    trainingDayName: namen.get(e.training_day_id as string) ?? "Unbekannter Tag",
    scheduled_date: e.scheduled_date as string,
    status: e.status as string,
    offeneSessionId: sessionNachEintrag.get(e.id as string) ?? null,
  }));
}

/* ------------------------------------------------------- Erholung, Ziele */

/** Erholungsstand einer Muskelgruppe in Prozent (100 = vollständig erholt). */
export interface MuscleRecovery {
  id: string;
  name: string;
  pct: number;
}

/**
 * Rechnet aus den Einträgen in recovery_status, wie weit jede Muskelgruppe
 * erholt ist. Massgeblich ist die noch laufende Erholung mit dem tiefsten
 * Stand - zwei harte Einheiten kurz nacheinander summieren sich nicht, aber
 * die jüngere zählt.
 */
export async function fetchRecovery(): Promise<MuscleRecovery[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const [{ data: zeilen }, gruppen] = await Promise.all([
    supabase.from("recovery_status")
      .select("muscle_group_id, total_recovery_hours, workout_completed_at")
      .order("workout_completed_at", { ascending: false }),
    fetchMuscleGroups(),
  ]);

  const jetzt = Date.now();
  const proGruppe = new Map<string, number>();
  for (const r of zeilen ?? []) {
    const stunden = Number(r.total_recovery_hours ?? 0);
    if (stunden <= 0) continue;
    const vergangen =
      (jetzt - new Date(r.workout_completed_at as string).getTime()) / 3_600_000;
    const pct = Math.min(100, Math.round((vergangen / stunden) * 100));
    if (pct >= 100) continue;
    const id = r.muscle_group_id as string;
    const bisher = proGruppe.get(id);
    if (bisher === undefined || pct < bisher) proGruppe.set(id, pct);
  }

  return gruppen.map((g) => ({
    id: g.id, name: g.name, pct: proGruppe.get(g.id) ?? 100,
  }));
}

/**
 * Sätze und letzter Trainingstag je Muskelgruppe über die letzten Wochen -
 * die Grundlage der Muskelbalance.
 */
export interface MuscleLoad {
  id: string;
  name: string;
  sets: number;
  lastTrainedAt: string | null;
}

export async function fetchMuscleBalance(tage = 28): Promise<MuscleLoad[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const seit = new Date(Date.now() - tage * 86400000).toISOString();

  const [{ data: sessions }, uebungen, gruppen] = await Promise.all([
    supabase.from("workout_sessions")
      .select("id, completed_at").not("completed_at", "is", null)
      .gte("completed_at", seit),
    fetchExercises(),
    fetchMuscleGroups(),
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  const abschluss = new Map(
    (sessions ?? []).map((s) => [s.id as string, s.completed_at as string])
  );
  const muskelZuUebung = new Map(uebungen.map((u) => [u.id, u.primary_muscle_id]));

  const saetze = new Map<string, number>();
  const zuletzt = new Map<string, string>();

  for (let i = 0; i < sessionIds.length; i += 100) {
    const { data: logs } = await supabase.from("exercise_logs")
      .select("exercise_id, workout_session_id")
      .in("workout_session_id", sessionIds.slice(i, i + 100));
    for (const l of logs ?? []) {
      const muskel = muskelZuUebung.get(l.exercise_id as string);
      if (!muskel) continue;
      saetze.set(muskel, (saetze.get(muskel) ?? 0) + 1);
      const wann = abschluss.get(l.workout_session_id as string);
      const bisher = zuletzt.get(muskel);
      if (wann && (!bisher || wann > bisher)) zuletzt.set(muskel, wann);
    }
  }

  return gruppen
    .map((g) => ({
      id: g.id, name: g.name,
      sets: saetze.get(g.id) ?? 0,
      lastTrainedAt: zuletzt.get(g.id) ?? null,
    }))
    .sort((a, b) => b.sets - a.sets);
}

/** Wochenziel. Fällt auf 4 zurück, solange nichts gesetzt ist. */
export async function fetchWeeklyGoal(): Promise<number> {
  const supabase = createGymClient();
  if (!supabase) return 4;

  // maybeSingle statt single: ohne Zeile ist das kein Fehler, sondern der
  // Normalfall vor der ersten Einstellung.
  const { data } = await supabase.from("gym_settings")
    .select("weekly_goal").limit(1).maybeSingle();
  const wert = Number(data?.weekly_goal ?? 0);
  return wert >= 1 && wert <= 14 ? wert : 4;
}

/* --------------------------------------------------------- Laufendes Training */

/** Eine Übung, wie sie während des Trainings auf dem Bildschirm steht. */
export interface WorkoutExercise {
  exerciseId: string;
  exerciseName: string;
  muscleGroupId: string;
  muscleGroupName: string;
  baseRecoveryHours: number;
  isCardio: boolean;
  targetSets: number;
  targetReps: string;
  /** Die Sätze der letzten Einheit derselben Übung - als Orientierung. */
  lastSets: { weightKg: number; reps: number; rir: number }[];
}

export interface WorkoutView {
  sessionId: string;
  trainingDayId: string;
  trainingDayName: string;
  calendarEntryId: string | null;
  startedAt: string;
  /** Gesetzt heisst: diese Einheit ist bereits abgeschlossen. */
  completedAt: string | null;
  exercises: WorkoutExercise[];
}

/**
 * Alles, was die Workout-Seite braucht, in einem Rutsch.
 *
 * Die letzten Werte je Übung sind der eigentliche Kniff: ohne sie müsste man
 * jedes Mal überlegen, mit wie viel Gewicht man letztes Mal gearbeitet hat.
 */
export async function fetchWorkoutSession(sessionId: string): Promise<WorkoutView | null> {
  const supabase = createGymClient();
  if (!supabase) return null;

  const { data: session } = await supabase.from("workout_sessions")
    .select("id, training_day_id, calendar_entry_id, started_at, completed_at")
    .eq("id", sessionId).maybeSingle();
  if (!session) return null;

  const trainingDayId = session.training_day_id as string;

  const [{ data: tag }, { data: zuordnungen }, uebungen, gruppen] = await Promise.all([
    supabase.from("training_days").select("name").eq("id", trainingDayId).maybeSingle(),
    supabase.from("training_day_exercises")
      .select("exercise_id, order_index, target_sets, target_reps")
      .eq("training_day_id", trainingDayId).order("order_index"),
    fetchExercises(),
    fetchMuscleGroups(),
  ]);

  const uebungById = new Map(uebungen.map((u) => [u.id, u]));
  const gruppeById = new Map(gruppen.map((g) => [g.id, g]));
  const exerciseIds = (zuordnungen ?? []).map((z) => z.exercise_id as string);

  // Letzte Sätze je Übung: die jüngste abgeschlossene Einheit gewinnt.
  const letzte = new Map<string, { weightKg: number; reps: number; rir: number }[]>();
  if (exerciseIds.length > 0) {
    const { data: fertige } = await supabase.from("workout_sessions")
      .select("id, completed_at").not("completed_at", "is", null)
      .neq("id", sessionId)
      .order("completed_at", { ascending: false }).limit(60);
    const reihenfolge = (fertige ?? []).map((s) => s.id as string);

    if (reihenfolge.length > 0) {
      const rang = new Map(reihenfolge.map((id, i) => [id, i]));
      const { data: logs } = await supabase.from("exercise_logs")
        .select("exercise_id, workout_session_id, set_number, weight_kg, reps, rir")
        .in("exercise_id", exerciseIds)
        .in("workout_session_id", reihenfolge);

      // Je Übung nur die Sätze aus der jüngsten Einheit behalten
      const besteSession = new Map<string, string>();
      for (const l of logs ?? []) {
        const ex = l.exercise_id as string;
        const sess = l.workout_session_id as string;
        const bisher = besteSession.get(ex);
        if (bisher === undefined || (rang.get(sess) ?? 99) < (rang.get(bisher) ?? 99)) {
          besteSession.set(ex, sess);
        }
      }
      const gesammelt = new Map<string, { nr: number; w: number; r: number; rir: number }[]>();
      for (const l of logs ?? []) {
        const ex = l.exercise_id as string;
        if (besteSession.get(ex) !== (l.workout_session_id as string)) continue;
        const list = gesammelt.get(ex) ?? [];
        list.push({
          nr: Number(l.set_number ?? 0),
          w: Number(l.weight_kg ?? 0),
          r: Number(l.reps ?? 0),
          rir: Number(l.rir ?? 2),
        });
        gesammelt.set(ex, list);
      }
      for (const [ex, list] of gesammelt) {
        letzte.set(ex, list.sort((a, b) => a.nr - b.nr)
          .map((s) => ({ weightKg: s.w, reps: s.r, rir: s.rir })));
      }
    }
  }

  const exercises: WorkoutExercise[] = (zuordnungen ?? []).map((z) => {
    const u = uebungById.get(z.exercise_id as string);
    const g = u ? gruppeById.get(u.primary_muscle_id) : undefined;
    return {
      exerciseId: z.exercise_id as string,
      exerciseName: u?.name ?? "Unbekannte Übung",
      muscleGroupId: u?.primary_muscle_id ?? "",
      muscleGroupName: g?.name ?? "Ohne Gruppe",
      baseRecoveryHours: g?.base_recovery_hours ?? 48,
      isCardio: u?.is_cardio ?? false,
      targetSets: Math.max(1, Number(z.target_sets ?? 3)),
      targetReps: (z.target_reps as string | null) ?? "8-12",
      lastSets: letzte.get(z.exercise_id as string) ?? [],
    };
  });

  return {
    sessionId: session.id as string,
    trainingDayId,
    trainingDayName: (tag?.name as string | undefined) ?? "Training",
    calendarEntryId: (session.calendar_entry_id as string | null) ?? null,
    startedAt: session.started_at as string,
    completedAt: (session.completed_at as string | null) ?? null,
    exercises,
  };
}

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

export interface ExercisePoint {
  day: string;
  maxWeight: number;
  /** Geschätztes Einmalmaximum nach Epley: Gewicht × (1 + Wdh / 30). */
  oneRM: number;
  avgRIR: number | null;
  durationMin: number;
  distanceKm: number | null;
}

/**
 * Verlauf einer einzelnen Übung. Je Trainingstag der schwerste Satz - das
 * ist die Zahl, an der Fortschritt sichtbar wird.
 *
 * `wochen = 0` heisst: alles, was da ist.
 */
export async function fetchExerciseHistory(
  exerciseId: string, wochen: number, istCardio: boolean
): Promise<ExercisePoint[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  let q = supabase.from("workout_sessions")
    .select("id, completed_at").not("completed_at", "is", null);
  if (wochen > 0) {
    q = q.gte("completed_at", new Date(Date.now() - wochen * 7 * 86400000).toISOString());
  }
  const { data: sessions } = await q;
  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  if (sessionIds.length === 0) return [];

  const tagVonSession = new Map(
    (sessions ?? []).map((s) => [
      s.id as string, (s.completed_at as string).slice(0, 10),
    ])
  );

  const nachTag = new Map<string, ExercisePoint>();

  if (istCardio) {
    const { data: logs } = await supabase.from("cardio_logs")
      .select("workout_session_id, duration_minutes, distance_km")
      .eq("exercise_id", exerciseId).in("workout_session_id", sessionIds);

    for (const l of logs ?? []) {
      const tag = tagVonSession.get(l.workout_session_id as string);
      if (!tag) continue;
      const p = nachTag.get(tag) ?? leererPunkt(tag);
      p.durationMin += Number(l.duration_minutes ?? 0);
      const km = l.distance_km === null ? null : Number(l.distance_km);
      if (km !== null) p.distanceKm = (p.distanceKm ?? 0) + km;
      nachTag.set(tag, p);
    }
  } else {
    const { data: logs } = await supabase.from("exercise_logs")
      .select("workout_session_id, weight_kg, reps, rir")
      .eq("exercise_id", exerciseId).in("workout_session_id", sessionIds);

    const rirSumme = new Map<string, { summe: number; anzahl: number }>();
    for (const l of logs ?? []) {
      const tag = tagVonSession.get(l.workout_session_id as string);
      if (!tag) continue;
      const gewicht = Number(l.weight_kg ?? 0);
      const wdh = Number(l.reps ?? 0);
      const p = nachTag.get(tag) ?? leererPunkt(tag);
      p.maxWeight = Math.max(p.maxWeight, gewicht);
      p.oneRM = Math.max(p.oneRM, wdh > 0 ? gewicht * (1 + wdh / 30) : gewicht);
      nachTag.set(tag, p);

      const r = rirSumme.get(tag) ?? { summe: 0, anzahl: 0 };
      r.summe += Number(l.rir ?? 0);
      r.anzahl += 1;
      rirSumme.set(tag, r);
    }
    for (const [tag, r] of rirSumme) {
      const p = nachTag.get(tag);
      if (p && r.anzahl > 0) p.avgRIR = Math.round((r.summe / r.anzahl) * 10) / 10;
    }
  }

  return [...nachTag.values()]
    .map((p) => ({
      ...p,
      maxWeight: Math.round(p.maxWeight * 10) / 10,
      oneRM: Math.round(p.oneRM * 10) / 10,
      distanceKm: p.distanceKm === null ? null : Math.round(p.distanceKm * 10) / 10,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

const leererPunkt = (day: string): ExercisePoint => ({
  day, maxWeight: 0, oneRM: 0, avgRIR: null, durationMin: 0, distanceKm: null,
});

/** Gesamtzahlen für die Fortschritt-Seite. */
export async function fetchGymTotals(): Promise<{
  einheiten: number; saetze: number; volumen: number;
}> {
  const supabase = createGymClient();
  if (!supabase) return { einheiten: 0, saetze: 0, volumen: 0 };

  const [{ count: einheiten }, { data: logs }] = await Promise.all([
    supabase.from("workout_sessions")
      .select("id", { count: "exact", head: true }).not("completed_at", "is", null),
    supabase.from("exercise_logs").select("weight_kg, reps").limit(20000),
  ]);

  const zeilen = logs ?? [];
  return {
    einheiten: einheiten ?? 0,
    saetze: zeilen.length,
    volumen: Math.round(
      zeilen.reduce((s, l) => s + Number(l.weight_kg ?? 0) * Number(l.reps ?? 0), 0)
    ),
  };
}

/** Abgeschlossene Einheiten seit einem Datum - zum Abgleich mit dem Wochenziel. */
export async function countSessionsSince(von: string): Promise<number> {
  const supabase = createGymClient();
  if (!supabase) return 0;
  const { count } = await supabase.from("workout_sessions")
    .select("id", { count: "exact", head: true })
    .not("completed_at", "is", null)
    .gte("completed_at", von + "T00:00:00");
  return count ?? 0;
}

/**
 * Abgeschlossene Einheiten seit einem Datum, aufgeteilt in Kraft und Ausdauer.
 *
 * Eine Session zählt als Ausdauer, wenn sie mindestens einen cardio_logs-
 * Eintrag hat - genau so schreibt der Garmin-Sync automatisch importierte
 * Läufe, Velofahrten etc. hinein (siehe api/garmin-sync.py). Alles andere
 * zählt als Kraft, auch eine Session ganz ohne Logs (z. B. gestartet, aber
 * noch nichts erfasst) - das entspricht dem bisherigen Verhalten von
 * `countSessionsSince`.
 */
export async function countWeeklyTrainingBreakdown(
  von: string
): Promise<{ kraft: number; ausdauer: number }> {
  const supabase = createGymClient();
  if (!supabase) return { kraft: 0, ausdauer: 0 };

  const { data: sessions } = await supabase.from("workout_sessions")
    .select("id")
    .not("completed_at", "is", null)
    .gte("completed_at", von + "T00:00:00");
  const ids = (sessions ?? []).map((s) => s.id as string);
  if (ids.length === 0) return { kraft: 0, ausdauer: 0 };

  const { data: cardio } = await supabase.from("cardio_logs")
    .select("workout_session_id").in("workout_session_id", ids);
  const ausdauerIds = new Set((cardio ?? []).map((c) => c.workout_session_id as string));

  return {
    kraft: ids.length - ausdauerIds.size,
    ausdauer: ausdauerIds.size,
  };
}

export interface WeeklySteps {
  /** Summe der Schritte von Wochenbeginn bis einschliesslich `bis`. */
  total: number;
  /** Wochenziel = Tagesziel × 7 - konsistent mit Kraft/Ausdauer, die auch
   *  Wochensummen gegen ein Wochenziel zeigen, nicht Tageswerte gegen ein
   *  Tagesziel. */
  ziel: number;
}

const STANDARD_SCHRITTE_ZIEL = 10000;

/**
 * Schritte der laufenden Woche gegen das Wochenziel (Tagesziel × 7).
 *
 * Tage, die die Uhr noch nicht synchronisiert hat, tragen 0 bei - das ist
 * gewollt: die Woche ist noch nicht vorbei, "70'000 Ziel" bleibt so lange
 * unerreicht, bis wirklich genug Tage etwas beigetragen haben.
 */
export async function fetchWeeklySteps(von: string, bis: string): Promise<WeeklySteps | null> {
  const supabase = createGymClient();
  if (!supabase) return null;

  const { data } = await supabase.from("garmin_daily")
    .select("schritte, schritte_ziel")
    .gte("datum", von).lte("datum", bis)
    .order("datum", { ascending: false });

  const zeilen = data ?? [];
  if (zeilen.length === 0) return null;

  const total = zeilen.reduce((s, z) => s + Number(z.schritte ?? 0), 0);
  const tagesZiel = zeilen.find((z) => Number(z.schritte_ziel ?? 0) > 0)?.schritte_ziel;

  return {
    total,
    ziel: (Number(tagesZiel) || STANDARD_SCHRITTE_ZIEL) * 7,
  };
}

/** Eine Zeile aus v_exercise_progress: der schwerste Satz einer Einheit. */
export interface GymTopSet {
  user_id: string | null;
  split: string;
  exercise: string;
  session_id: string;
  day: string;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
}

/** Eine Zeile aus body_weight_entries. */
export interface BodyWeightEntry {
  entry_date: string;
  weight_kg: number;
}

export interface ExerciseSeries {
  exercise: string;
  points: { day: string; weight: number; reps: number }[];
  first: number;
  last: number;
  /** Veränderung in Prozent, null wenn der Startwert 0 war. */
  change: number | null;
  sessions: number;
}

/**
 * Gruppiert die Rohzeilen nach Split und Übung und rechnet die Veränderung aus.
 * Übungen mit nur einem Datenpunkt ergeben keine Kurve und fallen weg.
 */
export function buildSeries(rows: GymTopSet[]): Record<string, ExerciseSeries[]> {
  const bySplit = new Map<string, Map<string, GymTopSet[]>>();

  for (const r of rows) {
    if (r.weight_kg === null) continue;
    const split = r.split ?? "Ohne Split";
    if (!bySplit.has(split)) bySplit.set(split, new Map());
    const perExercise = bySplit.get(split)!;
    const list = perExercise.get(r.exercise) ?? [];
    list.push(r);
    perExercise.set(r.exercise, list);
  }

  const result: Record<string, ExerciseSeries[]> = {};

  for (const [split, perExercise] of bySplit) {
    const series: ExerciseSeries[] = [];

    for (const [exercise, rawList] of perExercise) {
      const sorted = [...rawList].sort((a, b) => a.day.localeCompare(b.day));
      const points = sorted.map((r) => ({
        day: r.day,
        weight: Number(r.weight_kg),
        reps: Number(r.reps ?? 0),
      }));
      if (points.length < 2) continue;

      const first = points[0].weight;
      const last = points[points.length - 1].weight;
      series.push({
        exercise,
        points,
        first,
        last,
        change: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null,
        sessions: points.length,
      });
    }

    // Die Übungen mit der längsten Historie zuerst - dort steckt die Aussage
    series.sort((a, b) => b.sessions - a.sessions || a.exercise.localeCompare(b.exercise));
    if (series.length > 0) result[split] = series;
  }

  return result;
}
