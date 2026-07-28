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

interface PlanRow {
  date: string;
  kcal_total: number | null;
  protein_total: number | null;
  meals: MenuMeal[] | null;
}

export interface EssenTag {
  meals: MenuMeal[];
  kcal: number;
  protein: number;
}

export interface EssenOverview {
  heute: EssenTag | null;
  morgen: EssenTag | null;
  /** Unerledigte Posten auf der Einkaufsliste. */
  offeneEinkaeufe: number;
  /** Labels der ungeplanten Tage in den nächsten 7 Tagen, z.B. ["heute", "Do"]. */
  ungeplant: string[];
  /** Ø der letzten 7 geplanten Tage (bis heute). Null ohne Daten. */
  schnitt: { kcal: number; protein: number; tage: number } | null;
  ziele: { kcal: number; protein: number };
}

const isoPlus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const sortMeals = (meals: MenuMeal[] | null) =>
  [...(meals ?? [])].sort(
    (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
  );

const zuTag = (p: PlanRow | undefined): EssenTag | null =>
  p && (p.meals?.length ?? 0) > 0
    ? { meals: sortMeals(p.meals), kcal: Number(p.kcal_total ?? 0), protein: Number(p.protein_total ?? 0) }
    : null;

/** Alles für die Essen-Modus-Karte in einem Rutsch. Null ohne DB-Zugang. */
export async function fetchEssenOverview(): Promise<EssenOverview | null> {
  const supabase = createMenuClient();
  if (!supabase) return null;

  const [{ data: planRows }, { count: offene }, { data: settingRows }] = await Promise.all([
    supabase.from("meal_plans")
      .select("date, kcal_total, protein_total, meals(meal_type, name, kcal_total, protein_total)")
      .gte("date", isoPlus(-6)).lte("date", isoPlus(6)),
    supabase.from("shopping_list")
      .select("id", { count: "exact", head: true }).eq("checked", false),
    supabase.from("settings").select("key, value")
      .in("key", ["kcal_ziel", "protein_ziel"]),
  ]);

  const plans = (planRows ?? []) as PlanRow[];
  const byDate = new Map(plans.map((p) => [p.date, p]));
  const heuteIso = isoPlus(0);

  // Ungeplante Tage der nächsten Woche
  const ungeplant: string[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = isoPlus(i);
    const p = byDate.get(iso);
    if (!p || Number(p.kcal_total ?? 0) === 0) {
      ungeplant.push(i === 0 ? "heute" : i === 1 ? "morgen"
        : new Date(iso + "T12:00:00").toLocaleDateString("de-CH", { weekday: "short" }));
    }
  }

  // Ø der letzten 7 Tage (nur geplante)
  const vergangene = plans.filter(
    (p) => p.date <= heuteIso && Number(p.kcal_total ?? 0) > 0
  );
  const schnitt = vergangene.length === 0 ? null : {
    kcal: vergangene.reduce((s, p) => s + Number(p.kcal_total ?? 0), 0) / vergangene.length,
    protein: vergangene.reduce((s, p) => s + Number(p.protein_total ?? 0), 0) / vergangene.length,
    tage: vergangene.length,
  };

  const settings = new Map((settingRows ?? []).map((s) => [s.key as string, s.value as string]));

  return {
    heute: zuTag(byDate.get(heuteIso)),
    morgen: zuTag(byDate.get(isoPlus(1))),
    offeneEinkaeufe: offene ?? 0,
    ungeplant,
    schnitt,
    ziele: {
      kcal: parseInt(settings.get("kcal_ziel") ?? "") || 2000,
      protein: parseInt(settings.get("protein_ziel") ?? "") || 150,
    },
  };
}

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
