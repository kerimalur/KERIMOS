/**
 * Mahlzeiten-Reihenfolge und Bezeichnungen.
 *
 * Bewusst eine eigene Datei ohne Datenbankbezug: der Zugang in
 * lib/supabase/menu.ts trägt "server-only" und darf deshalb nicht aus
 * Client-Komponenten importiert werden - diese Beschriftungen schon.
 */
export const MEAL_ORDER = ["fruehstueck", "mittagessen", "abendessen", "snack"];

export const MEAL_LABEL: Record<string, string> = {
  fruehstueck: "Frühstück",
  mittagessen: "Mittag",
  abendessen: "Abend",
  snack: "Snack",
};

/**
 * Ein Rezept kennt nur zwei Sorten: Hauptmahlzeit oder Snack.
 *
 * Ob eine Hauptmahlzeit am Mittag oder am Abend landet, entscheidet erst der
 * Plan - dort wählt man den konkreten Slot. Deshalb wird beim Rezept nicht
 * mehr zwischen Mittag und Abend unterschieden; das war eine Festlegung, die
 * man beim Anlegen noch gar nicht treffen will.
 *
 * In der Datenbank bleiben die vier bekannten Werte bestehen (die Spalte hat
 * eine Prüfregel darauf) - "Hauptmahlzeit" wird als `mittagessen` abgelegt.
 */
export const RECIPE_KINDS = [
  { value: "mittagessen", label: "Hauptmahlzeit" },
  { value: "snack", label: "Snack" },
] as const;

/** Snack oder Hauptmahlzeit? Alles ausser `snack` gilt als Hauptmahlzeit. */
export const istSnack = (mealType: string) => mealType === "snack";

/** Beschriftung der Rezept-Sorte, auch für Altbestand mit Frühstück/Abend. */
export const recipeKindLabel = (mealType: string) =>
  istSnack(mealType) ? "Snack" : "Hauptmahlzeit";
