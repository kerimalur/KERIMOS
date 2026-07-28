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
