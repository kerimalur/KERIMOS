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
