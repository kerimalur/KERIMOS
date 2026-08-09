import "server-only";
import { createGymClient } from "@/lib/supabase/gym";

/**
 * Datenzugriff für den Garmin-Import.
 *
 * Der Abruf von der Uhr läuft in `api/garmin-sync.py` (Vercel Cron). Der
 * schreibt aber nicht mehr direkt in den Verlauf, sondern legt jedes neue
 * Training als Vorschau ab (`garmin_import_sessions` / `garmin_import_saetze`).
 * Hier liegt, was die Oberfläche unter /gym/garmin braucht: die offene
 * Vorschau, die bestehenden Zuordnungen und die zuletzt übernommenen Sessions.
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
  /** Gesetzt, wenn diese Session eine automatisch importierte Ausdauereinheit ist. */
  cardio: { durationMinutes: number; distanceKm: number | null } | null;
}

/** Ein einzelner Satz, so wie ihn die Uhr geliefert hat. */
export interface VorschauSatz {
  id: string;
  position: number;
  weight_kg: number;
  reps: number;
  completed_at: string | null;
}

/** Alle Sätze einer Garmin-Bezeichnung, z.B. BENCH_PRESS/INCLINE_DUMBBELL_BENCH_PRESS. */
export interface VorschauGruppe {
  garminKey: string;
  /** Vorschlag aus dem Mapping. `null` = noch nicht zugeordnet. */
  exerciseId: string | null;
  saetze: VorschauSatz[];
}

/** Ein noch nicht übernommenes Training aus der Vorschau. */
export interface GarminVorschau {
  id: string;
  garmin_activity_id: number;
  started_at: string | null;
  completed_at: string | null;
  erkannter_split: string | null;
  garmin_uebersicht: string | null;
  gruppen: VorschauGruppe[];
  /** Wie viele Sätze ohne Gewicht ankamen — die will Kerim nachtragen. */
  ohneGewicht: number;
}

/**
 * Die offenen Trainings, die auf Prüfung warten.
 *
 * Gruppiert wird nach der Garmin-Bezeichnung, nicht nach der Zielübung:
 * Schräg- und Flachbankdrücken sollen zwei Blöcke bleiben, auch wenn sie
 * (noch) auf dieselbe Übung zeigen. Genau diese Verschmelzung war das
 * ursprüngliche Problem.
 */
export async function fetchGarminVorschau(): Promise<GarminVorschau[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const { data: sessions } = await supabase
    .from("garmin_import_sessions")
    .select("id, garmin_activity_id, started_at, completed_at, erkannter_split, garmin_uebersicht")
    .eq("status", "offen")
    .order("started_at", { ascending: false });

  if (!sessions?.length) return [];

  const { data: saetze } = await supabase
    .from("garmin_import_saetze")
    .select("id, import_session_id, position, garmin_key, exercise_id, weight_kg, reps, completed_at")
    .in("import_session_id", sessions.map((s) => s.id as string))
    .order("position");

  return sessions.map((s) => {
    const eigene = (saetze ?? []).filter(
      (z) => (z.import_session_id as string) === (s.id as string),
    );

    // Reihenfolge der Gruppen = Reihenfolge des ersten Satzes. Eine Map
    // bewahrt die Einfügereihenfolge, deshalb reicht das ohne Extra-Sortierung.
    const gruppen = new Map<string, VorschauGruppe>();
    for (const z of eigene) {
      const key = z.garmin_key as string;
      if (!gruppen.has(key)) {
        gruppen.set(key, {
          garminKey: key,
          exerciseId: (z.exercise_id as string | null) ?? null,
          saetze: [],
        });
      }
      gruppen.get(key)!.saetze.push({
        id: z.id as string,
        position: z.position as number,
        weight_kg: Number(z.weight_kg ?? 0),
        reps: Number(z.reps ?? 0),
        completed_at: (z.completed_at as string | null) ?? null,
      });
    }

    return {
      id: s.id as string,
      garmin_activity_id: s.garmin_activity_id as number,
      started_at: (s.started_at as string | null) ?? null,
      completed_at: (s.completed_at as string | null) ?? null,
      erkannter_split: (s.erkannter_split as string | null) ?? null,
      garmin_uebersicht: (s.garmin_uebersicht as string | null) ?? null,
      gruppen: [...gruppen.values()],
      ohneGewicht: eigene.filter((z) => Number(z.weight_kg ?? 0) === 0).length,
    };
  });
}

/**
 * Wie viele Trainings auf Prüfung warten.
 *
 * Nur die Zahl, damit die Tab-Leiste sie zeigen kann, ohne die ganze Vorschau
 * zu laden - sonst zahlt jede Gym-Seite für etwas, das nur eine braucht.
 */
export async function countGarminVorschau(): Promise<number> {
  const supabase = createGymClient();
  if (!supabase) return 0;

  const { count } = await supabase
    .from("garmin_import_sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "offen");

  return count ?? 0;
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

export interface GarminTag {
  datum: string;
  schritte: number | null;
  kalorien_gesamt: number | null;
  kalorien_aktiv: number | null;
  ruhepuls: number | null;
  body_battery_hoechster: number | null;
  body_battery_tiefster: number | null;
  hrv_nacht: number | null;
  stress_schnitt: number | null;
}

/** Schritte, Kalorien und Erholungswerte der letzten Tage. */
export async function fetchGarminTage(limit = 10): Promise<GarminTag[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  // Select bewusst als ein einziges Literal: verkettete Strings kann der
  // Supabase-Typgenerator nicht auflösen und liefert GenericStringError.
  const { data } = await supabase
    .from("garmin_daily")
    .select("datum, schritte, kalorien_gesamt, kalorien_aktiv, ruhepuls, body_battery_hoechster, body_battery_tiefster, hrv_nacht, stress_schnitt")
    .order("datum", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as GarminTag[];
}

export interface GarminEnergie {
  /** Werte von heute - der Tag läuft noch, also unvollständig. */
  heute: GarminTag | null;
  /** Ø Kalorienverbrauch abgeschlossener Tage, die verlässliche Referenz. */
  schnittVerbrauch: number | null;
  /** Ø Schritte abgeschlossener Tage. */
  schnittSchritte: number | null;
  /** Wie viele abgeschlossene Tage in den Schnitt eingehen. */
  tage: number;
}

/**
 * Energie-Lage für die Startseite.
 *
 * Der heutige Verbrauch ist um 8 Uhr morgens naturgemäss winzig - eine
 * Bilanz daraus wäre irreführend. Deshalb kommt zusätzlich der Schnitt der
 * abgeschlossenen Tage mit, und die Karte rechnet die Bilanz dagegen.
 */
export async function fetchGarminEnergie(): Promise<GarminEnergie> {
  const tage = await fetchGarminTage(8);
  const heutigesDatum = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Zurich",
  });

  const heute = tage.find((t) => t.datum === heutigesDatum) ?? null;
  const abgeschlossen = tage.filter(
    (t) => t.datum !== heutigesDatum && (t.kalorien_gesamt ?? 0) > 0,
  );

  const mittel = (werte: number[]) =>
    werte.length === 0 ? null : Math.round(werte.reduce((s, v) => s + v, 0) / werte.length);

  return {
    heute,
    schnittVerbrauch: mittel(abgeschlossen.map((t) => t.kalorien_gesamt ?? 0)),
    schnittSchritte: mittel(
      abgeschlossen.filter((t) => t.schritte !== null).map((t) => t.schritte as number),
    ),
    tage: abgeschlossen.length,
  };
}

/** Die zuletzt importierten Garmin-Sessions, damit sichtbar ist, ob der Sync läuft. */
export async function fetchGarminSessions(limit = 10): Promise<GarminSession[]> {
  const supabase = createGymClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("workout_sessions")
    .select("id, garmin_activity_id, started_at, notes, exercise_logs(id), cardio_logs(duration_minutes, distance_km)")
    .eq("log_source", "garmin")
    .order("started_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => {
    const cardioLogs = (r as { cardio_logs?: { duration_minutes: number; distance_km: number | null }[] })
      .cardio_logs ?? [];
    const cardio = cardioLogs.length === 0 ? null : {
      durationMinutes: cardioLogs.reduce((s, c) => s + Number(c.duration_minutes ?? 0), 0),
      distanceKm: cardioLogs.some((c) => c.distance_km !== null)
        ? cardioLogs.reduce((s, c) => s + Number(c.distance_km ?? 0), 0)
        : null,
    };
    return {
      id: r.id as string,
      garmin_activity_id: (r.garmin_activity_id as number | null) ?? null,
      started_at: (r.started_at as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      saetze: ((r as { exercise_logs?: unknown[] }).exercise_logs ?? []).length,
      cardio,
    };
  });
}
