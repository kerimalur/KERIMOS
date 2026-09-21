/**
 * Typen und Konstanten des Bereichs „Woche", ohne Datenbankzugriff —
 * damit Client- und Server-Code sie gleichermassen importieren dürfen.
 */

export const KRAFT_ZIEL = 4;
/** Ausdauer: 1–2 pro Woche. Ab 1 gilt das Ziel als erreicht, 2 ist „stark". */
export const AUSDAUER_ZIEL = 1;
/** Mehr aktive Vorhaben als das heisst: keins davon wird fertig. */
export const MAX_AKTIV = 3;

export type HabitArt = "push" | "pull" | "ausdauer";
export const HABIT_LABEL: Record<HabitArt, string> = {
  push: "Push", pull: "Pull", ausdauer: "Ausdauer",
};

export function istHabitArt(v: unknown): v is HabitArt {
  return v === "push" || v === "pull" || v === "ausdauer";
}

export type VorhabenStatus = "aktiv" | "idee" | "erledigt";

export function istVorhabenStatus(v: unknown): v is VorhabenStatus {
  return v === "aktiv" || v === "idee" || v === "erledigt";
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const istIsoDatum = (s: string) => ISO.test(s);
