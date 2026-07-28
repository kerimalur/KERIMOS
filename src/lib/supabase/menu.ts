import "server-only";
import { createClient } from "@supabase/supabase-js";
import { heutePlus } from "@/lib/time";

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

/** Eine Zutat einer Mahlzeit bzw. einer Prep-Box (Menge pro Portion). */
export interface MenuItem {
  name: string;
  amount: number | null;
  unit: string | null;
  eaten?: boolean | null;
}

export interface MenuMeal {
  meal_type: string; // fruehstueck | mittagessen | abendessen | snack
  name: string;
  kcal_total: number | null;
  protein_total: number | null;
  /** In der Menü-App abgehakt ("gegessen"). Bei Boxen = consumed. */
  eaten?: boolean | null;
  /** Nur für heute geladen - dort will man sehen, was drin ist. */
  items?: MenuItem[];
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
  id: string;
  date: string;
  kcal_total: number | null;
  protein_total: number | null;
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

// Zürcher Zeit, nicht UTC - sonst verrutscht "heute" nach Mitternacht
const isoPlus = (n: number) => heutePlus(n);


const sortMeals = (meals: MenuMeal[] | null) =>
  [...(meals ?? [])].sort(
    (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
  );

type MenuClient = NonNullable<ReturnType<typeof createMenuClient>>;

/**
 * Meal-Prep-Boxen je Datum aus dem NEUEN Datenmodell der Menü-App:
 * batch_portions (Box je Tag+Slot, mit consumed = abgehakt)
 * → prep_batches (eingefrorene Werte pro Portion)
 * → recipes (Name). Bewusst flache Abfragen ohne eingebettete Joins.
 */
async function fetchPrepMeals(
  supabase: MenuClient, von: string, bis: string, itemsForDate?: string
): Promise<Map<string, MenuMeal[]>> {
  const result = new Map<string, MenuMeal[]>();

  const { data: portionRows } = await supabase.from("batch_portions")
    .select("date, meal_type, consumed, batch_id")
    .gte("date", von).lte("date", bis);
  const portions = (portionRows ?? []) as {
    date: string; meal_type: string; consumed: boolean; batch_id: string;
  }[];
  if (portions.length === 0) return result;

  const batchIds = [...new Set(portions.map((p) => p.batch_id))];
  const { data: batchRows } = await supabase.from("prep_batches")
    .select("id, recipe_id, kcal_per_portion, protein_per_portion")
    .in("id", batchIds);
  const batches = new Map(
    ((batchRows ?? []) as {
      id: string; recipe_id: string;
      kcal_per_portion: number | null; protein_per_portion: number | null;
    }[]).map((b) => [b.id, b])
  );

  const recipeIds = [...new Set([...batches.values()].map((b) => b.recipe_id))];
  const recipeName = new Map<string, string>();
  if (recipeIds.length > 0) {
    const { data: recipeRows } = await supabase.from("recipes")
      .select("id, name").in("id", recipeIds);
    for (const r of (recipeRows ?? []) as { id: string; name: string }[]) {
      recipeName.set(r.id, r.name);
    }
  }

  // Zutaten nur für den angeforderten Tag - Mengen sind pro Portion,
  // also genau das, was in einer Box liegt.
  const itemsByRecipe = new Map<string, MenuItem[]>();
  if (itemsForDate) {
    const heutigeRezepte = [...new Set(
      portions
        .filter((p) => p.date === itemsForDate)
        .map((p) => batches.get(p.batch_id)?.recipe_id)
        .filter(Boolean) as string[]
    )];
    if (heutigeRezepte.length > 0) {
      const { data: itemRows } = await supabase.from("recipe_items")
        .select("recipe_id, food_name, amount_per_portion, unit, sort_order")
        .in("recipe_id", heutigeRezepte).order("sort_order");
      for (const i of (itemRows ?? []) as {
        recipe_id: string; food_name: string;
        amount_per_portion: number | null; unit: string | null;
      }[]) {
        const list = itemsByRecipe.get(i.recipe_id) ?? [];
        list.push({ name: i.food_name, amount: i.amount_per_portion, unit: i.unit });
        itemsByRecipe.set(i.recipe_id, list);
      }
    }
  }

  for (const p of portions) {
    const b = batches.get(p.batch_id);
    const list = result.get(p.date) ?? [];
    list.push({
      meal_type: p.meal_type,
      name: (b && recipeName.get(b.recipe_id)) ?? "Prep-Box",
      kcal_total: b ? Number(b.kcal_per_portion ?? 0) : null,
      protein_total: b ? Number(b.protein_per_portion ?? 0) : null,
      eaten: Boolean(p.consumed),
      items: p.date === itemsForDate && b
        ? itemsByRecipe.get(b.recipe_id) ?? []
        : undefined,
    });
    result.set(p.date, list);
  }
  return result;
}

/** Zutaten der freien Mahlzeiten eines Tages, je Mahlzeit-Id. */
async function fetchMealItems(
  supabase: MenuClient, mealIds: string[]
): Promise<Map<string, MenuItem[]>> {
  const result = new Map<string, MenuItem[]>();
  if (mealIds.length === 0) return result;

  const { data } = await supabase.from("meal_items")
    .select("meal_id, food_name, amount, unit, eaten").in("meal_id", mealIds);
  for (const i of (data ?? []) as {
    meal_id: string; food_name: string;
    amount: number | null; unit: string | null; eaten: boolean | null;
  }[]) {
    const list = result.get(i.meal_id) ?? [];
    list.push({ name: i.food_name, amount: i.amount, unit: i.unit, eaten: i.eaten });
    result.set(i.meal_id, list);
  }
  return result;
}

/**
 * Alles für die Essen-Modus-Karte in einem Rutsch. Null ohne DB-Zugang.
 * Mahlzeiten werden bewusst in einer ZWEITEN Abfrage geholt (wie bei
 * fetchTodayMenu) statt als eingebetteter Join - der lieferte in der Praxis
 * leere Ergebnisse und liess geplante Tage als ungeplant erscheinen.
 */
export async function fetchEssenOverview(): Promise<EssenOverview | null> {
  const supabase = createMenuClient();
  if (!supabase) return null;

  const [{ data: planRows }, { count: offene }, { data: settingRows }] = await Promise.all([
    supabase.from("meal_plans")
      .select("id, date, kcal_total, protein_total")
      .gte("date", isoPlus(-6)).lte("date", isoPlus(6)),
    supabase.from("shopping_list")
      .select("id", { count: "exact", head: true }).eq("checked", false),
    supabase.from("settings").select("key, value")
      .in("key", ["kcal_ziel", "protein_ziel"]),
  ]);

  const plans = (planRows ?? []) as PlanRow[];
  const heuteIso = isoPlus(0);
  const heutePlanIds = new Set(plans.filter((p) => p.date === heuteIso).map((p) => p.id));

  // Mahlzeiten separat holen und den Plänen zuordnen
  const mealsByPlan = new Map<string, MenuMeal[]>();
  if (plans.length > 0) {
    const { data: mealRows } = await supabase.from("meals")
      .select("id, plan_id, meal_type, name, kcal_total, protein_total, eaten")
      .in("plan_id", plans.map((p) => p.id));
    const meals = (mealRows ?? []) as (MenuMeal & { id: string; plan_id: string })[];

    // Zutaten nur für heute - dort will man sehen, was noch zu essen ist
    const itemsByMeal = await fetchMealItems(
      supabase,
      meals.filter((m) => heutePlanIds.has(m.plan_id)).map((m) => m.id)
    );

    for (const m of meals) {
      const list = mealsByPlan.get(m.plan_id) ?? [];
      list.push({ ...m, items: itemsByMeal.get(m.id) });
      mealsByPlan.set(m.plan_id, list);
    }
  }

  // Meal-Prep-Boxen: leben seit dem Umbau in batch_portions/prep_batches,
  // nicht in meals - nur die Tagessummen stehen (per Trigger) am Plan.
  const prepByDate = await fetchPrepMeals(supabase, isoPlus(-6), isoPlus(6), heuteIso);

  // WICHTIG: Pro Datum können MEHRERE meal_plans-Zeilen existieren (die DB
  // erzwingt die Eindeutigkeit nicht überall). Deshalb alle Zeilen eines
  // Datums zusammenführen - sonst erwischt man die leere Kopie und ein voll
  // geplanter Tag erscheint als "nichts geplant".
  const byDate = new Map<string, PlanRow[]>();
  for (const p of plans) {
    const list = byDate.get(p.date) ?? [];
    list.push(p);
    byDate.set(p.date, list);
  }

  const mealsFuer = (iso: string): MenuMeal[] => {
    const direkt = (byDate.get(iso) ?? []).flatMap((p) => mealsByPlan.get(p.id) ?? []);
    // Prep-Mahlzeiten ergänzen die normalen (ohne Dopplung nach Typ+Name)
    const bekannt = new Set(direkt.map((m) => `${m.meal_type}|${m.name}`));
    const prep = (prepByDate.get(iso) ?? []).filter(
      (m) => !bekannt.has(`${m.meal_type}|${m.name}`)
    );
    return [...direkt, ...prep];
  };
  const totalsFuer = (iso: string) => {
    const list = byDate.get(iso) ?? [];
    return {
      kcal: Math.max(0, ...list.map((p) => Number(p.kcal_total ?? 0))),
      protein: Math.max(0, ...list.map((p) => Number(p.protein_total ?? 0))),
    };
  };

  const zuTag = (iso: string): EssenTag | null => {
    const meals = mealsFuer(iso);
    if (meals.length === 0) return null;
    const totals = totalsFuer(iso);
    // kcal-Summe notfalls aus den Mahlzeiten, falls der Tages-Total 0 ist
    const kcal = totals.kcal
      || meals.reduce((s, m) => s + Number(m.kcal_total ?? 0), 0);
    const protein = totals.protein
      || meals.reduce((s, m) => s + Number(m.protein_total ?? 0), 0);
    return { meals: sortMeals(meals), kcal, protein };
  };

  // Geplant = es gibt Mahlzeiten oder erfasste Kalorien an diesem Datum
  const istGeplant = (iso: string) =>
    mealsFuer(iso).length > 0 || totalsFuer(iso).kcal > 0;

  const ungeplant: string[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = isoPlus(i);
    if (!istGeplant(iso)) {
      ungeplant.push(i === 0 ? "heute" : i === 1 ? "morgen"
        : new Date(iso + "T12:00:00").toLocaleDateString("de-CH", { weekday: "short" }));
    }
  }

  // Ø der letzten 7 Tage (nur geplante mit berechneten Kalorien, je Datum einmal)
  const vergangene = [...byDate.keys()]
    .filter((iso) => iso <= heuteIso)
    .map((iso) => totalsFuer(iso))
    .filter((t) => t.kcal > 0);
  const schnitt = vergangene.length === 0 ? null : {
    kcal: vergangene.reduce((s, t) => s + t.kcal, 0) / vergangene.length,
    protein: vergangene.reduce((s, t) => s + t.protein, 0) / vergangene.length,
    tage: vergangene.length,
  };

  const settings = new Map((settingRows ?? []).map((s) => [s.key as string, s.value as string]));

  return {
    heute: zuTag(heuteIso),
    morgen: zuTag(isoPlus(1)),
    offeneEinkaeufe: offene ?? 0,
    ungeplant,
    schnitt,
    ziele: {
      kcal: parseInt(settings.get("kcal_ziel") ?? "") || 2000,
      protein: parseInt(settings.get("protein_ziel") ?? "") || 150,
    },
  };
}

/** Eine Zeile der Einkaufsliste. */
export interface ShoppingItem {
  id: string;
  item: string;
  quantity: string | null;
  checked: boolean;
}

/** Heutiges Menü aus meal_plans + meals. Null, wenn nichts geplant ist. */
export async function fetchTodayMenu(): Promise<TodayMenu | null> {
  const supabase = createMenuClient();
  if (!supabase) return null;

  const today = isoPlus(0);
  // Bewusst OHNE maybeSingle: pro Datum können mehrere Plan-Zeilen existieren
  const { data: planRows } = await supabase
    .from("meal_plans").select("id, kcal_total, protein_total")
    .eq("date", today);
  const plans = planRows ?? [];
  if (plans.length === 0) return null;

  const [{ data: meals }, prepByDate] = await Promise.all([
    supabase.from("meals").select("id, meal_type, name, kcal_total, protein_total, eaten")
      .in("plan_id", plans.map((p) => p.id)),
    fetchPrepMeals(supabase, today, today, today),
  ]);

  const mealRows = (meals ?? []) as (MenuMeal & { id: string })[];
  const itemsByMeal = await fetchMealItems(supabase, mealRows.map((m) => m.id));
  const direkt: MenuMeal[] = mealRows.map((m) => ({ ...m, items: itemsByMeal.get(m.id) }));
  const bekannt = new Set(direkt.map((m) => `${m.meal_type}|${m.name}`));
  const prep = (prepByDate.get(today) ?? []).filter(
    (m) => !bekannt.has(`${m.meal_type}|${m.name}`)
  );
  const sorted = [...direkt, ...prep].sort(
    (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
  );

  const kcal = Math.max(0, ...plans.map((p) => Number(p.kcal_total ?? 0)))
    || sorted.reduce((s, m) => s + Number(m.kcal_total ?? 0), 0);
  const protein = Math.max(0, ...plans.map((p) => Number(p.protein_total ?? 0)))
    || sorted.reduce((s, m) => s + Number(m.protein_total ?? 0), 0);

  return { kcal, protein, meals: sorted };
}
