/**
 * Typen und Zeitlogik für das Wochen-Whiteboard.
 *
 * Bewusst ohne "server-only": die Whiteboard-Komponente ist ein Client
 * (Umschalter Raster/Zeitstrahl) und braucht dieselben Typen und die
 * Zeitberechnung. Die Datenbankabfrage liegt in lib/supabase/menu.ts.
 */

export interface WocheMahlzeit {
  /**
   * Zeilen-ID aus `meals`. Gebraucht fürs Tagesmenü im Wochenplan: ohne sie
   * liesse sich nur der ganze Tag verschieben, nicht drei von fünf Mahlzeiten.
   * Leer bei Prep-Mahlzeiten, die keine eigene meals-Zeile haben.
   */
  id: string;
  meal_type: string;
  name: string;
  kcal: number;
  protein: number;
  eaten: boolean;
}

export interface WocheTag {
  datum: string;
  /** "Mo", "Di", … */
  kurz: string;
  istHeute: boolean;
  istVergangen: boolean;
  mahlzeiten: WocheMahlzeit[];
  kcal: number;
  protein: number;
  /** "07:30" oder null, wenn an diesem Tag kein Training geplant ist. */
  training: string | null;
  trainingNotiz: string | null;
}

export interface EssenWoche {
  von: string;
  bis: string;
  tage: WocheTag[];
  zielKcal: number;
  zielProtein: number;
}

/* ------------------------------------------------------------- Uhrzeiten */

/** "07:30" -> 450 Minuten seit Mitternacht. Null bei ungültiger Eingabe. */
export function zuMinuten(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** 450 -> "07:30" */
export function zuUhrzeit(minuten: number): string {
  const h = Math.floor(minuten / 60);
  const m = Math.round(minuten % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Wann welcher Slot gegessen wird — abgeleitet aus der Trainingszeit.
 *
 * Das ist eine Faustregel, keine erfasste Uhrzeit: die Datenbank speichert
 * pro Mahlzeit nur den Slot, nicht die Zeit. Die vier Zweige entsprechen den
 * Mustern, die in components/essenszeiten.tsx ausformuliert sind und aus
 * Kerims Schichtzeiten folgen. Ohne Training gilt der freie Tag.
 *
 * Die Zeiten dienen der Anordnung im Zeitstrahl. Die Rasteransicht kommt
 * ohne sie aus - dort steht nur, WAS es gibt.
 */
export function slotZeiten(training: string | null): Record<string, number> {
  const t = zuMinuten(training);

  // Kein Training: freier Rhythmus.
  if (t === null) {
    return { fruehstueck: 6 * 60 + 45, mittagessen: 12 * 60, snack: 15 * 60 + 30, abendessen: 18 * 60 + 30 };
  }

  // Frühtraining vor der Schicht: nüchtern trainieren, Shake danach,
  // letzte Mahlzeit um 17:00 wegen der Abendschicht.
  if (t < 8 * 60 + 30) {
    return { fruehstueck: t + 60, mittagessen: 11 * 60, snack: 15 * 60 + 30, abendessen: 17 * 60 };
  }

  // Vormittag, freier Tag: anderthalb Stunden Vorlauf, festes Essen davor.
  if (t < 12 * 60) {
    return { fruehstueck: t - 105, mittagessen: 12 * 60, snack: 15 * 60 + 30, abendessen: 18 * 60 + 30 };
  }

  // Zimmerstunde: Mittag um 11:00 trägt nicht bis 14:30, der Snack rutscht
  // deshalb hinter das Training.
  if (t < 17 * 60) {
    return { fruehstueck: 6 * 60 + 30, mittagessen: 11 * 60, snack: t + 60, abendessen: 17 * 60 };
  }

  // Durchdienst mit Abendtraining: erste Mahlzeit erst um 11:00, Porridge
  // als Pre-Workout, Hauptmahlzeit nach dem Training.
  return { fruehstueck: 11 * 60, mittagessen: 15 * 60 + 30, snack: t - 90, abendessen: t + 90 };
}

/** Fenster des Zeitstrahls. Weit genug für Frühtraining und Spätdienst. */
export const STRAHL_VON = 6 * 60;
export const STRAHL_BIS = 23 * 60;

/** Position in Prozent auf dem Zeitstrahl, auf 0–100 begrenzt. */
export function strahlPosition(minuten: number): number {
  const anteil = (minuten - STRAHL_VON) / (STRAHL_BIS - STRAHL_VON);
  return Math.max(0, Math.min(100, anteil * 100));
}
