import "server-only";
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

/** Adresse der Gym-App - dorthin geht es zum eigentlichen Training. */
export const GYM_APP_URL =
  process.env.NEXT_PUBLIC_GYM_APP_URL ?? "https://gymapp-vereinfacht.vercel.app";

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

export async function fetchMuscleGroups(): Promise<MuscleGroup[]> {
  const supabase = createGymClient();
  if (!supabase) return [];
  const { data } = await supabase.from("muscle_groups")
    .select("id, name, base_recovery_hours").order("name");
  return ((data ?? []) as unknown as MuscleGroup[]).map((m) => ({
    ...m, base_recovery_hours: Number(m.base_recovery_hours ?? 0),
  }));
}

/**
 * Übungen samt Muskelgruppen-Namen. Bewusst zwei flache Abfragen statt eines
 * eingebetteten Joins - dasselbe Muster wie im Menüplan, weil PostgREST bei
 * Joins keinen ableitbaren Typ liefert.
 */
export async function fetchExercises(): Promise<GymExercise[]> {
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
}

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
