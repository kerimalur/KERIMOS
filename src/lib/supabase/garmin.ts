import "server-only";
import { createGymClient } from "@/lib/supabase/gym";

/**
 * Datenzugriff für den Garmin-Import.
 *
 * Der eigentliche Import läuft in `api/garmin-sync.py` (Vercel Cron). Hier
 * liegt nur, was die Oberfläche unter /gym/garmin braucht: welche Garmin-
 * Übungen noch keine Zuordnung haben und welche Sessions schon drin sind.
 */

export interface GarminMapping {
  id: string;
  garmin_category: string;
  garmin_name: string;
  exercise_id: string | null;
  exercise_name: string | null;
}

export interface GarminSession {
  id: string;
  garmin_activity_id: number | null;
  started_at: string | null;
  notes: string | null;
  saetze: number;
}

/** Alle bestehenden Zuordnungen, inklusive Klarnamen der Übung. */
export async function fetchGarminMappings(): Promise<GarminMapping[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("garmin_exercise_map")
    .select("id, garmin_category, garmin_name, exercise_id, exercises(name)")
    .order("garmin_category");

  return (data ?? []).map((r) => {
    // Supabase liefert die eingebettete Relation je nach Kardinalität als
    // Objekt oder als Array - beides abfangen.
    const roh = (r as { exercises?: { name: string } | { name: string }[] | null }).exercises;
    const eintrag = Array.isArray(roh) ? roh[0] : roh;
    return {
      id: r.id as string,
      garmin_category: r.garmin_category as string,
      garmin_name: r.garmin_name as string,
      exercise_id: (r.exercise_id as string | null) ?? null,
      exercise_name: eintrag?.name ?? null,
    };
  });
}

/**
 * Übungen, die der Sync gesehen, aber nicht zuordnen konnte.
 *
 * Der Python-Import verwirft sie nicht still, sondern schreibt sie als
 * "Unmapped: KATEGORIE/NAME (n Sätze)" in `workout_sessions.notes`. Diese
 * Notizen werden hier wieder ausgelesen - so bleibt die Information dort, wo
 * sie entstanden ist, ohne dass es eine zusätzliche Tabelle braucht.
 */
export async function fetchUnmappedGarmin(): Promise<{ key: string; saetze: number }[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const [{ data: sessions }, mappings] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("notes")
      .eq("log_source", "garmin")
      .not("notes", "is", null),
    fetchGarminMappings(),
  ]);

  const bekannt = new Set(
    mappings
      .filter((m) => m.exercise_id)
      .map((m) => `${m.garmin_category}|${m.garmin_name}`),
  );

  const gezaehlt = new Map<string, number>();
  const muster = /Unmapped:\s*([A-Z0-9_/]+)\s*\((\d+)\s*Sätze\)/g;

  for (const s of sessions ?? []) {
    const notes = (s.notes as string | null) ?? "";
    for (const treffer of notes.matchAll(muster)) {
      const key = treffer[1];
      const [kategorie, name] = key.split("/");

      // Inzwischen zugeordnet? Dann nicht mehr anzeigen.
      if (bekannt.has(`${kategorie}|*`)) continue;
      if (name && bekannt.has(`${kategorie}|${name}`)) continue;

      gezaehlt.set(key, (gezaehlt.get(key) ?? 0) + Number(treffer[2]));
    }
  }

  return [...gezaehlt.entries()]
    .map(([key, saetze]) => ({ key, saetze }))
    .sort((a, b) => b.saetze - a.saetze || a.key.localeCompare(b.key));
}

/** Die zuletzt importierten Garmin-Sessions, damit sichtbar ist, ob der Sync läuft. */
export async function fetchGarminSessions(limit = 10): Promise<GarminSession[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("workout_sessions")
    .select("id, garmin_activity_id, started_at, notes, exercise_logs(id)")
    .eq("log_source", "garmin")
    .order("started_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    garmin_activity_id: (r.garmin_activity_id as number | null) ?? null,
    started_at: (r.started_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    saetze: ((r as { exercise_logs?: unknown[] }).exercise_logs ?? []).length,
  }));
}
