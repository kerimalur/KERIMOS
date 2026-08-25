import "server-only";
import { createClient } from "@supabase/supabase-js";
import { heutePlus, weekStart, addDays } from "@/lib/time";
import type { EssenWoche, WocheTag } from "@/lib/essen-woche";

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

// Beschriftungen liegen in lib/menu-labels.ts, damit auch Client-Komponenten
// sie nutzen können - diese Datei ist serverseitig gesperrt.
export { MEAL_ORDER, MEAL_LABEL } from "@/lib/menu-labels";
import { MEAL_ORDER } from "@/lib/menu-labels";

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
    const meals = (mealRows ?? []) as unknown as (MenuMeal & { id: string; plan_id: string })[];

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

/* ------------------------------------------------------- Wochen-Whiteboard */

/**
 * Die ganze Woche auf einen Blick — Grundlage für das Whiteboard unter
 * /m/Essen.
 *
 * Bewusst eine eigene Funktion statt einer Erweiterung von
 * fetchEssenOverview: die Übersicht holt Zutaten für heute und rechnet
 * Durchschnitte, das Whiteboard braucht sieben Tage flach. Beide teilen sich
 * die Hilfsfunktionen darunter.
 *
 * Die Trainingszeit kommt aus `day_training` (eigene kleine Tabelle, direkt
 * auf dem Board pflegbar). Fehlt die Tabelle, bleibt das Board nutzbar und
 * zeigt nur keine Trainingsmarken - deshalb der Fehler-Rückfall statt eines
 * harten Abbruchs.
 */
export async function fetchEssenWoche(von: string): Promise<EssenWoche | null> {
  const supabase = createMenuClient();
  if (!supabase) return null;

  const tageIso = Array.from({ length: 7 }, (_, i) => addDays(von, i));
  const bis = tageIso[6];

  const [{ data: planRows }, { data: settingRows }, trainingRes] = await Promise.all([
    supabase.from("meal_plans")
      .select("id, date, kcal_total, protein_total").gte("date", von).lte("date", bis),
    supabase.from("settings").select("key, value")
      .in("key", ["kcal_ziel", "protein_ziel"]),
    supabase.from("day_training").select("date, start_time, note")
      .gte("date", von).lte("date", bis),
  ]);

  const plans = (planRows ?? []) as PlanRow[];

  const mealsByPlan = new Map<string, MenuMeal[]>();
  if (plans.length > 0) {
    const { data: mealRows } = await supabase.from("meals")
      .select("id, plan_id, meal_type, name, kcal_total, protein_total, eaten")
      .in("plan_id", plans.map((p) => p.id));
    for (const m of (mealRows ?? []) as unknown as (MenuMeal & { plan_id: string })[]) {
      const list = mealsByPlan.get(m.plan_id) ?? [];
      list.push(m);
      mealsByPlan.set(m.plan_id, list);
    }
  }

  const prepByDate = await fetchPrepMeals(supabase, von, bis);

  // Mehrere meal_plans-Zeilen pro Datum sind möglich (siehe Kommentar in
  // fetchEssenOverview) - deshalb zusammenführen statt die erste nehmen.
  const byDate = new Map<string, PlanRow[]>();
  for (const p of plans) {
    const list = byDate.get(p.date) ?? [];
    list.push(p);
    byDate.set(p.date, list);
  }

  const training = new Map<string, { start: string | null; note: string | null }>();
  for (const t of (trainingRes.data ?? []) as
    { date: string; start_time: string | null; note: string | null }[]) {
    training.set(t.date, { start: t.start_time, note: t.note });
  }

  const settings = new Map((settingRows ?? []).map((s) => [s.key as string, s.value as string]));
  const heute = isoPlus(0);

  const tage: WocheTag[] = tageIso.map((iso) => {
    const direkt = (byDate.get(iso) ?? []).flatMap((p) => mealsByPlan.get(p.id) ?? []);
    const bekannt = new Set(direkt.map((m) => `${m.meal_type}|${m.name}`));
    const prep = (prepByDate.get(iso) ?? [])
      .filter((m) => !bekannt.has(`${m.meal_type}|${m.name}`));
    const alle = sortMeals([...direkt, ...prep]);

    const zeilen = byDate.get(iso) ?? [];
    const kcalPlan = Math.max(0, ...zeilen.map((p) => Number(p.kcal_total ?? 0)), 0);
    const proteinPlan = Math.max(0, ...zeilen.map((p) => Number(p.protein_total ?? 0)), 0);
    const tr = training.get(iso);

    return {
      datum: iso,
      kurz: new Date(iso + "T12:00:00").toLocaleDateString("de-CH", { weekday: "short" }),
      istHeute: iso === heute,
      istVergangen: iso < heute,
      mahlzeiten: alle.map((m) => ({
        // Prep-Mahlzeiten (aus batch_portions) haben keine eigene meals-Zeile.
        // Leere ID heisst: im Tagesmenü nicht auswählbar - man kann sie nicht
        // verschieben, ohne die Vorratsplanung zu zerlegen.
        id: String((m as { id?: string }).id ?? ""),
        meal_type: m.meal_type,
        name: m.name,
        kcal: Number(m.kcal_total ?? 0),
        protein: Number(m.protein_total ?? 0),
        eaten: Boolean(m.eaten),
      })),
      kcal: kcalPlan || alle.reduce((s, m) => s + Number(m.kcal_total ?? 0), 0),
      protein: proteinPlan || alle.reduce((s, m) => s + Number(m.protein_total ?? 0), 0),
      training: tr?.start ? tr.start.slice(0, 5) : null,
      trainingNotiz: tr?.note ?? null,
    };
  });

  return {
    von, bis, tage,
    zielKcal: parseInt(settings.get("kcal_ziel") ?? "") || 2000,
    zielProtein: parseInt(settings.get("protein_ziel") ?? "") || 150,
  };
}

/**
 * Reichweite der vorgekochten Boxen: bis wann decken sie den Plan?
 * Grundlage für die Frage, ob gekocht, eingekauft oder geplant werden muss.
 */
export interface PrepStand {
  /** Letzter Tag, für den noch eine Box zugeordnet ist. Null = keine. */
  bis: string | null;
  /** Tage ab heute, die noch gedeckt sind (0 = heute ist der letzte). */
  tage: number | null;
  /** Offene Posten auf der Einkaufsliste. */
  offeneEinkaeufe: number;
  /** Ungeplante Tage in den nächsten sieben. */
  ungeplant: number;
}

export async function fetchPrepStand(): Promise<PrepStand | null> {
  const supabase = createMenuClient();
  if (!supabase) return null;

  const heute = isoPlus(0);
  const [{ data: portionen }, { count: offene }, { data: plaene }] = await Promise.all([
    supabase.from("batch_portions").select("date")
      .gte("date", heute).order("date", { ascending: false }).limit(1),
    supabase.from("shopping_list")
      .select("id", { count: "exact", head: true }).eq("checked", false),
    supabase.from("meal_plans").select("id, date, kcal_total")
      .gte("date", heute).lte("date", isoPlus(6)),
  ]);

  const bis = (portionen?.[0]?.date as string | undefined) ?? null;
  const tage = bis
    ? Math.round(
        (new Date(bis + "T12:00:00").getTime() -
          new Date(heute + "T12:00:00").getTime()) / 86400000
      )
    : null;

  // Ungeplant = weder Kalorien noch Mahlzeiten am Tag
  const planIds = (plaene ?? []).map((p) => p.id as string);
  const mitMahlzeit = new Set<string>();
  if (planIds.length > 0) {
    const { data: meals } = await supabase.from("meals")
      .select("plan_id").in("plan_id", planIds);
    for (const m of meals ?? []) mitMahlzeit.add(m.plan_id as string);
  }
  const mitBox = new Set<string>();
  const { data: alleBoxen } = await supabase.from("batch_portions")
    .select("date").gte("date", heute).lte("date", isoPlus(6));
  for (const b of alleBoxen ?? []) mitBox.add(b.date as string);

  const geplanteDaten = new Set<string>([
    ...(plaene ?? [])
      .filter((p) => Number(p.kcal_total ?? 0) > 0 || mitMahlzeit.has(p.id as string))
      .map((p) => p.date as string),
    ...mitBox,
  ]);

  let ungeplant = 0;
  for (let i = 0; i < 7; i++) if (!geplanteDaten.has(isoPlus(i))) ungeplant++;

  return { bis, tage, offeneEinkaeufe: offene ?? 0, ungeplant };
}

/* -------------------------------------------------- Lebensmittel, Rezepte */

export interface Food {
  id: string;
  name: string;
  calories_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  cost_per_100: number;
  unit: string;
  category_id: string | null;
}

// Bewusst ein einzelnes Literal, nicht zusammengesetzt: nur so kann
// supabase-js den Spaltensatz typisieren.
const FOOD_SPALTEN = "id, name, calories_per_100, protein_per_100, carbs_per_100, fat_per_100, cost_per_100, unit, category_id";

/** Lebensmittel, optional nach Namen gefiltert. */
export async function fetchFoods(suche = "", limit = 300): Promise<Food[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  let q = supabase.from("foods").select(FOOD_SPALTEN).order("name").limit(limit);
  if (suche.trim()) q = q.ilike("name", `%${suche.trim()}%`);

  const { data } = await q;
  // Über unknown, weil PostgREST bei zusammengesetzten Abfragen keinen
  // ableitbaren Typ liefert.
  return ((data ?? []) as unknown as Food[]).map((f) => ({
    ...f,
    calories_per_100: Number(f.calories_per_100 ?? 0),
    protein_per_100: Number(f.protein_per_100 ?? 0),
    carbs_per_100: Number(f.carbs_per_100 ?? 0),
    fat_per_100: Number(f.fat_per_100 ?? 0),
    cost_per_100: Number(f.cost_per_100 ?? 0),
    category_id: (f.category_id as string | null) ?? null,
  }));
}

/** Kategorien für Lebensmittel, z.B. "Milchprodukte", "Gemüse". */
export interface FoodCategory {
  id: string;
  name: string;
}

export async function fetchFoodCategories(): Promise<FoodCategory[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];
  const { data } = await supabase.from("food_categories")
    .select("id, name").order("name");
  return (data ?? []) as FoodCategory[];
}

/** Vorlagen-Kategorien für Rezepte, z.B. "Wochenmenü", "Meal-Prep-Klassiker". */
export interface RecipeCategory {
  id: string;
  name: string;
}

export async function fetchRecipeCategories(): Promise<RecipeCategory[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];
  const { data } = await supabase.from("template_categories")
    .select("id, name").order("name");
  return (data ?? []) as RecipeCategory[];
}

export interface RecipeItem {
  id: string;
  food_id: string | null;
  food_name: string;
  amount_per_portion: number;
  unit: string;
  sort_order: number;
}

export interface Recipe {
  id: string;
  name: string;
  meal_type: string;
  category_id: string | null;
  status: string;
  freetext: string;
  default_portions: number;
  is_favorite: boolean;
  items: RecipeItem[];
}

/** Rezepte samt Zutaten. Zwei flache Abfragen statt eingebettetem Join. */
export async function fetchRecipes(): Promise<Recipe[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  const { data: rez } = await supabase.from("recipes")
    .select("id, name, meal_type, category_id, status, freetext, default_portions, is_favorite")
    .order("is_favorite", { ascending: false }).order("name");
  const rezepte = (rez ?? []) as unknown as Omit<Recipe, "items">[];
  if (rezepte.length === 0) return [];

  const { data: items } = await supabase.from("recipe_items")
    .select("id, recipe_id, food_id, food_name, amount_per_portion, unit, sort_order")
    .in("recipe_id", rezepte.map((r) => r.id)).order("sort_order");

  const nachRezept = new Map<string, RecipeItem[]>();
  for (const i of (items ?? []) as unknown as (RecipeItem & { recipe_id: string })[]) {
    const list = nachRezept.get(i.recipe_id) ?? [];
    list.push({ ...i, amount_per_portion: Number(i.amount_per_portion ?? 0) });
    nachRezept.set(i.recipe_id, list);
  }

  return rezepte.map((r) => ({ ...r, items: nachRezept.get(r.id) ?? [] }));
}

/* ------------------------------------------------------------ Prep-Zyklen */

export interface PrepPortion {
  id: string;
  date: string;
  meal_type: string;
  consumed: boolean;
}

export interface PrepBatch {
  id: string;
  recipe_id: string;
  recipeName: string;
  meal_type: string;
  portions: number;
  kcal: number;
  protein: number;
  cost: number;
  /** Zutaten hochgerechnet auf den ganzen Topf. */
  zutaten: { name: string; proPortion: number; total: number; unit: string }[];
  boxen: PrepPortion[];
}

export interface PrepCycle {
  id: string;
  name: string;
  cook_date: string;
  start_date: string;
  end_date: string;
  status: string;
  batches: PrepBatch[];
}

export const CYCLE_STATUS = ["geplant", "eingekauft", "gekocht", "erledigt"];

/**
 * Kochzyklen samt Töpfen, Boxen und hochgerechneten Zutaten.
 *
 * Die eingefrorenen Werte pro Portion stehen am Topf (prep_batches) - sie
 * ändern sich nicht mehr, wenn später ein Rezept angepasst wird. Die
 * Zutatenliste kommt dagegen aus dem Rezept, weil sie nur zum Kochen dient.
 */
export async function fetchCycles(limit = 24): Promise<PrepCycle[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  const { data: cycles } = await supabase.from("prep_cycles")
    .select("id, name, cook_date, start_date, end_date, status")
    .order("cook_date", { ascending: false }).limit(limit);
  if (!cycles || cycles.length === 0) return [];

  const { data: batches } = await supabase.from("prep_batches")
    .select("id, cycle_id, recipe_id, meal_type, portions, kcal_per_portion, protein_per_portion, cost_per_portion")
    .in("cycle_id", cycles.map((c) => c.id as string));

  const batchIds = (batches ?? []).map((b) => b.id as string);
  const recipeIds = [...new Set((batches ?? []).map((b) => b.recipe_id as string))];

  const [{ data: portions }, { data: recipes }, { data: items }] = await Promise.all([
    batchIds.length > 0
      ? supabase.from("batch_portions")
          .select("id, batch_id, date, meal_type, consumed")
          .in("batch_id", batchIds).order("date")
      : Promise.resolve({ data: [] }),
    recipeIds.length > 0
      ? supabase.from("recipes").select("id, name").in("id", recipeIds)
      : Promise.resolve({ data: [] }),
    recipeIds.length > 0
      ? supabase.from("recipe_items")
          .select("recipe_id, food_name, amount_per_portion, unit, sort_order")
          .in("recipe_id", recipeIds).order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);

  const namen = new Map((recipes ?? []).map((r) => [r.id as string, r.name as string]));
  const boxenNachBatch = new Map<string, PrepPortion[]>();
  for (const p of portions ?? []) {
    const list = boxenNachBatch.get(p.batch_id as string) ?? [];
    list.push({
      id: p.id as string, date: p.date as string,
      meal_type: p.meal_type as string, consumed: Boolean(p.consumed),
    });
    boxenNachBatch.set(p.batch_id as string, list);
  }
  const zutatenNachRezept = new Map<string, { name: string; menge: number; unit: string }[]>();
  for (const i of items ?? []) {
    const list = zutatenNachRezept.get(i.recipe_id as string) ?? [];
    list.push({
      name: i.food_name as string,
      menge: Number(i.amount_per_portion ?? 0),
      unit: (i.unit as string) ?? "g",
    });
    zutatenNachRezept.set(i.recipe_id as string, list);
  }

  const batchesNachCycle = new Map<string, PrepBatch[]>();
  for (const b of batches ?? []) {
    const portionen = Number(b.portions ?? 0);
    const recipeId = b.recipe_id as string;
    const list = batchesNachCycle.get(b.cycle_id as string) ?? [];
    list.push({
      id: b.id as string,
      recipe_id: recipeId,
      recipeName: namen.get(recipeId) ?? "Unbekanntes Rezept",
      meal_type: b.meal_type as string,
      portions: portionen,
      kcal: Number(b.kcal_per_portion ?? 0),
      protein: Number(b.protein_per_portion ?? 0),
      cost: Number(b.cost_per_portion ?? 0),
      zutaten: (zutatenNachRezept.get(recipeId) ?? []).map((z) => ({
        name: z.name,
        proPortion: z.menge,
        total: Math.round(z.menge * portionen * 100) / 100,
        unit: z.unit,
      })),
      boxen: boxenNachBatch.get(b.id as string) ?? [],
    });
    batchesNachCycle.set(b.cycle_id as string, list);
  }

  return cycles.map((c) => ({
    id: c.id as string,
    name: (c.name as string) ?? "",
    cook_date: c.cook_date as string,
    start_date: c.start_date as string,
    end_date: c.end_date as string,
    status: c.status as string,
    batches: batchesNachCycle.get(c.id as string) ?? [],
  }));
}

/* -------------------------------------------------------- Tagesvorlagen */

export interface DayTemplateItem {
  id: string;
  meal_type: string;
  recipe_id: string;
  recipeName: string;
  sort_order: number;
  /**
   * Nur an Trainingstagen. Wird die Vorlage ohne Training eingefügt,
   * taucht diese Zeile gar nicht erst in der Auswahl auf — typisch das
   * Porridge, das den Trainingstag ausgleicht.
   */
  training_only: boolean;
}

export interface DayTemplate {
  id: string;
  name: string;
  with_snacks: boolean;
  items: DayTemplateItem[];
}

/**
 * Tagesvorlagen: ein fertig zusammengestellter Tag aus Rezepten.
 *
 * Gedacht für die Tage, die sich ohnehin wiederholen - man lädt die Vorlage
 * auf ein Datum, statt jede Mahlzeit neu zusammenzuklicken. Die Vorlage
 * verweist nur auf Rezepte; ändert man ein Rezept, ändert sich die Vorlage
 * automatisch mit.
 */
export async function fetchDayTemplates(): Promise<DayTemplate[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  const { data: vorlagen } = await supabase.from("day_templates")
    .select("id, name, with_snacks").order("name");
  const liste = (vorlagen ?? []) as { id: string; name: string; with_snacks: boolean }[];
  if (liste.length === 0) return [];

  const { data: itemRows } = await supabase.from("day_template_items")
    .select("id, template_id, meal_type, recipe_id, sort_order, training_only")
    .in("template_id", liste.map((v) => v.id)).order("sort_order");
  const items = ((itemRows ?? []) as Record<string, unknown>[]).map((i) => ({
    id: i.id as string,
    template_id: i.template_id as string,
    meal_type: i.meal_type as string,
    recipe_id: i.recipe_id as string,
    sort_order: Number(i.sort_order ?? 0),
    // Fallback, damit die Liste auch ohne Migration 14 steht.
    training_only: Boolean(i.training_only),
  }));

  const recipeIds = [...new Set(items.map((i) => i.recipe_id))];
  const namen = new Map<string, string>();
  if (recipeIds.length > 0) {
    const { data: rez } = await supabase.from("recipes")
      .select("id, name").in("id", recipeIds);
    for (const r of rez ?? []) namen.set(r.id as string, r.name as string);
  }

  const nachVorlage = new Map<string, DayTemplateItem[]>();
  for (const i of items) {
    const list = nachVorlage.get(i.template_id) ?? [];
    list.push({
      id: i.id, meal_type: i.meal_type, recipe_id: i.recipe_id,
      recipeName: namen.get(i.recipe_id) ?? "Gelöschtes Rezept",
      sort_order: i.sort_order,
      training_only: i.training_only,
    });
    nachVorlage.set(i.template_id, list);
  }

  return liste.map((v) => ({ ...v, items: nachVorlage.get(v.id) ?? [] }));
}

/**
 * Wie viele vorgekochte Portionen es je Rezept noch gibt.
 *
 * Zählt Boxen, die noch nicht abgehakt sind. Der Tausch-Dialog sortiert
 * damit nach oben, was ohnehin im Kühlschrank steht — sonst tauscht man
 * auf ein Rezept, das erst noch gekocht werden müsste, und steht am
 * Arbeitstag um 11:00 ohne Essen da.
 */
export async function fetchPrepStock(): Promise<Record<string, number>> {
  const supabase = createMenuClient();
  if (!supabase) return {};

  const { data: offen } = await supabase.from("batch_portions")
    .select("batch_id").eq("consumed", false);
  const boxen = (offen ?? []) as { batch_id: string }[];
  if (boxen.length === 0) return {};

  const batchIds = [...new Set(boxen.map((b) => b.batch_id))];
  const { data: batches } = await supabase.from("prep_batches")
    .select("id, recipe_id").in("id", batchIds);

  const rezeptJeBatch = new Map(
    (batches ?? []).map((b) => [b.id as string, b.recipe_id as string])
  );

  const bestand: Record<string, number> = {};
  for (const b of boxen) {
    const recipeId = rezeptJeBatch.get(b.batch_id);
    if (!recipeId) continue;
    bestand[recipeId] = (bestand[recipeId] ?? 0) + 1;
  }
  return bestand;
}

/* ------------------------------------------------------------ Tagesplan */

export interface PlanMeal {
  id: string;
  meal_type: string;
  name: string;
  kcal_total: number;
  protein_total: number;
  /** Aus den Positionen summiert — `meals` führt dafür keine Spalte. */
  kh_total: number;
  fett_total: number;
  eaten: boolean;
  items: { id: string; food_name: string; amount: number; unit: string; eaten: boolean }[];
}

export interface PlanPortion {
  id: string;
  meal_type: string;
  consumed: boolean;
  name: string;
  kcal: number;
  protein: number;
  kh: number;
  fett: number;
}

export interface DayView {
  date: string;
  kcal: number;
  protein: number;
  kh: number;
  fett: number;
  /** Bereits abgehakt. */
  gegessenKcal: number;
  gegessenProtein: number;
  gegessenKh: number;
  gegessenFett: number;
  meals: PlanMeal[];
  portions: PlanPortion[];
  marker: { training: boolean; eingeladen: boolean; is_free: boolean } | null;
  ziele: { kcal: number; protein: number };
}

/** Ein Tag mit allem, was die Plan-Ansicht braucht. */
export async function fetchDayView(date: string): Promise<DayView | null> {
  const supabase = createMenuClient();
  if (!supabase) return null;

  const [{ data: plans }, { data: portionRows }, { data: markerRows }, { data: settingRows }] =
    await Promise.all([
      supabase.from("meal_plans")
        .select("id, kcal_total, protein_total").eq("date", date),
      supabase.from("batch_portions")
        .select("id, meal_type, consumed, batch_id").eq("date", date),
      supabase.from("day_markers")
        .select("training, eingeladen, is_free").eq("date", date).maybeSingle(),
      supabase.from("settings").select("key, value")
        .in("key", ["kcal_ziel", "protein_ziel"]),
    ]);

  const planIds = (plans ?? []).map((p) => p.id as string);

  // Mahlzeiten samt Positionen
  const meals: PlanMeal[] = [];
  if (planIds.length > 0) {
    const { data: mealRows } = await supabase.from("meals")
      .select("id, meal_type, name, kcal_total, protein_total, eaten")
      .in("plan_id", planIds);
    const ids = (mealRows ?? []).map((m) => m.id as string);
    const itemsByMeal = new Map<string, PlanMeal["items"]>();
    const makroJeMeal = new Map<string, { kh: number; fett: number }>();
    if (ids.length > 0) {
      const { data: itemRows } = await supabase.from("meal_items")
        .select("id, meal_id, food_name, amount, unit, eaten, carbs, fat")
        .in("meal_id", ids);
      for (const i of itemRows ?? []) {
        const list = itemsByMeal.get(i.meal_id as string) ?? [];
        list.push({
          id: i.id as string, food_name: i.food_name as string,
          amount: Number(i.amount ?? 0), unit: (i.unit as string) ?? "g",
          eaten: Boolean(i.eaten),
        });
        itemsByMeal.set(i.meal_id as string, list);

        // KH und Fett hat nur die Position, nicht die Mahlzeit: `meals` führt
        // Summen für kcal und Protein, für die anderen zwei nicht. Statt eine
        // Spalte nachzurüsten, die Trigger füllen müssten, wird hier summiert.
        const bisher = makroJeMeal.get(i.meal_id as string) ?? { kh: 0, fett: 0 };
        makroJeMeal.set(i.meal_id as string, {
          kh: bisher.kh + Number(i.carbs ?? 0),
          fett: bisher.fett + Number(i.fat ?? 0),
        });
      }
    }
    for (const m of mealRows ?? []) {
      const makro = makroJeMeal.get(m.id as string) ?? { kh: 0, fett: 0 };
      meals.push({
        id: m.id as string, meal_type: m.meal_type as string, name: m.name as string,
        kcal_total: Number(m.kcal_total ?? 0), protein_total: Number(m.protein_total ?? 0),
        kh_total: makro.kh, fett_total: makro.fett,
        eaten: Boolean(m.eaten), items: itemsByMeal.get(m.id as string) ?? [],
      });
    }
  }

  // Boxen samt Rezeptname und Werten pro Portion
  const portions: PlanPortion[] = [];
  const batchIds = [...new Set((portionRows ?? []).map((p) => p.batch_id as string))];
  if (batchIds.length > 0) {
    const { data: batches } = await supabase.from("prep_batches")
      .select("id, recipe_id, kcal_per_portion, protein_per_portion, carbs_per_portion, fat_per_portion")
      .in("id", batchIds);
    const byId = new Map((batches ?? []).map((b) => [b.id as string, b]));
    const recipeIds = [...new Set((batches ?? []).map((b) => b.recipe_id as string))];
    const namen = new Map<string, string>();
    if (recipeIds.length > 0) {
      const { data: rez } = await supabase.from("recipes")
        .select("id, name").in("id", recipeIds);
      for (const r of rez ?? []) namen.set(r.id as string, r.name as string);
    }
    for (const p of portionRows ?? []) {
      const b = byId.get(p.batch_id as string);
      portions.push({
        id: p.id as string, meal_type: p.meal_type as string,
        consumed: Boolean(p.consumed),
        name: (b && namen.get(b.recipe_id as string)) ?? "Box",
        kcal: Number(b?.kcal_per_portion ?? 0),
        protein: Number(b?.protein_per_portion ?? 0),
        kh: Number(b?.carbs_per_portion ?? 0),
        fett: Number(b?.fat_per_portion ?? 0),
      });
    }
  }

  const settings = new Map((settingRows ?? []).map((s) => [s.key as string, s.value as string]));

  // Geplant kommt aus meal_plans (dort addieren die Trigger beide Quellen);
  // gegessen wird aus den Häkchen gerechnet.
  const kcal = Math.max(0, ...(plans ?? []).map((p) => Number(p.kcal_total ?? 0)));
  const protein = Math.max(0, ...(plans ?? []).map((p) => Number(p.protein_total ?? 0)));

  const gegessen = <T,>(
    ausMeal: (m: PlanMeal) => number, ausPortion: (p: PlanPortion) => number,
  ) =>
    meals.filter((m) => m.eaten).reduce((s, m) => s + ausMeal(m), 0) +
    portions.filter((p) => p.consumed).reduce((s, p) => s + ausPortion(p), 0);

  const gegessenKcal = gegessen((m) => m.kcal_total, (p) => p.kcal);
  const gegessenProtein = gegessen((m) => m.protein_total, (p) => p.protein);
  const gegessenKh = gegessen((m) => m.kh_total, (p) => p.kh);
  const gegessenFett = gegessen((m) => m.fett_total, (p) => p.fett);

  return {
    date,
    kcal: kcal || meals.reduce((s, m) => s + m.kcal_total, 0)
      + portions.reduce((s, p) => s + p.kcal, 0),
    protein: protein || meals.reduce((s, m) => s + m.protein_total, 0)
      + portions.reduce((s, p) => s + p.protein, 0),
    // KH und Fett kommen IMMER aus der Summe der Positionen — anders als bei
    // kcal/Protein gibt es dafür keine Trigger-Spalte in `meal_plans`.
    kh: meals.reduce((s, m) => s + m.kh_total, 0) + portions.reduce((s, p) => s + p.kh, 0),
    fett: meals.reduce((s, m) => s + m.fett_total, 0) + portions.reduce((s, p) => s + p.fett, 0),
    gegessenKcal, gegessenProtein, gegessenKh, gegessenFett,
    meals: meals.sort(
      (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
    ),
    portions: portions.sort(
      (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
    ),
    marker: (markerRows as DayView["marker"]) ?? null,
    ziele: {
      kcal: parseInt(settings.get("kcal_ziel") ?? "") || 2000,
      protein: parseInt(settings.get("protein_ziel") ?? "") || 150,
    },
  };
}

/** Tagessummen eines Zeitraums - für Wochen- und Monatsraster. */
export async function fetchRangeTotals(
  von: string, bis: string
): Promise<Map<string, { kcal: number; protein: number }>> {
  const result = new Map<string, { kcal: number; protein: number }>();
  const supabase = createMenuClient();
  if (!supabase) return result;

  const { data } = await supabase.from("meal_plans")
    .select("date, kcal_total, protein_total").gte("date", von).lte("date", bis);

  for (const p of data ?? []) {
    const d = p.date as string;
    const kcal = Number(p.kcal_total ?? 0);
    const vorhanden = result.get(d);
    // Mehrere Zeilen pro Datum kommen vor - die vollere gewinnt
    if (!vorhanden || kcal > vorhanden.kcal) {
      result.set(d, { kcal, protein: Number(p.protein_total ?? 0) });
    }
  }
  return result;
}

/** Eine Mahlzeit, wie sie das Tagesmenü (die drei Pünktchen) braucht. */
export interface RangeMeal {
  id: string;
  meal_type: string;
  name: string;
  kcal: number;
}

/**
 * Alle frei geplanten Mahlzeiten eines Zeitraums, nach Datum gruppiert —
 * Grundlage für die drei Pünktchen in der Wochen- und der Monatsansicht.
 *
 * Bewusst nur `meals`-Zeilen, keine Prep-Boxen: verschieben, kopieren und
 * löschen laufen über Mahlzeiten-IDs, und eine Box aus `batch_portions` hat
 * keine. Sie hier mitzuliefern hiesse, Einträge zum Anhaken anzubieten, mit
 * denen keine der drei Aktionen etwas anfangen kann.
 */
export async function fetchRangeMeals(
  von: string, bis: string
): Promise<Map<string, RangeMeal[]>> {
  const result = new Map<string, RangeMeal[]>();
  const supabase = createMenuClient();
  if (!supabase) return result;

  const { data: planRows } = await supabase.from("meal_plans")
    .select("id, date").gte("date", von).lte("date", bis);
  const plans = (planRows ?? []) as { id: string; date: string }[];
  if (plans.length === 0) return result;

  // Mehrere meal_plans-Zeilen pro Datum sind möglich (siehe fetchEssenWoche);
  // deshalb Plan -> Datum, nicht Datum -> Plan.
  const datumFuerPlan = new Map(plans.map((p) => [p.id, p.date]));

  // Ein voller Monat liegt bei rund 150 Zeilen, die PostgREST-Grenze von 1000
  // ist also weit weg. Trotzdem ausgeschrieben, damit nie stillschweigend
  // abgeschnitten wird, falls hier je ein Jahr angefragt wird.
  const { data: mealRows } = await supabase.from("meals")
    .select("id, plan_id, meal_type, name, kcal_total")
    .in("plan_id", plans.map((p) => p.id))
    .range(0, 999);

  for (const m of (mealRows ?? []) as unknown as {
    id: string; plan_id: string; meal_type: string;
    name: string; kcal_total: number | null;
  }[]) {
    const datum = datumFuerPlan.get(m.plan_id);
    if (!datum) continue;
    const liste = result.get(datum) ?? [];
    liste.push({
      id: m.id,
      meal_type: m.meal_type,
      name: m.name,
      kcal: Math.round(Number(m.kcal_total ?? 0)),
    });
    result.set(datum, liste);
  }

  for (const liste of result.values()) {
    liste.sort(
      (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
    );
  }
  return result;
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

  const mealRows = (meals ?? []) as unknown as (MenuMeal & { id: string })[];
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

/* ---------------------------------------------------------- Einstellungen */

export const SETTING_DEFAULTS = {
  kcal_ziel: "2000",
  protein_ziel: "150",
  kosten_ziel: "20",
  /**
   * Kohlenhydrat- und Fettziel in Gramm. Leer heisst: nicht angelegt, und
   * dann zeigt der Tag dafür auch keinen Ring. Kein Standardwert — ein
   * erfundenes Ziel wäre schlimmer als keins, man würde sich daran messen.
   */
  kh_ziel: "",
  fett_ziel: "",
  /** Rezept, das automatisch als Frühstück gesetzt wird. Leer = keins. */
  default_breakfast_recipe_id: "",
  /** Optional dasselbe für einen Standard-Snack. */
  default_snack_recipe_id: "",
};

/** Alle Einstellungen, mit Defaults aufgefüllt. */
export async function fetchMenuSettings(): Promise<Record<string, string>> {
  const supabase = createMenuClient();
  if (!supabase) return { ...SETTING_DEFAULTS };

  const { data } = await supabase.from("settings").select("key, value");
  const result: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of data ?? []) result[r.key as string] = r.value as string;
  return result;
}

/** Regel, die an Tagen mit Marker (Training/Eingeladen) ein Rezept vorschlägt. */
export interface EventRule {
  id: string;
  event_type: string; // training | eingeladen
  meal_type: string;
  recipe_id: string;
  recipeName: string;
}

export async function fetchEventRules(): Promise<EventRule[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  const { data: rules } = await supabase.from("event_meal_rules")
    .select("id, event_type, meal_type, recipe_id").order("created_at");
  const list = rules ?? [];
  if (list.length === 0) return [];

  const recipeIds = [...new Set(list.map((r) => r.recipe_id as string))];
  const namen = new Map<string, string>();
  if (recipeIds.length > 0) {
    const { data: rez } = await supabase.from("recipes")
      .select("id, name").in("id", recipeIds);
    for (const r of rez ?? []) namen.set(r.id as string, r.name as string);
  }

  return list.map((r) => ({
    id: r.id as string,
    event_type: r.event_type as string,
    meal_type: r.meal_type as string,
    recipe_id: r.recipe_id as string,
    recipeName: namen.get(r.recipe_id as string) ?? "Unbekanntes Rezept",
  }));
}

/* ------------------------------------------------------------- Auswertung */

export interface DayPoint {
  date: string;
  kcal: number;
  protein: number;
  cost: number;
  /** Tag hatte vorgekochte Boxen. */
  isPrep: boolean;
  isFree: boolean;
}

/**
 * Tagesreihe der letzten `weeks` Wochen samt Kosten und Kennzeichen, ob es
 * ein Meal-Prep-Tag oder ein freier Tag war. Bewusst flache Abfragen statt
 * eingebetteter Joins - wie überall sonst in dieser Datei.
 */
export async function fetchDaySeries(weeks: number): Promise<DayPoint[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  const von = isoPlus(-weeks * 7);
  const bis = isoPlus(0);

  const [{ data: planRows }, { data: portionRows }, { data: markerRows }] = await Promise.all([
    supabase.from("meal_plans")
      .select("date, kcal_total, protein_total, cost_total")
      .gte("date", von).lte("date", bis),
    supabase.from("batch_portions").select("date").gte("date", von).lte("date", bis),
    supabase.from("day_markers").select("date, is_free").gte("date", von).lte("date", bis),
  ]);

  const prepDates = new Set((portionRows ?? []).map((p) => p.date as string));
  const freeDates = new Set(
    (markerRows ?? []).filter((m) => m.is_free).map((m) => m.date as string)
  );

  // Mehrere meal_plans-Zeilen pro Datum sind möglich - die vollere gewinnt.
  const byDate = new Map<string, { kcal: number; protein: number; cost: number }>();
  for (const p of planRows ?? []) {
    const d = p.date as string;
    const kcal = Number(p.kcal_total ?? 0);
    const vorhanden = byDate.get(d);
    if (!vorhanden || kcal > vorhanden.kcal) {
      byDate.set(d, {
        kcal, protein: Number(p.protein_total ?? 0), cost: Number(p.cost_total ?? 0),
      });
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, t]) => ({
      date, kcal: t.kcal, protein: t.protein, cost: t.cost,
      isPrep: prepDates.has(date), isFree: freeDates.has(date),
    }));
}

export interface WeekBucket {
  start: string;
  label: string;
  tage: number;
  kcal: number;
  protein: number;
  cost: number;
}

/** Fasst die Tagesreihe zu Wochen zusammen. Leere Tage zählen nicht mit. */
export function toWeekBuckets(days: DayPoint[]): WeekBucket[] {
  const map = new Map<string, DayPoint[]>();
  for (const d of days) {
    if (d.kcal <= 0) continue;
    const start = weekStart(d.date);
    const list = map.get(start) ?? [];
    list.push(d);
    map.set(start, list);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, list]) => ({
      start,
      label: new Date(start + "T12:00:00")
        .toLocaleDateString("de-CH", { day: "numeric", month: "short" }),
      tage: list.length,
      kcal: Math.round((avg(list.map((d) => d.kcal))) * 10) / 10,
      protein: Math.round((avg(list.map((d) => d.protein))) * 10) / 10,
      cost: Math.round(list.reduce((s, d) => s + d.cost, 0) * 100) / 100,
    }));
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Meistgekochte Rezepte der letzten 90 Tage (als Topf angelegt). */
export async function fetchTopRecipes(limit = 8): Promise<{ name: string; count: number }[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  const von = isoPlus(-90);
  const { data: cycles } = await supabase.from("prep_cycles")
    .select("id").gte("cook_date", von);
  const cycleIds = (cycles ?? []).map((c) => c.id as string);
  if (cycleIds.length === 0) return [];

  const { data: batches } = await supabase.from("prep_batches")
    .select("recipe_id").in("cycle_id", cycleIds);
  const recipeIds = [...new Set((batches ?? []).map((b) => b.recipe_id as string))];
  if (recipeIds.length === 0) return [];

  const { data: rez } = await supabase.from("recipes").select("id, name").in("id", recipeIds);
  const namen = new Map((rez ?? []).map((r) => [r.id as string, r.name as string]));

  const counts = new Map<string, number>();
  for (const b of batches ?? []) {
    const name = namen.get(b.recipe_id as string);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Meistverwendete Lebensmittel der letzten 90 Tage (freie Mahlzeiten). */
export async function fetchTopFoods(limit = 8): Promise<{ name: string; count: number }[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  const von = isoPlus(-90);
  const { data: plans } = await supabase.from("meal_plans").select("id").gte("date", von);
  const planIds = (plans ?? []).map((p) => p.id as string);
  if (planIds.length === 0) return [];

  const { data: meals } = await supabase.from("meals").select("id").in("plan_id", planIds);
  const mealIds = (meals ?? []).map((m) => m.id as string);
  if (mealIds.length === 0) return [];

  const counts = new Map<string, number>();
  for (let i = 0; i < mealIds.length; i += 200) {
    const { data: items } = await supabase.from("meal_items")
      .select("food_name").in("meal_id", mealIds.slice(i, i + 200));
    for (const it of items ?? []) {
      const name = it.food_name as string;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Ranking: Protein bzw. Kalorien pro Franken. Lebensmittel ohne Preis fallen raus. */
export function foodValueRanking(
  foods: Food[], metric: "protein" | "kcal", limit = 10
): { id: string; name: string; value: number }[] {
  const spalte = metric === "protein" ? "protein_per_100" : "calories_per_100";
  return foods
    .filter((f) => f.cost_per_100 > 0)
    .map((f) => ({
      id: f.id, name: f.name,
      value: Math.round((f[spalte] / f.cost_per_100) * 10) / 10,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
