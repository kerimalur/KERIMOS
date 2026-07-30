/**
 * Erholungsrechnung nach einer Trainingseinheit.
 *
 * Bewusst ohne Datenbankbezug, damit die Workout-Seite im Browser damit
 * rechnen kann und die Server Action beim Speichern dieselbe Zahl bekommt.
 *
 * Grundwerte je Muskelgruppe stehen in der Datenbank (muscle_groups.
 * base_recovery_hours) - grosse Muskeln brauchen länger als kleine.
 * Zwei Faktoren verändern diesen Grundwert:
 *
 *   Volumen    - viele Sätze schaden mehr, ab 10 Sätzen wird es länger
 *   Intensität - RIR ist "reps in reserve": 0 heisst bis zum Muskelversagen,
 *                das dauert länger; 5 heisst locker, das geht schneller weg
 *
 * Die Grenzen (0.8 bis 1.8 bzw. 0.7 bis 1.9) verhindern, dass ein einzelner
 * Ausreisser eine absurde Erholungszeit ergibt.
 */

export interface RecoveryInput {
  muscleGroupId: string;
  muscleGroupName: string;
  baseRecoveryHours: number;
  totalSets: number;
  avgRIR: number;
  /** Aus Rückmeldungen gelernt. 1.0, solange nichts gelernt wurde. */
  adaptiveMultiplier?: number;
}

export interface RecoveryResult {
  muscleGroupId: string;
  muscleGroupName: string;
  totalRecoveryHours: number;
  /** ISO-Zeitstempel, damit das Ergebnis zwischen Server und Browser reisen kann. */
  estimatedFullRecoveryAt: string;
}

export function calculateRecovery(
  input: RecoveryInput, workoutCompletedAt: Date
): RecoveryResult {
  const {
    muscleGroupId, muscleGroupName, baseRecoveryHours,
    totalSets, avgRIR, adaptiveMultiplier = 1.0,
  } = input;

  // Jeder Satz über 10 hinaus verlängert um 5 %
  const volumen = Math.max(0.8, Math.min(1.8, 1 + (totalSets - 10) * 0.05));
  // RIR 3 ist der Nullpunkt; jeder Punkt darunter verlängert um 12 %
  const intensitaet = Math.max(0.7, Math.min(1.9, 1 + (3 - avgRIR) * 0.12));

  const stunden = baseRecoveryHours * volumen * intensitaet * adaptiveMultiplier;

  return {
    muscleGroupId,
    muscleGroupName,
    totalRecoveryHours: Math.round(stunden),
    estimatedFullRecoveryAt:
      new Date(workoutCompletedAt.getTime() + stunden * 3_600_000).toISOString(),
  };
}

export function calculateSessionRecovery(
  muskeln: RecoveryInput[], workoutCompletedAt: Date
): RecoveryResult[] {
  return muskeln.map((m) => calculateRecovery(m, workoutCompletedAt));
}

/** "2:05:30" · "45:12" - Trainings- und Pausenuhr. */
export function formatDuration(sekunden: number): string {
  const s = Math.max(0, Math.floor(sekunden));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const zwei = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${zwei(m)}:${zwei(rest)}` : `${m}:${zwei(rest)}`;
}

/** "36 Std" · "2d 4h" - Erholungsdauer in lesbar. */
export function formatHours(stunden: number): string {
  if (stunden < 1) return `${Math.round(stunden * 60)} Min`;
  if (stunden < 24) return `${Math.round(stunden)} Std`;
  const tage = Math.floor(stunden / 24);
  const rest = Math.round(stunden % 24);
  return rest === 0 ? `${tage} Tage` : `${tage} Tage ${rest} h`;
}
