import { createClient } from "@supabase/supabase-js";

/**
 * Zugang zur Menüplan-Datenbank. Die Menü-Tabellen liegen im selben
 * Supabase-Projekt wie die Gym-App — deshalb greift ohne eigene MENU_-Variablen
 * automatisch der Gym-Zugang. Eigene MENU_-Variablen sind nur nötig, falls der
 * Menüplan je in ein eigenes Projekt umzieht.
 */
export function createMenuClient() {
  const url = process.env.MENU_SUPABASE_URL ?? process.env.GYM_SUPABASE_URL;
  const key = process.env.MENU_SUPABASE_ANON_KEY
    ?? process.env.GYM_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function menuConfigured(): boolean {
  return Boolean(
    (process.env.MENU_SUPABASE_URL ?? process.env.GYM_SUPABASE_URL) &&
    (process.env.MENU_SUPABASE_ANON_KEY ?? process.env.GYM_SUPABASE_SERVICE_ROLE_KEY)
  );
}

export interface MenuMeal {
  meal_type: string; // fruehstueck | mittagessen | abendessen | snack
  name: string;
  kcal_total: number | null;
  protein_total: number | null;
}

export interface TodayMenu {
  kcal: number;
  protein: number;
  meals: MenuMeal[];
}

export const MEAL_ORDER = ["fruehstueck", "mittagessen", "abendessen", "snack"];
export const MEAL_LABEL: Record<string, string> = {
  fruehstueck: "Frühstück",
  mittagessen: "Mittag",
  abendessen: "Abend",
  snack: "Snack",
};

/** Heutiges Menü aus meal_plans + meals. Null, wenn nichts geplant ist. */
export async function fetchTodayMenu(): Promise<TodayMenu | null> {
  const supabase = createMenuClient();
  if (!supabase) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: plan } = await supabase
    .from("meal_plans").select("id, kcal_total, protein_total")
    .eq("date", today).maybeSingle();
  if (!plan) return null;

  const { data: meals } = await supabase
    .from("meals").select("meal_type, name, kcal_total, protein_total")
    .eq("plan_id", plan.id);

  const sorted = ((meals ?? []) as MenuMeal[]).sort(
    (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
  );

  return {
    kcal: Number(plan.kcal_total ?? 0),
    protein: Number(plan.protein_total ?? 0),
    meals: sorted,
  };
}
