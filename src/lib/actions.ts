"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createMenuClient } from "@/lib/supabase/menu";
import { heuteISO, addDays } from "@/lib/time";
import { rechne, summe, type FoodValues } from "@/lib/nutrition";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");
  return { supabase, userId: user.id };
}

/** Wirft, statt Fehler stillschweigend zu verschlucken. */
function check(res: { error: { message: string } | null }, was: string) {
  if (res.error) throw new Error(`${was}: ${res.error.message}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Die Slots, die die Datenbank in meal_type zulässt. */
const ERLAUBTE_SLOTS = ["fruehstueck", "mittagessen", "abendessen", "snack"];
const numOrNull = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const numOr = (fd: FormData, k: string, fallback: number) => numOrNull(fd, k) ?? fallback;

/* ------------------------------------------------------ Schnellerfassung */


/* -------------------------------------------------------- Einkaufsliste */
// Schreibt in die shopping_list der Menü-Datenbank - gleiche Liste wie in
// der Menü-App, nur von KerimOS aus bedienbar.

const revalidateEssen = () => { revalidatePath("/m/Essen"); revalidatePath("/"); };

export async function toggleShoppingItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("shopping_list")
    .update({ checked: fd.get("checked") === "true" })
    .eq("id", str(fd, "id")), "Einkauf abhaken");
  revalidateEssen();
}

export async function addShoppingItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const item = str(fd, "item");
  if (!item) return;
  check(await menu.from("shopping_list").insert({
    item,
    quantity: str(fd, "quantity") || null,
    checked: false,
  }), "Einkauf hinzufügen");
  revalidateEssen();
}

/* ------------------------------------------------ Menüplan: Prep-Zyklen */

/** Alle Tage von start bis ende, einschliesslich. */

type MenuClientTyp = NonNullable<ReturnType<typeof createMenuClient>>;

/** Nährwerte und Kosten für eine Portion eines Rezepts. */

/** Stellt sicher, dass für jeden Tag ein Tagesplan existiert. */

/** Box einem Tag zuweisen - für überzählige Portionen aus dem Kühlschrank. */

/* ------------------------------------------- Menüplan: Lebensmittel */

const revalidateEssenAlles = () => {
  ["/m/Essen", "/m/Essen/plan", "/m/Essen/rezepte", "/m/Essen/lebensmittel",
   "/"].forEach((p) => revalidatePath(p));
};

export async function createFood(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const name = str(fd, "name");
  if (!name) return;

  const einheit = str(fd, "unit");
  check(await menu.from("foods").insert({
    name,
    unit: ["g", "ml", "stk"].includes(einheit) ? einheit : "g",
    calories_per_100: numOr(fd, "kcal", 0),
    protein_per_100: numOr(fd, "protein", 0),
    carbs_per_100: numOr(fd, "carbs", 0),
    fat_per_100: numOr(fd, "fat", 0),
    cost_per_100: numOr(fd, "cost", 0),
    category_id: str(fd, "category_id") || null,
  }), "Lebensmittel anlegen");
  revalidateEssenAlles();
}

export async function updateFood(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const id = str(fd, "id");
  if (!id) return;

  const felder: Record<string, unknown> = {
    name: str(fd, "name"),
    calories_per_100: numOr(fd, "kcal", 0),
    protein_per_100: numOr(fd, "protein", 0),
    carbs_per_100: numOr(fd, "carbs", 0),
    fat_per_100: numOr(fd, "fat", 0),
    cost_per_100: numOr(fd, "cost", 0),
  };
  if (fd.has("category_id")) felder.category_id = str(fd, "category_id") || null;

  check(await menu.from("foods").update(felder).eq("id", id), "Lebensmittel speichern");
  revalidateEssenAlles();
}

/* ----------------------------------------- Menüplan: Lebensmittel-Kategorien */

export async function createFoodCategory(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const name = str(fd, "name");
  if (!name) return;
  check(await menu.from("food_categories").insert({ name }), "Kategorie anlegen");
  revalidateEssenAlles();
}

export async function deleteFoodCategory(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("food_categories").delete().eq("id", str(fd, "id")),
    "Kategorie löschen");
  revalidateEssenAlles();
}

export async function deleteFood(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("foods").delete().eq("id", str(fd, "id")),
    "Lebensmittel löschen");
  revalidateEssenAlles();
}

/* ------------------------------------------------ Menüplan: Rezepte */

export async function createRecipe(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const name = str(fd, "name");
  if (!name) return;

  const typ = str(fd, "meal_type");
  check(await menu.from("recipes").insert({
    name,
    meal_type: ["fruehstueck", "mittagessen", "abendessen", "snack"].includes(typ)
      ? typ : "mittagessen",
    default_portions: Math.min(14, Math.max(1, Math.round(numOr(fd, "portions", 3)))),
    freetext: str(fd, "freetext") || "",
    status: "bereit",
    category_id: str(fd, "category_id") || null,
  }), "Rezept anlegen");
  revalidateEssenAlles();
}

/**
 * Menü direkt schreiben statt aus der Rezeptliste wählen.
 *
 * Legt Rezept und Zutaten in einem Schritt an und gibt die id zurück, damit
 * der Prep-Planer den Topf sofort setzen kann. Mengen gelten für EINE Portion
 * — so werden recipe_items ohnehin gespeichert; wie oft gekocht wird,
 * entscheidet der Zeitraum im Planer.
 *
 * Ein Topf braucht zwingend eine recipe_id, sonst greifen Einkaufs- und
 * Kochliste nicht. Darum entsteht auch beim "freien" Menü ein echtes Rezept.
 */
export async function createRecipeWithItems(fd: FormData): Promise<string | null> {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return null;

  const name = str(fd, "name").trim();
  if (!name) return null;
  const typ = str(fd, "meal_type");
  const positionen = JSON.parse(String(fd.get("items") ?? "[]")) as {
    food_id: string | null; food_name: string; amount: number; unit: string;
  }[];
  if (positionen.length === 0) return null;

  const { data: rezept, error } = await menu.from("recipes").insert({
    name,
    meal_type: ["fruehstueck", "mittagessen", "abendessen", "snack"].includes(typ)
      ? typ : "mittagessen",
    default_portions: Math.min(14, Math.max(1, Math.round(numOr(fd, "portions", 3)))),
    freetext: str(fd, "freetext") || "",
    status: "bereit",
    category_id: str(fd, "category_id") || null,
  }).select("id").single();
  if (error) throw new Error(`Menü anlegen: ${error.message}`);

  check(await menu.from("recipe_items").insert(
    positionen.map((p, i) => ({
      recipe_id: rezept.id,
      food_id: p.food_id,
      food_name: p.food_name,
      amount_per_portion: p.amount,
      unit: ["g", "ml", "dl", "l", "stk"].includes(p.unit) ? p.unit : "g",
      sort_order: i,
    }))
  ), "Zutaten speichern");

  revalidateEssenAlles();
  return rezept.id as string;
}

export async function updateRecipe(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const id = str(fd, "id");
  if (!id) return;

  const felder: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fd.has("name")) felder.name = str(fd, "name");
  if (fd.has("meal_type")) felder.meal_type = str(fd, "meal_type");
  if (fd.has("portions")) {
    felder.default_portions = Math.min(14, Math.max(1, Math.round(numOr(fd, "portions", 3))));
  }
  if (fd.has("freetext")) felder.freetext = str(fd, "freetext");
  if (fd.has("favorite")) felder.is_favorite = fd.get("favorite") === "true";
  if (fd.has("category_id")) felder.category_id = str(fd, "category_id") || null;

  check(await menu.from("recipes").update(felder).eq("id", id), "Rezept speichern");
  revalidateEssenAlles();
}

/* ------------------------------------------- Menüplan: Tagesvorlagen */

/**
 * Tagesvorlage anlegen: ein ganzer Tag aus Rezepten.
 *
 * `items` ist eine Liste aus Slot und Rezept — z.B. Mittag und Abend, bei
 * Bedarf zusätzlich Snacks. Gespeichert werden nur die Verweise; die Mengen
 * kommen beim Laden aus dem jeweiligen Rezept, damit eine Rezeptänderung
 * auch in der Vorlage ankommt.
 */
export async function createDayTemplate(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;

  const name = str(fd, "name").trim();
  if (!name) return;

  const items = JSON.parse(String(fd.get("items") ?? "[]")) as {
    meal_type: string; recipe_id: string; training_only?: boolean;
  }[];
  const gueltig = items.filter((i) =>
    i.recipe_id && ERLAUBTE_SLOTS.includes(i.meal_type));
  if (gueltig.length === 0) return;

  const { data: vorlage, error } = await menu.from("day_templates").insert({
    name,
    with_snacks: gueltig.some((i) => i.meal_type === "snack"),
  }).select("id").single();
  if (error) throw new Error(`Vorlage anlegen: ${error.message}`);

  check(await menu.from("day_template_items").insert(
    gueltig.map((i, n) => ({
      template_id: vorlage.id,
      meal_type: i.meal_type,
      recipe_id: i.recipe_id,
      sort_order: n,
      // Zeilen, die es nur an Trainingstagen gibt - beim Einfügen ohne
      // Training werden sie gar nicht erst angeboten.
      training_only: Boolean(i.training_only),
    }))
  ), "Vorlage speichern");

  revalidateEssenAlles();
}

export async function deleteDayTemplate(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("day_templates").delete().eq("id", str(fd, "id")),
    "Vorlage löschen");
  revalidateEssenAlles();
}

/**
 * Eine Zeile der Vorlage ans Training binden — oder wieder lösen.
 *
 * Trainingsgebundene Zeilen (typisch das Porridge) erscheinen beim
 * Einfügen ohne Training gar nicht erst in der Auswahl. Die Vorlage selbst
 * bleibt eine einzige — sie gibt es nur in zwei Ausführungen.
 */
export async function setTemplateItemTrainingOnly(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;

  const id = str(fd, "id");
  if (!id) return;

  check(await menu.from("day_template_items")
    .update({ training_only: String(fd.get("training_only")) === "true" })
    .eq("id", id), "Zeile ändern");

  revalidateEssenAlles();
}

/**
 * Vorlage auf ein Datum laden: legt für jedes gewählte Rezept eine
 * Mahlzeit an diesem Tag an, samt Zutaten und Nährwerten.
 *
 * Zwei Wege hinein:
 *   - `auswahl` (JSON): so schickt der Vorlagen-Dialog seine Zeilen, samt
 *     Portionsfaktor und bereits getauschten Rezepten. Der Normalfall.
 *   - nur `template_id`: lädt die Vorlage unverändert. Bleibt bestehen,
 *     damit ältere Aufrufe und Verknüpfungen weiter funktionieren.
 *
 * Bereits geplante Mahlzeiten bleiben stehen — die Vorlage ergänzt, sie
 * räumt nicht auf. Wer den Tag leer haben will, löscht ihn vorher; das ist
 * die seltenere Absicht und soll nicht aus Versehen passieren.
 */
export async function applyDayTemplate(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;

  const date = str(fd, "date");
  const templateId = str(fd, "template_id");
  if (!date) return;

  type Zeile = { meal_type: string; recipe_id: string; faktor: number };
  let zeilen: Zeile[] = [];

  const rohAuswahl = String(fd.get("auswahl") ?? "").trim();
  if (rohAuswahl) {
    const gewaehlt = JSON.parse(rohAuswahl) as {
      meal_type: string; recipe_id: string; faktor?: number;
    }[];
    zeilen = gewaehlt
      .filter((z) => z.recipe_id && ERLAUBTE_SLOTS.includes(z.meal_type))
      // Nur die drei angebotenen Portionsgrössen zulassen, damit über das
      // Formular keine krummen Faktoren hereinkommen.
      .map((z) => ({
        meal_type: z.meal_type,
        recipe_id: z.recipe_id,
        faktor: [0.5, 1, 1.5].includes(Number(z.faktor)) ? Number(z.faktor) : 1,
      }));
  } else {
    if (!templateId) return;
    const { data: items } = await menu.from("day_template_items")
      .select("meal_type, recipe_id").eq("template_id", templateId).order("sort_order");
    zeilen = ((items ?? []) as { meal_type: string; recipe_id: string }[])
      .map((z) => ({ ...z, faktor: 1 }));
  }

  if (zeilen.length === 0) return;

  const recipeIds = [...new Set(zeilen.map((z) => z.recipe_id))];
  const [{ data: rezepte }, { data: zutaten }] = await Promise.all([
    menu.from("recipes").select("id, name").in("id", recipeIds),
    menu.from("recipe_items")
      .select("recipe_id, food_id, food_name, amount_per_portion, unit, sort_order")
      .in("recipe_id", recipeIds).order("sort_order"),
  ]);

  const namen = new Map((rezepte ?? []).map((r) => [r.id as string, r.name as string]));
  const nachRezept = new Map<string, {
    food_id: string | null; food_name: string; amount: number; unit: string;
  }[]>();
  for (const z of zutaten ?? []) {
    const list = nachRezept.get(z.recipe_id as string) ?? [];
    list.push({
      food_id: (z.food_id as string | null) ?? null,
      food_name: z.food_name as string,
      amount: Number(z.amount_per_portion ?? 0),
      unit: (z.unit as string) ?? "g",
    });
    nachRezept.set(z.recipe_id as string, list);
  }

  // Nährwerte je Zutat aus der Lebensmittel-Tabelle rechnen — dieselbe
  // Rechnung wie im Mahlzeiten-Formular, damit die Zahlen übereinstimmen.
  const foodIds = [...new Set(
    [...nachRezept.values()].flat().map((z) => z.food_id).filter(Boolean) as string[]
  )];
  const foods = new Map<string, FoodValues>();
  if (foodIds.length > 0) {
    const { data: f } = await menu.from("foods")
      .select("id, calories_per_100, protein_per_100, carbs_per_100, fat_per_100, cost_per_100")
      .in("id", foodIds);
    for (const row of f ?? []) {
      foods.set(row.id as string, {
        calories_per_100: Number(row.calories_per_100 ?? 0),
        protein_per_100: Number(row.protein_per_100 ?? 0),
        carbs_per_100: Number(row.carbs_per_100 ?? 0),
        fat_per_100: Number(row.fat_per_100 ?? 0),
        cost_per_100: Number(row.cost_per_100 ?? 0),
      });
    }
  }

  // Tagesplan sicherstellen (mehrere Zeilen je Datum sind möglich)
  const { data: vorhanden } = await menu.from("meal_plans")
    .select("id").eq("date", date).limit(1);
  let planId = vorhanden?.[0]?.id as string | undefined;
  if (!planId) {
    const { data: neu, error } = await menu.from("meal_plans")
      .insert({ date }).select("id").single();
    if (error) throw new Error(`Tagesplan anlegen: ${error.message}`);
    planId = neu.id as string;
  }

  for (const zeile of zeilen) {
    const name = namen.get(zeile.recipe_id);
    if (!name) continue;

    // Halbe oder anderthalbfache Portion steht im Namen, sonst sieht man
    // im Tag nicht mehr, warum die Zahlen von der Vorlage abweichen.
    const anzeige = zeile.faktor === 1
      ? name
      : `${name} (${String(zeile.faktor).replace(".", ",")}×)`;

    const { data: meal, error: mealError } = await menu.from("meals")
      .insert({ plan_id: planId, meal_type: zeile.meal_type, name: anzeige })
      .select("id").single();
    if (mealError) throw new Error(`Mahlzeit anlegen: ${mealError.message}`);

    const positionen = nachRezept.get(zeile.recipe_id) ?? [];
    if (positionen.length === 0) continue;

    check(await menu.from("meal_items").insert(
      positionen.map((p) => {
        // Der Faktor wirkt auf die Menge; die Nährwerte werden aus der
        // skalierten Menge gerechnet, damit Menge und Werte zusammenpassen.
        const menge = Math.round(p.amount * zeile.faktor * 100) / 100;
        const f = p.food_id ? foods.get(p.food_id) : undefined;
        const w = f ? rechne(f, menge, p.unit)
          : { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
        return {
          meal_id: meal.id,
          food_id: p.food_id,
          food_name: p.food_name,
          amount: menge,
          unit: p.unit,
          kcal: w.kcal, protein: w.protein, carbs: w.carbs, fat: w.fat, cost: w.cost,
          eaten: false,
        };
      })
    ), "Zutaten der Vorlage speichern");
  }

  revalidateEssenAlles();
}

/* --------------------------------------- Menüplan: Rezept-Vorlagen-Kategorien */

export async function createRecipeCategory(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const name = str(fd, "name");
  if (!name) return;
  check(await menu.from("template_categories").insert({ name }), "Kategorie anlegen");
  revalidateEssenAlles();
}

export async function deleteRecipeCategory(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("template_categories").delete().eq("id", str(fd, "id")),
    "Kategorie löschen");
  revalidateEssenAlles();
}

export async function deleteRecipe(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("recipes").delete().eq("id", str(fd, "id")), "Rezept löschen");
  revalidateEssenAlles();
}

/** Zutat ans Rezept hängen. Mengen sind immer pro Portion. */
export async function addRecipeItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const recipeId = str(fd, "recipe_id");
  const name = str(fd, "food_name");
  const menge = numOrNull(fd, "amount");
  if (!recipeId || !name || menge === null || menge <= 0) return;

  const einheit = str(fd, "unit");
  check(await menu.from("recipe_items").insert({
    recipe_id: recipeId,
    food_id: str(fd, "food_id") || null,
    food_name: name,
    amount_per_portion: menge,
    unit: ["g", "ml", "dl", "l", "stk"].includes(einheit) ? einheit : "g",
    sort_order: Math.round(numOr(fd, "sort_order", 0)),
  }), "Zutat hinzufügen");
  revalidateEssenAlles();
}

export async function updateRecipeItemAmount(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const menge = numOrNull(fd, "amount");
  if (menge === null || menge <= 0) return;
  check(await menu.from("recipe_items")
    .update({ amount_per_portion: menge })
    .eq("id", str(fd, "id")), "Menge speichern");
  revalidateEssenAlles();
}

export async function deleteRecipeItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("recipe_items").delete().eq("id", str(fd, "id")),
    "Zutat löschen");
  revalidateEssenAlles();
}

/* --------------------------------------------------- Menüplan: Einstellungen */

const revalidateEinstellungen = () => {
  ["/m/Essen/einstellungen", "/m/Essen/plan", "/m/Essen"]
    .forEach((p) => revalidatePath(p));
};

/** Eine einzelne Einstellung speichern (Tagesziel, Standard-Mahlzeit, ...). */
export async function saveMenuSetting(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const key = str(fd, "key");
  if (!key) return;
  check(await menu.from("settings").upsert(
    { key, value: str(fd, "value"), updated_at: new Date().toISOString() },
    { onConflict: "key" }
  ), "Einstellung speichern");
  revalidateEinstellungen();
}

/** Regel, die an Tagen mit Marker (Training/Eingeladen) ein Rezept vorschlägt. */
export async function addEventRule(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const eventType = str(fd, "event_type");
  const mealType = str(fd, "meal_type");
  const recipeId = str(fd, "recipe_id");
  if (!["training", "eingeladen"].includes(eventType) || !recipeId) return;
  check(await menu.from("event_meal_rules").insert({
    event_type: eventType, meal_type: mealType, recipe_id: recipeId,
  }), "Regel anlegen");
  revalidateEinstellungen();
}

export async function deleteEventRule(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("event_meal_rules").delete().eq("id", str(fd, "id")),
    "Regel löschen");
  revalidateEinstellungen();
}

/* --------------------------------------- Menüplan: Mahlzeit anlegen */

export interface NeueMahlzeitPosition {
  food_id: string | null;
  food_name: string;
  amount: number;
  unit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  cost: number;
}

/**
 * Legt eine Mahlzeit mit Positionen an - der Ersatz für den Sprung in die
 * alte App. Die Tagessummen rechnen die Trigger in der Datenbank, hier wird
 * nichts addiert.
 */
export async function createPlanMeal(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;

  const date = str(fd, "date");
  const mealType = str(fd, "meal_type");
  const name = str(fd, "name");
  const positionen = JSON.parse(
    String(fd.get("items") ?? "[]")
  ) as NeueMahlzeitPosition[];
  if (!date || !name || positionen.length === 0) return;

  // Tagesplan sicherstellen - mehrere Zeilen pro Datum sind möglich,
  // deshalb bewusst ohne maybeSingle.
  const { data: vorhanden } = await menu.from("meal_plans")
    .select("id").eq("date", date).limit(1);
  let planId = vorhanden?.[0]?.id as string | undefined;
  if (!planId) {
    const { data: neu, error } = await menu.from("meal_plans")
      .insert({ date }).select("id").single();
    if (error) throw new Error(`Tagesplan anlegen: ${error.message}`);
    planId = neu.id as string;
  }

  const { data: meal, error: mealError } = await menu.from("meals")
    .insert({ plan_id: planId, meal_type: mealType, name })
    .select("id").single();
  if (mealError) throw new Error(`Mahlzeit anlegen: ${mealError.message}`);

  check(await menu.from("meal_items").insert(
    positionen.map((p) => ({
      meal_id: meal.id,
      food_id: p.food_id,
      food_name: p.food_name,
      amount: p.amount,
      unit: p.unit,
      kcal: p.kcal,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      cost: p.cost,
      eaten: false,
    }))
  ), "Zutaten speichern");

  revalidateEssenAlles();
}

/* ------------------------------------------------------ Menüplan: Tagesplan */
// Alle Zugriffe laufen serverseitig über den Menü-Zugang. Die Tagessummen
// rechnen Trigger in der Datenbank - hier wird nie von Hand addiert.

const revalidatePlan = () => {
  ["/m/Essen", "/m/Essen/plan", "/"].forEach((p) => revalidatePath(p));
};

export async function toggleMealEaten(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("meals")
    .update({ eaten: fd.get("eaten") === "true" })
    .eq("id", str(fd, "id")), "Mahlzeit abhaken");
  revalidatePlan();
}

export async function toggleMealItemEaten(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("meal_items")
    .update({ eaten: fd.get("eaten") === "true" })
    .eq("id", str(fd, "id")), "Position abhaken");
  revalidatePlan();
}

export async function togglePortionConsumed(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("batch_portions")
    .update({ consumed: fd.get("consumed") === "true" })
    .eq("id", str(fd, "id")), "Box abhaken");
  revalidatePlan();
}

/** Nimmt eine Box aus dem Tag - der Zyklus behält Topf und Portionen. */
export async function removePortionFromDay(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("batch_portions")
    .delete().eq("id", str(fd, "id")), "Box entfernen");
  revalidatePlan();
}

export async function deletePlanMeal(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("meals")
    .delete().eq("id", str(fd, "id")), "Mahlzeit löschen");
  revalidatePlan();
}

/* ------------------------------------- Menüplan: geplante Mahlzeit ändern */
// Name, Mengen und Zusammensetzung einer bereits geplanten Mahlzeit. Die
// Tagessummen rechnen Trigger in der Datenbank nach - hier wird nie addiert.

/** Namen einer geplanten Mahlzeit ändern. */
export async function renamePlanMeal(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const name = str(fd, "name").trim();
  if (!name) return;
  check(await menu.from("meals")
    .update({ name }).eq("id", str(fd, "id")), "Mahlzeit umbenennen");
  revalidatePlan();
}

/**
 * Menge einer Position ändern.
 *
 * Nährwerte und Kosten skalieren proportional zur alten Menge. Das kommt ohne
 * erneuten Zugriff auf das Lebensmittel aus und funktioniert deshalb auch für
 * Positionen ohne food_id (Direkteingaben).
 */
export async function updatePlanMealItemAmount(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const id = str(fd, "id");
  const neu = Number(fd.get("amount"));
  if (!id || !Number.isFinite(neu) || neu <= 0) return;

  const { data: alt } = await menu.from("meal_items")
    .select("amount, kcal, protein, carbs, fat, cost").eq("id", id).single();
  if (!alt || !alt.amount || alt.amount <= 0) return;

  const r = neu / Number(alt.amount);
  const r1 = (v: unknown) => Math.round(Number(v ?? 0) * r * 10) / 10;

  check(await menu.from("meal_items").update({
    amount: neu,
    kcal: r1(alt.kcal),
    protein: r1(alt.protein),
    carbs: r1(alt.carbs),
    fat: r1(alt.fat),
    cost: Math.round(Number(alt.cost ?? 0) * r * 1000) / 1000,
  }).eq("id", id), "Menge ändern");
  revalidatePlan();
}

/** Einzelne Position aus einer geplanten Mahlzeit entfernen. */
export async function deletePlanMealItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("meal_items")
    .delete().eq("id", str(fd, "id")), "Position entfernen");
  revalidatePlan();
}

/** Weitere Position an eine bestehende Mahlzeit anhängen. */
export async function addPlanMealItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const mealId = str(fd, "meal_id");
  const positionen = JSON.parse(
    String(fd.get("items") ?? "[]")
  ) as NeueMahlzeitPosition[];
  if (!mealId || positionen.length === 0) return;

  check(await menu.from("meal_items").insert(
    positionen.map((p) => ({
      meal_id: mealId,
      food_id: p.food_id,
      food_name: p.food_name,
      amount: p.amount,
      unit: p.unit,
      kcal: p.kcal,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      cost: p.cost,
      eaten: false,
    }))
  ), "Zutat hinzufügen");
  revalidatePlan();
}

/**
 * Box aus dem Zyklus lösen und als frei geplante Mahlzeit dieses Tages
 * anlegen — danach ist sie wie jede andere Mahlzeit bearbeitbar.
 *
 * Der Prep-Zyklus bleibt unangetastet: Topf, Portionenzahl, Einkaufs- und
 * Kochliste ändern sich nicht. Nur diese eine Tageszuordnung wird ersetzt.
 * Die Zutaten kommen aus dem Rezept des Topfs, Mengen pro Portion, weil eine
 * Box genau eine Portion ist.
 */
export async function convertPortionToMeal(fd: FormData): Promise<string | null> {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return null;
  const portionId = str(fd, "id");
  if (!portionId) return null;

  const { data: portion } = await menu.from("batch_portions")
    .select("id, date, meal_type, consumed, prep_batches(recipe_id, recipes(name))")
    .eq("id", portionId).single();
  if (!portion) return null;

  const batch = portion.prep_batches as unknown as {
    recipe_id: string; recipes?: { name?: string } | null;
  } | null;
  const name = batch?.recipes?.name ?? "Box";

  const { data: zutaten } = await menu.from("recipe_items")
    .select("food_id, food_name, amount_per_portion, unit, foods(calories_per_100, protein_per_100, carbs_per_100, fat_per_100, cost_per_100, unit)")
    .eq("recipe_id", batch?.recipe_id ?? "")
    .order("sort_order");

  // Tagesplan sicherstellen — gleiche Logik wie createPlanMeal.
  const { data: vorhanden } = await menu.from("meal_plans")
    .select("id").eq("date", portion.date).limit(1);
  let planId = vorhanden?.[0]?.id as string | undefined;
  if (!planId) {
    const { data: neu, error } = await menu.from("meal_plans")
      .insert({ date: portion.date }).select("id").single();
    if (error) throw new Error(`Tagesplan anlegen: ${error.message}`);
    planId = neu.id as string;
  }

  const { data: meal, error: mealError } = await menu.from("meals")
    .insert({ plan_id: planId, meal_type: portion.meal_type, name })
    .select("id").single();
  if (mealError) throw new Error(`Mahlzeit anlegen: ${mealError.message}`);

  const positionen = (zutaten ?? []).map((z) => {
    const f = z.foods as unknown as {
      calories_per_100?: number; protein_per_100?: number; carbs_per_100?: number;
      fat_per_100?: number; cost_per_100?: number; unit?: string;
    } | null;
    const menge = Number(z.amount_per_portion ?? 0);
    // Stück rechnet je Stück, alles andere je 100 Einheiten.
    const faktor = z.unit === "stk" ? menge : menge / 100;
    const r1 = (v: unknown) => Math.round(Number(v ?? 0) * faktor * 10) / 10;
    return {
      meal_id: meal.id,
      food_id: z.food_id,
      food_name: z.food_name,
      amount: menge,
      unit: z.unit,
      kcal: r1(f?.calories_per_100),
      protein: r1(f?.protein_per_100),
      carbs: r1(f?.carbs_per_100),
      fat: r1(f?.fat_per_100),
      cost: Math.round(Number(f?.cost_per_100 ?? 0) * faktor * 1000) / 1000,
      eaten: Boolean(portion.consumed),
    };
  });

  if (positionen.length > 0) {
    check(await menu.from("meal_items").insert(positionen), "Zutaten übernehmen");
  }

  // Erst jetzt die Box aus dem Tag nehmen — sonst stünde bei einem Fehler
  // weder Box noch Mahlzeit im Plan.
  check(await menu.from("batch_portions")
    .delete().eq("id", portionId), "Box aus dem Tag nehmen");

  revalidatePlan();
  return meal.id as string;
}

/** Tagesmarker setzen: Training, Eingeladen, freier Tag. */
export async function setMenuDayMarker(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const date = str(fd, "date");
  const feld = str(fd, "feld");
  if (!date || !["training", "eingeladen", "is_free"].includes(feld)) return;

  check(await menu.from("day_markers").upsert(
    { date, [feld]: fd.get("wert") === "true" },
    { onConflict: "date" }
  ), "Tagesmarker speichern");
  revalidatePlan();
}

export async function deleteShoppingItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("shopping_list")
    .delete().eq("id", str(fd, "id")), "Einkauf löschen");
  revalidateEssen();
}

/* ----------------------------------------------------------------- Schlaf */


/* ---------------------------------------------------------------- Konten */

/* ----------------------------------------------------------- Kategorien */

/* --------------------------------------------------------- Transaktionen */

/* -------------------------------------------------------------- Fixkosten */

/* --------------------------------------------------------------- Szenarien */

/* ------------------------------------------------------------ Erst-Setup */

/** Legt Standard-Kategorien, ein Konto und die Fixkosten an. */

/* ------------------------------------------------------------ CSV-Import */

interface ImportPayloadRow {
  occurred_on: string;
  amount: number;
  description: string;
  counterparty: string | null;
  is_transfer?: boolean;
}

/* ------------------------------------------------------- Umbuchungsregeln */

/** Wendet die Regeln auf alle noch nicht kategorisierten Buchungen an. */

/** Verknüpft eine Aktivität mit einer Buchung - Grundlage der Stundenwert-Matrix. */

/** Farbe, Art und Eigenschaften jeder Kategorie, die eine Regel braucht. */


/** Markiert eine Buchung als Umbuchung zwischen eigenen Konten (oder hebt das auf). */

/** Ordnet eine Buchung einem anderen Konto zu. */



/* =========================================================== Navigator */

/** Zählt einen Aufruf mit, damit "zuletzt benutzt" sich selbst sortiert. */

/** Legt die Startkacheln an: Bereiche, deployte Apps, Werkzeuge, Ordner. */

/** Speichert die Adresse eines hochgeladenen Kachelbilds. */

/** Verschiebt den sichtbaren Ausschnitt innerhalb der Kachel. */


/* ======================================================= Zurücksetzen */

/* --------------------------------------------------------------- Verlauf */
//
// Trainingstage, Übungen, Kalender und das laufende Training sind am
// 09.09.2026 entfallen — mit ihnen `SatzEingabe` und `CardioEingabe`.
// Erfasst wird auf der Uhr, korrigiert wird hier: die beiden Aktionen unten
// sind alles, was der Verlauf noch schreibt.

/** Einen einzelnen Satz im Nachhinein korrigieren. */


/* ==================================================== Wochenrückblick */

/* ========================================================== Aufgaben */

/** Räumt alle erledigten Aufgaben weg - für den Frühjahrsputz. */

/* ------------------------------------------------------- Unteraufgaben */

/* ------------------------------------------------------ Lebensbereiche */


/** Legt die sieben Standardbereiche an, falls noch keine existieren. */
