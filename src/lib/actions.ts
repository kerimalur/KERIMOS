"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createGymClient, gymUserId as resolveGymUserId } from "@/lib/supabase/gym";
import { createMenuClient } from "@/lib/supabase/menu";
import { heuteISO, addDays } from "@/lib/time";
import { rechne, summe, type FoodValues } from "@/lib/nutrition";
import { type RecurrenceInterval } from "@/lib/types";

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
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

/* ------------------------------------------------------ Schnellerfassung */

/**
 * Trägt das Körpergewicht in die Gym-Datenbank ein. Läuft serverseitig über
 * den Gym-Schlüssel; GYM_USER_ID gehört dazu, weil die Gym-DB eine eigene
 * Anmeldung hat und die Zeile sonst niemandem gehören würde.
 */
export async function addBodyWeight(fd: FormData) {
  await requireUser();
  const gym = createGymClient();
  if (!gym) throw new Error("Gym-Zugang nicht eingerichtet");

  const weight = numOrNull(fd, "weight_kg");
  if (weight === null || weight < 30 || weight > 250) return;

  // Besitzer der Zeile: bevorzugt aus GYM_USER_ID, sonst vom letzten
  // bestehenden Eintrag übernehmen (Ein-Personen-Datenbank).
  let gymUserId = process.env.GYM_USER_ID ?? null;
  if (!gymUserId) {
    const { data } = await gym.from("body_weight_entries")
      .select("user_id").not("user_id", "is", null).limit(1);
    gymUserId = (data?.[0]?.user_id as string | undefined) ?? null;
  }
  if (!gymUserId) {
    throw new Error(
      "Gewicht speichern: GYM_USER_ID fehlt in den Umgebungsvariablen " +
      "und es gibt noch keinen bestehenden Eintrag zum Übernehmen."
    );
  }

  check(await gym.from("body_weight_entries").insert({
    entry_date: heuteISO(),
    weight_kg: weight,
    source: "kerimos",
    user_id: gymUserId,
  }), "Gewicht speichern");
  revalidatePath("/gym"); revalidatePath("/quick");
  revalidatePath("/");
}

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

const revalidatePrep = () => {
  ["/m/Essen/prep", "/m/Essen/plan", "/m/Essen", "/"]
    .forEach((p) => revalidatePath(p));
};

/** Alle Tage von start bis ende, einschliesslich. */
function tageZwischen(start: string, ende: string): string[] {
  const out: string[] = [];
  let cursor = start;
  // Sicherheitsnetz gegen kaputte Eingaben
  for (let i = 0; i < 60 && cursor <= ende; i++) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

type MenuClientTyp = NonNullable<ReturnType<typeof createMenuClient>>;

/** Nährwerte und Kosten für eine Portion eines Rezepts. */
async function werteProPortion(menu: MenuClientTyp, recipeId: string) {
  const { data: items } = await menu.from("recipe_items")
    .select("food_id, amount_per_portion, unit").eq("recipe_id", recipeId);

  const foodIds = (items ?? [])
    .map((i) => i.food_id as string | null).filter(Boolean) as string[];
  const { data: foods } = foodIds.length > 0
    ? await menu.from("foods")
        .select("id, calories_per_100, protein_per_100, carbs_per_100, fat_per_100, cost_per_100")
        .in("id", foodIds)
    : { data: [] };

  const byId = new Map((foods ?? []).map((f) => [f.id as string, f]));
  const teile = (items ?? []).map((i) => {
    const f = i.food_id ? byId.get(i.food_id as string) : undefined;
    if (!f) return { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
    return rechne(
      {
        calories_per_100: Number(f.calories_per_100 ?? 0),
        protein_per_100: Number(f.protein_per_100 ?? 0),
        carbs_per_100: Number(f.carbs_per_100 ?? 0),
        fat_per_100: Number(f.fat_per_100 ?? 0),
        cost_per_100: Number(f.cost_per_100 ?? 0),
      },
      Number(i.amount_per_portion ?? 0),
      String(i.unit ?? "g")
    );
  });
  return summe(teile);
}

/** Stellt sicher, dass für jeden Tag ein Tagesplan existiert. */
async function tagesplaeneSichern(menu: MenuClientTyp, tage: string[]) {
  if (tage.length === 0) return;
  const { data } = await menu.from("meal_plans").select("date").in("date", tage);
  const vorhanden = new Set((data ?? []).map((p) => p.date as string));
  const fehlend = tage.filter((t) => !vorhanden.has(t));
  if (fehlend.length > 0) {
    await menu.from("meal_plans").insert(fehlend.map((date) => ({ date })));
  }
}

export interface BatchEingabe {
  recipe_id: string;
  meal_type: string;
  portions: number;
}

/**
 * Legt einen Kochzyklus an: Töpfe mit eingefrorenen Werten pro Portion,
 * Boxen automatisch je ein Stück pro Tag und Slot. Als frei markierte Tage
 * bleiben aussen vor; überzählige Portionen bleiben unverteilt und lassen
 * sich später im Plan von Hand zuweisen.
 */
export async function createCycle(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;

  const cookDate = str(fd, "cook_date");
  const start = str(fd, "start_date");
  const ende = str(fd, "end_date");
  const batches = JSON.parse(String(fd.get("batches") ?? "[]")) as BatchEingabe[];
  if (!cookDate || !start || !ende || ende < start || batches.length === 0) return;

  const { data: cycle, error } = await menu.from("prep_cycles").insert({
    name: str(fd, "name") || "",
    cook_date: cookDate, start_date: start, end_date: ende, status: "geplant",
  }).select("id").single();
  if (error) throw new Error(`Zyklus anlegen: ${error.message}`);

  const alle = tageZwischen(start, ende);
  const { data: freie } = await menu.from("day_markers")
    .select("date").in("date", alle).eq("is_free", true);
  const gesperrt = new Set((freie ?? []).map((d) => d.date as string));
  const nutzbar = alle.filter((d) => !gesperrt.has(d));

  for (const b of batches) {
    const portionen = Math.min(14, Math.max(1, Math.round(b.portions)));
    const w = await werteProPortion(menu, b.recipe_id);

    const { data: batch, error: bError } = await menu.from("prep_batches").insert({
      cycle_id: cycle.id,
      recipe_id: b.recipe_id,
      meal_type: b.meal_type,
      portions: portionen,
      kcal_per_portion: w.kcal,
      protein_per_portion: w.protein,
      carbs_per_portion: w.carbs,
      fat_per_portion: w.fat,
      cost_per_portion: w.cost,
    }).select("id").single();
    if (bError) throw new Error(`Topf anlegen: ${bError.message}`);

    const ziele = nutzbar.slice(0, portionen);
    if (ziele.length > 0) {
      check(await menu.from("batch_portions").insert(
        ziele.map((date) => ({ batch_id: batch.id, date, meal_type: b.meal_type }))
      ), "Boxen verteilen");
    }
  }

  await tagesplaeneSichern(menu, alle);
  revalidatePrep();
}

/**
 * Portionenzahl eines Topfes ändern und die Boxen angleichen:
 * zu viele fallen hinten weg, fehlende landen auf noch freien Tagen.
 */
export async function updateBatchPortions(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;

  const batchId = str(fd, "id");
  const portionen = Math.min(14, Math.max(1, Math.round(numOr(fd, "portions", 1))));
  if (!batchId) return;

  const { data: batch } = await menu.from("prep_batches")
    .select("id, cycle_id, meal_type").eq("id", batchId).maybeSingle();
  if (!batch) return;

  check(await menu.from("prep_batches").update({ portions: portionen })
    .eq("id", batchId), "Portionen speichern");

  const { data: boxen } = await menu.from("batch_portions")
    .select("id, date").eq("batch_id", batchId).order("date");
  const aktuell = boxen ?? [];

  if (aktuell.length > portionen) {
    const weg = aktuell.slice(portionen).map((b) => b.id as string);
    await menu.from("batch_portions").delete().in("id", weg);
  } else if (aktuell.length < portionen) {
    const { data: cycle } = await menu.from("prep_cycles")
      .select("start_date, end_date").eq("id", batch.cycle_id as string).maybeSingle();
    if (!cycle) return;

    const alle = tageZwischen(cycle.start_date as string, cycle.end_date as string);
    const { data: freie } = await menu.from("day_markers")
      .select("date").in("date", alle).eq("is_free", true);
    const gesperrt = new Set((freie ?? []).map((d) => d.date as string));
    const belegt = new Set(aktuell.map((b) => b.date as string));
    const offen = alle.filter((d) => !gesperrt.has(d) && !belegt.has(d));
    const neu = offen.slice(0, portionen - aktuell.length);

    if (neu.length > 0) {
      await menu.from("batch_portions").insert(
        neu.map((date) => ({
          batch_id: batchId, date, meal_type: batch.meal_type as string,
        }))
      );
      await tagesplaeneSichern(menu, neu);
    }
  }
  revalidatePrep();
}

export async function setCycleStatus(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const status = str(fd, "status");
  if (!["geplant", "eingekauft", "gekocht", "erledigt"].includes(status)) return;
  check(await menu.from("prep_cycles").update({ status })
    .eq("id", str(fd, "id")), "Status speichern");
  revalidatePrep();
}

export async function deleteCycle(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("prep_cycles").delete().eq("id", str(fd, "id")),
    "Zyklus löschen");
  revalidatePrep();
}

/** Box einem Tag zuweisen - für überzählige Portionen aus dem Kühlschrank. */
export async function addPortionToDay(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const batchId = str(fd, "batch_id");
  const date = str(fd, "date");
  const mealType = str(fd, "meal_type");
  if (!batchId || !date || !mealType) return;

  check(await menu.from("batch_portions").insert({
    batch_id: batchId, date, meal_type: mealType,
  }), "Box zuweisen");
  await tagesplaeneSichern(menu, [date]);
  revalidatePrep();
}

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
  ["/m/Essen/einstellungen", "/m/Essen/plan", "/m/Essen", "/"]
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

export async function createAccount(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("accounts").insert({
    user_id: userId,
    name: str(fd, "name"),
    type: str(fd, "type") || "checking",
    opening_balance: numOr(fd, "opening_balance", 0),
    opening_date: str(fd, "opening_date") || heuteISO(),
    include_in_runway: bool(fd, "include_in_runway"),
    note: str(fd, "note") || null,
  }), "Konto anlegen");
  revalidatePath("/konten"); revalidatePath("/"); revalidatePath("/geld");
}

export async function updateAccountBalance(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const accountId = str(fd, "account_id");
  const balance = numOr(fd, "balance", 0);
  const date = str(fd, "snapshot_date") || heuteISO();
  // Snapshot setzt den Kontostand an diesem Datum neu - ältere Transaktionen bleiben
  // in der Historie, zählen aber nicht mehr doppelt in den Saldo.
  await supabase.from("account_snapshots").upsert(
    { user_id: userId, account_id: accountId, snapshot_date: date, balance },
    { onConflict: "account_id,snapshot_date" }
  );
  revalidatePath("/konten"); revalidatePath("/"); revalidatePath("/geld");
}

export async function deleteAccount(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("accounts").delete().eq("id", str(fd, "id"));
  revalidatePath("/konten"); revalidatePath("/"); revalidatePath("/geld");
}

/* ----------------------------------------------------------- Kategorien */

export async function createCategory(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("categories").insert({
    user_id: userId,
    name: str(fd, "name"),
    kind: str(fd, "kind") || "expense",
    is_fixed: bool(fd, "is_fixed"),
    color: str(fd, "color") || "#8A8478",
    monthly_budget: numOrNull(fd, "monthly_budget"),
  }), "Kategorie anlegen");
  revalidatePath("/kategorien");
}

export async function deleteCategory(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("categories").delete().eq("id", str(fd, "id"));
  revalidatePath("/kategorien");
}

/* --------------------------------------------------------- Transaktionen */

export async function createTransaction(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const kind = str(fd, "kind");                 // "income" | "expense"
  const raw = Math.abs(numOr(fd, "amount", 0));
  if (raw === 0) return;
  check(await supabase.from("transactions").insert({
    user_id: userId,
    account_id: str(fd, "account_id") || null,
    category_id: str(fd, "category_id") || null,
    occurred_on: str(fd, "occurred_on") || heuteISO(),
    amount: kind === "income" ? raw : -raw,
    description: str(fd, "description"),
    counterparty: str(fd, "counterparty") || null,
    source: "manual",
  }), "Buchung anlegen");
  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

export async function deleteTransaction(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("transactions").delete().eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

export async function categorizeTransaction(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase
    .from("transactions")
    .update({ category_id: str(fd, "category_id") || null })
    .eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld");
}

/* -------------------------------------------------------------- Fixkosten */

export async function createRecurring(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const kind = str(fd, "kind");
  const raw = Math.abs(numOr(fd, "amount", 0));
  if (raw === 0) return;
  check(await supabase.from("recurring_items").insert({
    user_id: userId,
    label: str(fd, "label"),
    category_id: str(fd, "category_id") || null,
    account_id: str(fd, "account_id") || null,
    amount: kind === "income" ? raw : -raw,
    interval: (str(fd, "interval") || "monthly") as RecurrenceInterval,
    day_of_month: Math.min(31, Math.max(1, numOr(fd, "day_of_month", 1))),
    start_date: str(fd, "start_date") || heuteISO(),
    end_date: str(fd, "end_date") || null,
  }), "Fixkosten anlegen");
  revalidatePath("/fixkosten"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

export async function toggleRecurring(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase
    .from("recurring_items")
    .update({ active: str(fd, "active") === "true" })
    .eq("id", str(fd, "id"));
  revalidatePath("/fixkosten"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

export async function deleteRecurring(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("recurring_items").delete().eq("id", str(fd, "id"));
  revalidatePath("/fixkosten"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

/* --------------------------------------------------------------- Szenarien */

export async function saveScenario(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("scenarios").insert({
    user_id: userId,
    name: str(fd, "name") || "Unbenannt",
    description: str(fd, "description") || null,
    income_factor: numOr(fd, "income_factor", 1),
    expense_delta_monthly: numOr(fd, "expense_delta_monthly", 0),
    one_off_cost: numOr(fd, "one_off_cost", 0),
  }), "Szenario speichern");
  revalidatePath("/runway");
}

export async function deleteScenario(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("scenarios").delete().eq("id", str(fd, "id"));
  revalidatePath("/runway");
}

/* ------------------------------------------------------------ Erst-Setup */

/** Legt Standard-Kategorien, ein Konto und die Fixkosten an. */
export async function runSetup(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const liquid = numOr(fd, "liquid", 0);
  const fixedCosts = Math.abs(numOr(fd, "fixed_costs", 0));
  const today = heuteISO();

  const expenses: [string, boolean, string][] = [
    ["Wohnen", true, "#B9847A"], ["Krankenkasse", true, "#C68D6B"],
    ["Versicherungen", true, "#C4A882"], ["Abos & Telefon", true, "#A897B5"],
    ["Transport", true, "#8FA6B8"], ["Lebensmittel", false, "#7FA383"],
    ["Auswärts essen", false, "#89AFA4"], ["Gym & Gesundheit", false, "#5B8C7B"],
    ["Freizeit", false, "#BE8DA4"], ["Anschaffungen", false, "#A8A093"],
    ["Bildung", false, "#8B94B8"], ["Sonstiges", false, "#B5AE9F"],
  ];
  const incomes: [string, string][] = [
    ["Lohn", "#5B8C7B"], ["Militärsold", "#7B9C8B"],
    ["Trading", "#8FA6B8"], ["Sonstige Einnahmen", "#A8A093"],
  ];

  await supabase.from("categories").upsert(
    [
      ...expenses.map(([name, is_fixed, color], i) => ({
        user_id: userId, name, kind: "expense" as const, is_fixed, color, sort_order: i,
      })),
      ...incomes.map(([name, color], i) => ({
        user_id: userId, name, kind: "income" as const, is_fixed: false, color, sort_order: i,
      })),
    ],
    { onConflict: "user_id,name,kind", ignoreDuplicates: true }
  );

  const { data: account } = await supabase
    .from("accounts")
    .insert({
      user_id: userId, name: "Hauptkonto", type: "checking",
      opening_balance: liquid, opening_date: today, include_in_runway: true,
    })
    .select("id")
    .single();

  if (fixedCosts > 0) {
    const { data: wohnen } = await supabase
      .from("categories").select("id")
      .eq("user_id", userId).eq("name", "Wohnen").maybeSingle();
    await supabase.from("recurring_items").insert({
      user_id: userId,
      label: "Fixkosten gesamt (bitte aufteilen)",
      category_id: wohnen?.id ?? null,
      account_id: account?.id ?? null,
      amount: -fixedCosts,
      interval: "monthly",
      day_of_month: 1,
      start_date: today,
    });
  }

  revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway"); revalidatePath("/konten");
}

/* ------------------------------------------------------------ CSV-Import */

interface ImportPayloadRow {
  occurred_on: string;
  amount: number;
  description: string;
  counterparty: string | null;
  is_transfer?: boolean;
}

export interface ImportOutcome {
  inserted: number;
  duplicates: number;
  received: number;
  error?: string;
}

export async function importTransactions(fd: FormData): Promise<ImportOutcome> {
  const { supabase, userId } = await requireUser();
  const rows = JSON.parse(String(fd.get("rows") ?? "[]")) as ImportPayloadRow[];
  if (rows.length === 0) return { inserted: 0, duplicates: 0, received: 0 };

  const accountId = str(fd, "account_id") || null;

  const [{ data: ruleRows }, { data: catRows }] = await Promise.all([
    supabase.from("import_rules").select("*").order("priority", { ascending: true }),
    supabase.from("categories").select("id, kind"),
  ]);
  const rules = ruleRows ?? [];
  const kindById = new Map((catRows ?? []).map((c) => [c.id as string, c.kind as string]));

  // Eine Regel greift nur, wenn ihre Kategorie zur Richtung passt: eine
  // TWINT-Gutschrift darf nicht in einer Ausgabenkategorie landen.
  const matchCategory = (r: ImportPayloadRow): string | null => {
    const wanted = r.amount >= 0 ? "income" : "expense";
    for (const rule of rules) {
      if (kindById.get(rule.category_id) !== wanted) continue;
      const haystack = (
        rule.match_field === "counterparty" ? r.counterparty ?? "" : r.description
      ).toLowerCase();
      const needle = String(rule.pattern).toLowerCase();
      const hit =
        rule.match_type === "regex"
          ? safeRegex(rule.pattern).test(haystack)
          : rule.match_type === "starts_with"
            ? haystack.startsWith(needle)
            : haystack.includes(needle);
      if (hit) return rule.category_id;
    }
    return null;
  };

  // Deterministischer Dedupe-Schlüssel; identische Buchungen am selben Tag
  // werden durchnummeriert, damit sie nicht fälschlich als Dublette gelten.
  const seen = new Map<string, number>();
  const payload = rows.map((r) => {
    const base = `${r.occurred_on}|${r.amount.toFixed(2)}|${r.description.slice(0, 60)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      user_id: userId,
      account_id: accountId,
      // Auch Umbuchungen werden kategorisiert (Sparen, Investment) - sie
      // zählen dank is_transfer trotzdem nicht als Ausgabe.
      category_id: matchCategory(r),
      occurred_on: r.occurred_on,
      amount: r.amount,
      description: r.description,
      counterparty: r.counterparty,
      is_transfer: r.is_transfer ?? false,
      source: "csv" as const,
      external_ref: n > 1 ? `${base}#${n}` : base,
    };
  });

  let inserted = 0;
  try {
    // In Blöcken schreiben, damit auch grosse Auszüge durchgehen.
    for (let i = 0; i < payload.length; i += 200) {
      const { data, error } = await supabase
        .from("transactions")
        .upsert(payload.slice(i, i + 200), {
          onConflict: "user_id,external_ref",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }
  } catch (e) {
    return {
      inserted,
      duplicates: 0,
      received: rows.length,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Gegenbuchungen für Umbuchungen auf eigene Konten. Aus einem Auszug
  // werden so beide Seiten - das Vermögen bleibt vollständig.
  if (inserted > 0) {
    const { data: transferRules } = await supabase.from("transfer_rules")
      .select("pattern, target_account_id").eq("active", true);

    const regeln = (transferRules ?? []) as {
      pattern: string; target_account_id: string;
    }[];

    if (regeln.length > 0) {
      const gegen = payload.flatMap((p) => {
        const text = `${p.description} ${p.counterparty ?? ""}`.toLowerCase();
        const regel = regeln.find(
          (r) => r.pattern.trim() && text.includes(r.pattern.trim().toLowerCase())
        );
        // Nur wenn das Zielkonto ein anderes ist als das Quellkonto
        if (!regel || regel.target_account_id === accountId) return [];
        return [{
          user_id: userId,
          account_id: regel.target_account_id,
          category_id: null,
          occurred_on: p.occurred_on,
          amount: -p.amount,
          description: `Gegenbuchung: ${p.description}`,
          counterparty: p.counterparty,
          is_transfer: true,
          source: "csv" as const,
          external_ref: `gegen:${p.external_ref}`,
        }];
      });

      if (gegen.length > 0) {
        // Quellbuchungen ebenfalls als Umbuchung markieren
        await supabase.from("transactions")
          .update({ is_transfer: true })
          .eq("user_id", userId)
          .in("external_ref", gegen.map((g) => g.external_ref.replace(/^gegen:/, "")));

        await supabase.from("transactions").upsert(gegen, {
          onConflict: "user_id,external_ref", ignoreDuplicates: true,
        });
      }
    }
  }

  // Schlusssaldo: setzt eine neue Kontostand-Basis auf das Auszugsdatum.
  // Danach stimmt das Konto auf den Rappen, auch wenn einzelne Buchungen
  // fehlen oder doppelt wären - die Basis sticht die Rechnerei.
  const saldo = numOrNull(fd, "closing_balance");
  const saldoDatum = str(fd, "closing_date")
    || rows.map((r) => r.occurred_on).sort().at(-1)
    || heuteISO();
  if (saldo !== null && accountId) {
    await supabase.from("account_snapshots").upsert(
      { user_id: userId, account_id: accountId, snapshot_date: saldoDatum, balance: saldo },
      { onConflict: "account_id,snapshot_date" }
    );
  }

  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
  revalidatePath("/konten");

  return {
    inserted,
    duplicates: rows.length - inserted,
    received: rows.length,
  };
}

function safeRegex(pattern: string): RegExp {
  try { return new RegExp(pattern, "i"); } catch { return /$^/; }
}

/* ------------------------------------------------------- Umbuchungsregeln */

export async function createTransferRule(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const pattern = str(fd, "pattern");
  const target = str(fd, "target_account_id");
  if (!pattern || !target) return;
  check(await supabase.from("transfer_rules").insert({
    user_id: userId, pattern, target_account_id: target,
  }), "Umbuchungsregel anlegen");
  revalidatePath("/import");
}

export async function deleteTransferRule(fd: FormData) {
  const { supabase, userId } = await requireUser();
  await supabase.from("transfer_rules")
    .delete().eq("id", str(fd, "id")).eq("user_id", userId);
  revalidatePath("/import");
}

export async function createImportRule(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("import_rules").insert({
    user_id: userId,
    pattern: str(fd, "pattern"),
    match_field: str(fd, "match_field") || "description",
    match_type: str(fd, "match_type") || "contains",
    category_id: str(fd, "category_id"),
    priority: numOr(fd, "priority", 100),
  }), "Regel anlegen");
  revalidatePath("/import");
}

export async function deleteImportRule(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("import_rules").delete().eq("id", str(fd, "id"));
  revalidatePath("/import");
}

/** Wendet die Regeln auf alle noch nicht kategorisierten Buchungen an. */
export async function applyRulesToUncategorized() {
  const { supabase, userId } = await requireUser();
  const [{ data: rules }, { data: cats }, { data: txns }] = await Promise.all([
    supabase.from("import_rules").select("*").order("priority"),
    supabase.from("categories").select("id, kind"),
    // Alle offenen Buchungen holen, nicht nur die ersten paar tausend -
    // ein Vierjahres-Import bringt deutlich mehr mit.
    supabase.from("transactions").select("id, description, counterparty, amount")
      .is("category_id", null).limit(20000),
  ]);
  if (!rules?.length || !txns?.length) return;
  const kindById = new Map((cats ?? []).map((c) => [c.id as string, c.kind as string]));

  // Nach Zielkategorie bündeln, damit statt tausend Einzelupdates
  // nur eine Handvoll Aktualisierungen nötig sind.
  const buckets = new Map<string, string[]>();

  for (const t of txns) {
    const wanted = Number(t.amount) >= 0 ? "income" : "expense";
    for (const rule of rules) {
      if (kindById.get(rule.category_id) !== wanted) continue;
      const haystack = (
        rule.match_field === "counterparty" ? t.counterparty ?? "" : t.description ?? ""
      ).toLowerCase();
      const needle = String(rule.pattern).toLowerCase();
      const hit =
        rule.match_type === "regex"
          ? safeRegex(rule.pattern).test(haystack)
          : rule.match_type === "starts_with"
            ? haystack.startsWith(needle)
            : haystack.includes(needle);
      if (hit) {
        const list = buckets.get(rule.category_id) ?? [];
        list.push(t.id as string);
        buckets.set(rule.category_id, list);
        break;
      }
    }
  }

  for (const [categoryId, ids] of buckets) {
    for (let i = 0; i < ids.length; i += 200) {
      check(await supabase.from("transactions")
        .update({ category_id: categoryId })
        .eq("user_id", userId)
        .in("id", ids.slice(i, i + 200)), "Kategorien zuordnen");
    }
  }

  revalidatePath("/transaktionen"); revalidatePath("/geld"); revalidatePath("/"); revalidatePath("/geld");
}

/** Verknüpft eine Aktivität mit einer Buchung - Grundlage der Stundenwert-Matrix. */
export async function linkTransactionToActivity(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("transactions")
    .update({ activity_id: str(fd, "activity_id") || null })
    .eq("id", str(fd, "id"));
}

/** Farbe, Art und Eigenschaften jeder Kategorie, die eine Regel braucht. */
const CATEGORY_DEFS: Record<
  string,
  { kind: "income" | "expense"; color: string; isFixed?: boolean; isSavings?: boolean }
> = {
  // Fixe Verpflichtungen
  "Wohnen":              { kind: "expense", color: "#B9847A", isFixed: true },
  "Krankenkasse":        { kind: "expense", color: "#C68D6B", isFixed: true },
  "Versicherungen":      { kind: "expense", color: "#C4A882", isFixed: true },
  "Abos & Telefon":      { kind: "expense", color: "#A897B5", isFixed: true },
  // Laufende Ausgaben
  "Lebensmittel":        { kind: "expense", color: "#7FA383" },
  "Auswärts essen":      { kind: "expense", color: "#89AFA4" },
  "Transport":           { kind: "expense", color: "#8FA6B8" },
  "Tankstelle":          { kind: "expense", color: "#C68D6B" },
  "Gym & Gesundheit":    { kind: "expense", color: "#5B8C7B" },
  "Freizeit":            { kind: "expense", color: "#BE8DA4" },
  "Anschaffungen":       { kind: "expense", color: "#A8A093" },
  "Bildung":             { kind: "expense", color: "#8B94B8" },
  "Online-Einkauf":      { kind: "expense", color: "#8B94B8" },
  "TWINT":               { kind: "expense", color: "#A897B5" },
  "Bargeldbezug":        { kind: "expense", color: "#B5AE9F" },
  "Sonstiges":           { kind: "expense", color: "#B5AE9F" },
  // Vermögen verschieben, kein Konsum
  "Investment":          { kind: "expense", color: "#5B8C7B", isSavings: true },
  "Sparen":              { kind: "expense", color: "#7B9C8B", isSavings: true },
  // Einnahmen
  "Lohn":                { kind: "income",  color: "#5B8C7B" },
  "Militärsold":         { kind: "income",  color: "#7B9C8B" },
  "Trading":             { kind: "income",  color: "#8FA6B8" },
  "Sonstige Einnahmen":  { kind: "income",  color: "#A8A093" },
};

/**
 * Legt Kategorien und Zuordnungs-Regeln an.
 *
 * Die Priorität entscheidet: kleine Zahl gewinnt. Konkrete Händler stehen vorn,
 * Sammelbegriffe wie "Online Einkauf" oder "TWINT" ganz hinten — sonst würde
 * "Online Einkauf ANTHROPIC" als Online-Einkauf statt als Bildung landen.
 */
export async function seedImportRules() {
  const { supabase, userId } = await requireUser();

  // [Muster, Kategorie, Priorität]
  const rules: [string, string, number][] = [
    // --- Vermögen verschieben ---
    ["übertrag auf fondssparkonto", "Investment", 10],
    ["fondssparkonto", "Investment", 11],
    ["auslandszahlung", "Investment", 12],
    ["bitget", "Investment", 13],
    ["übertrag auf youngmember", "Sparen", 15],
    ["youngmember", "Sparen", 16],

    // --- Einnahmen ---
    ["vogl gastronomie", "Lohn", 20],
    ["baseltor", "Lohn", 21],
    ["lohn", "Lohn", 22],
    ["truppenrechnungswesen", "Militärsold", 23],
    ["soldbeleg", "Militärsold", 24],

    // --- Feste Verpflichtungen ---
    ["alur pamela", "Wohnen", 25],
    ["dauerauftrag", "Wohnen", 26],
    ["helvetia", "Versicherungen", 27],
    ["krankenkasse", "Krankenkasse", 28],
    ["css ", "Krankenkasse", 29],

    // --- Programmieren und Werkzeuge ---
    ["anthropic", "Bildung", 30],
    ["claude", "Bildung", 31],
    ["github", "Bildung", 32],
    ["google cloud", "Bildung", 33],
    ["openai", "Bildung", 34],
    ["vercel", "Bildung", 35],
    ["supabase", "Bildung", 36],
    ["tradingview", "Bildung", 37],
    ["cursor", "Bildung", 38],

    // --- Konkrete Händler ---
    ["ayfer tasdemir", "Lebensmittel", 40],
    ["müller handels", "Lebensmittel", 41],
    ["gelateria", "Lebensmittel", 42],
    ["kaufland", "Lebensmittel", 43],
    ["bike discount", "Transport", 44],
    ["moto center", "Transport", 45],
    ["freibad", "Sonstiges", 46],
    ["chillounge", "Freizeit", 47],
    ["bowling", "Freizeit", 48],
    ["rossmann", "Gym & Gesundheit", 49],

    // --- Tankstellen vor Lebensmitteln, sonst schluckt "coop" die Coop-Tankstelle ---
    ["coop tankstelle", "Tankstelle", 50],
    ["coop pronto", "Tankstelle", 51],
    ["socar", "Tankstelle", 52],
    ["avia", "Tankstelle", 53],
    ["migrol", "Tankstelle", 54],
    ["tankstelle", "Tankstelle", 55],
    ["agrola", "Tankstelle", 56],
    ["shell", "Tankstelle", 57],

    // --- Gruppen ---
    ["coop", "Lebensmittel", 60],
    ["migros", "Lebensmittel", 61],
    ["aldi", "Lebensmittel", 62],
    ["denner", "Lebensmittel", 63],
    ["spar dankt", "Lebensmittel", 64],
    ["lidl", "Lebensmittel", 65],
    ["volg", "Lebensmittel", 66],
    ["getr", "Lebensmittel", 67],

    ["justeat", "Auswärts essen", 68],
    ["yoordi", "Auswärts essen", 69],
    ["kantine", "Auswärts essen", 70],
    ["selecta", "Auswärts essen", 71],
    ["kiosk", "Auswärts essen", 72],
    ["burger king", "Auswärts essen", 73],
    ["mcdonald", "Auswärts essen", 74],
    ["sushi", "Auswärts essen", 75],
    ["restaurant", "Auswärts essen", 76],
    ["chicken", "Auswärts essen", 77],
    ["bar-", "Auswärts essen", 78],

    ["sbb", "Transport", 79],
    ["parkingpay", "Transport", 80],
    ["postauto", "Transport", 81],

    ["netflix", "Abos & Telefon", 82],
    ["spotify", "Abos & Telefon", 83],
    ["google one", "Abos & Telefon", 84],
    ["swisscom", "Abos & Telefon", 85],
    ["salt", "Abos & Telefon", 86],
    ["icloud", "Abos & Telefon", 87],

    ["digitec", "Anschaffungen", 88],
    ["galaxus", "Anschaffungen", 89],
    ["decathlon", "Anschaffungen", 90],
    ["zalando", "Anschaffungen", 91],
    ["polo filiale", "Anschaffungen", 92],
    ["army shop", "Anschaffungen", 93],

    ["apotheke", "Gym & Gesundheit", 94],
    ["drogerie", "Gym & Gesundheit", 95],
    ["rhino", "Gym & Gesundheit", 96],
    ["update fitness", "Gym & Gesundheit", 97],
    ["coiffeur", "Gym & Gesundheit", 98],

    ["brawl", "Freizeit", 100],
    ["clash royale", "Freizeit", 101],
    ["ticketcorner", "Freizeit", 102],
    ["steam", "Freizeit", 103],

    // --- Auffangregeln ganz am Schluss ---
    ["bancomat bezug", "Bargeldbezug", 150],
    ["online einkauf", "Online-Einkauf", 160],
    ["twint", "TWINT", 161],
    ["einzahlung", "Sonstige Einnahmen", 170],
    ["gutschrift", "Sonstige Einnahmen", 171],
  ];

  // Jede Kategorie anlegen, die eine Regel braucht. Fehlte sie bisher, wurde
  // die Regel stillschweigend übersprungen - genau das soll nicht passieren.
  const benoetigt = [...new Set(rules.map(([, category]) => category))];
  const unbekannt = benoetigt.filter((name) => !CATEGORY_DEFS[name]);
  if (unbekannt.length > 0) {
    throw new Error(`Kategorie ohne Definition: ${unbekannt.join(", ")}`);
  }

  check(await supabase.from("categories").upsert(
    benoetigt.map((name, i) => {
      const def = CATEGORY_DEFS[name];
      return {
        user_id: userId, name, kind: def.kind, color: def.color,
        is_fixed: def.isFixed ?? false, is_savings: def.isSavings ?? false,
        sort_order: i,
      };
    }),
    { onConflict: "user_id,name,kind", ignoreDuplicates: true }
  ), "Kategorien anlegen");

  const { data: cats } = await supabase
    .from("categories").select("id, name, kind").eq("user_id", userId);
  const byKey = new Map((cats ?? []).map((c) => [`${c.name}|${c.kind}`, c.id as string]));

  const payload = rules.map(([pattern, category, priority]) => {
    const def = CATEGORY_DEFS[category];
    const categoryId = byKey.get(`${category}|${def.kind}`);
    if (!categoryId) throw new Error(`Kategorie fehlt nach dem Anlegen: ${category}`);
    return {
      user_id: userId, pattern,
      match_field: "description" as const,
      match_type: "contains" as const,
      category_id: categoryId, priority,
    };
  });

  // Vorhandene Regeln ersetzen, damit ein zweiter Aufruf keine Dubletten baut
  await supabase.from("import_rules").delete().eq("user_id", userId);
  check(await supabase.from("import_rules").insert(payload), "Regeln anlegen");

  revalidatePath("/import"); revalidatePath("/kategorien");
}

/** Markiert eine Buchung als Umbuchung zwischen eigenen Konten (oder hebt das auf). */
export async function toggleTransfer(fd: FormData) {
  const { supabase } = await requireUser();
  const makeTransfer = str(fd, "is_transfer") === "true";
  // Die Kategorie bleibt erhalten: eine Umbuchung auf das Sparkonto ist
  // "Sparen" und soll auch so sichtbar sein - sie zählt nur nicht als Ausgabe.
  await supabase.from("transactions")
    .update({ is_transfer: makeTransfer })
    .eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

/** Ordnet eine Buchung einem anderen Konto zu. */
export async function moveTransactionToAccount(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("transactions")
    .update({ account_id: str(fd, "account_id") || null })
    .eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/konten"); revalidatePath("/"); revalidatePath("/geld");
}


/**
 * Übernimmt einen erkannten Posten in die Fixkosten — mit dem Rhythmus, der
 * sich aus den tatsächlichen Abständen ergibt, nicht pauschal monatlich.
 * Die zugehörige Kategorie wird gleich als Fixkosten-Kategorie markiert.
 */
export async function adoptRecurringCandidate(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const raw = numOr(fd, "amount", 0);
  if (raw === 0) return;

  const categoryId = str(fd, "category_id") || null;
  const interval = (str(fd, "interval") || "monthly") as RecurrenceInterval;
  const day = Math.min(31, Math.max(1, numOr(fd, "day_of_month", 1)));

  check(await supabase.from("recurring_items").insert({
    user_id: userId,
    label: str(fd, "label").slice(0, 80),
    category_id: categoryId,
    account_id: str(fd, "account_id") || null,
    // Vorzeichen beibehalten: auch feste Einnahmen sind wiederkehrende Posten
    amount: raw,
    interval,
    day_of_month: day,
    start_date: str(fd, "start_date") || heuteISO(),
  }), "Fixkosten übernehmen");

  if (categoryId && raw < 0) {
    await supabase.from("categories").update({ is_fixed: true }).eq("id", categoryId);
  }

  revalidatePath("/fixkosten"); revalidatePath("/geld");
  revalidatePath("/runway"); revalidatePath("/kategorien");
}

/* =========================================================== Navigator */

export async function createLink(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("links").insert({
    user_id: userId,
    title: str(fd, "title"),
    subtitle: str(fd, "subtitle") || null,
    kind: str(fd, "kind") || "web",
    target: str(fd, "target"),
    group_name: str(fd, "group_name") || "Projekte",
    icon: str(fd, "icon") || null,
    color: str(fd, "color") || "#5B8C7B",
    sort_order: numOr(fd, "sort_order", 100),
  }), "Link anlegen");
  revalidatePath("/"); revalidatePath("/links");
}

export async function updateLink(fd: FormData) {
  const { supabase } = await requireUser();
  check(await supabase.from("links").update({
    title: str(fd, "title"),
    subtitle: str(fd, "subtitle") || null,
    kind: str(fd, "kind"),
    target: str(fd, "target"),
    group_name: str(fd, "group_name"),
    icon: str(fd, "icon") || null,
    color: str(fd, "color"),
    sort_order: numOr(fd, "sort_order", 100),
  }).eq("id", str(fd, "id")), "Link speichern");
  revalidatePath("/"); revalidatePath("/links");
}

export async function deleteLink(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("links").delete().eq("id", str(fd, "id"));
  revalidatePath("/"); revalidatePath("/links");
}

/** Zählt einen Aufruf mit, damit "zuletzt benutzt" sich selbst sortiert. */
export async function registerLinkOpen(id: string) {
  const { supabase } = await requireUser();
  await supabase.rpc("register_link_open", { link_id: id });
}

/** Legt die Startkacheln an: Bereiche, deployte Apps, Werkzeuge, Ordner. */
export async function seedLinks() {
  const { supabase, userId } = await requireUser();

  // Gruppen sind Modi: die Startseite zeigt pro Gruppe einen Einstieg,
  // /m/[gruppe] ist der Arbeitsplatz mit allen Kacheln des Modus.
  const seed: {
    title: string; subtitle: string; kind: string; target: string;
    group_name: string; icon: string; color: string; sort_order: number;
  }[] = [
    // Traden
    { title: "Trading", subtitle: "GVA-Board, Backtest", kind: "section",
      target: "/trading", group_name: "Traden", icon: "◈", color: "#8B94B8", sort_order: 1 },
    { title: "GVA Screener", subtitle: "Aktive Setups, London und New York", kind: "web",
      target: "https://gva-screener-kerim-alurs-projects.vercel.app",
      group_name: "Traden", icon: "◈", color: "#8B94B8", sort_order: 2 },
    { title: "TradingView", subtitle: "Charts", kind: "web",
      target: "https://www.tradingview.com/chart/",
      group_name: "Traden", icon: "◔", color: "#8FA6B8", sort_order: 3 },

    // Gym - Haken, Verlauf und der Garmin-Import
    { title: "Gym", subtitle: "War ich da, Verlauf, Garmin", kind: "section",
      target: "/gym", group_name: "Gym", icon: "▲", color: "#C68D6B", sort_order: 1 },
    { title: "Verlauf", subtitle: "Abgeschlossene Trainings", kind: "section",
      target: "/gym/verlauf", group_name: "Gym", icon: "▲", color: "#6E9B76", sort_order: 2 },

    // Essen
    { title: "Essen", subtitle: "Meal Prep, Rezepte, Einkauf", kind: "section",
      target: "/m/Essen", group_name: "Essen", icon: "▤", color: "#C4A882", sort_order: 1 },

    // Lernen
    { title: "Berufsmatura 27", subtitle: "Unterlagen", kind: "folder",
      target: "C:\\Projekte\\Claude Cowork\\Berufsmatura27",
      group_name: "Lernen", icon: "▭", color: "#A8A093", sort_order: 1 },
  ];

  // Nur anlegen, was noch fehlt. Ein zweiter Aufruf soll nichts verdoppeln -
  // sonst stehen Bilder und Nutzungszähler plötzlich auf einer Kopie.
  const { data: vorhanden } = await supabase
    .from("links").select("target").eq("user_id", userId);
  const bekannt = new Set((vorhanden ?? []).map((l) => String(l.target)));

  const neu = seed.filter((l) => !bekannt.has(l.target));
  if (neu.length > 0) {
    check(await supabase.from("links").insert(
      neu.map((l) => ({ ...l, user_id: userId }))
    ), "Kacheln anlegen");
  }
  revalidatePath("/"); revalidatePath("/links");
}

/** Speichert die Adresse eines hochgeladenen Kachelbilds. */
export async function setLinkImage(fd: FormData) {
  const { supabase } = await requireUser();
  const url = str(fd, "image_url") || null;
  check(await supabase.from("links")
    // Beim Bildwechsel den Ausschnitt zurücksetzen - er passte zum alten Bild
    .update({ image_url: url, image_position: "50% 50%" })
    .eq("id", str(fd, "id")), "Bild speichern");
  revalidatePath("/"); revalidatePath("/links");
}

/** Verschiebt den sichtbaren Ausschnitt innerhalb der Kachel. */
export async function setLinkImagePosition(id: string, position: string) {
  const { supabase } = await requireUser();
  if (!/^\d{1,3}% \d{1,3}%$/.test(position)) return;
  check(await supabase.from("links")
    .update({ image_position: position })
    .eq("id", id), "Bildausschnitt speichern");
  revalidatePath("/"); revalidatePath("/links");
}

/**
 * Schreibt eine neue Reihenfolge. Die Liste kommt in der Reihenfolge,
 * in der die Kacheln stehen sollen; Gruppenwechsel werden mitgeschrieben.
 */
export async function reorderLinks(items: { id: string; group_name: string }[]) {
  const { supabase, userId } = await requireUser();
  const byGroup = new Map<string, number>();
  for (const item of items) {
    const next = (byGroup.get(item.group_name) ?? 0) + 1;
    byGroup.set(item.group_name, next);
    const { error } = await supabase.from("links")
      .update({ sort_order: next, group_name: item.group_name })
      .eq("id", item.id).eq("user_id", userId);
    if (error) throw new Error(`Reihenfolge speichern: ${error.message}`);
  }
  revalidatePath("/"); revalidatePath("/links");
}

/* ======================================================= Zurücksetzen */

export interface ResetCounts { [table: string]: number }

export async function getDataCounts(): Promise<ResetCounts> {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("data_counts");
  return (data ?? {}) as ResetCounts;
}

export async function resetMoney(fd: FormData): Promise<ResetCounts> {
  const { supabase } = await requireUser();
  if (str(fd, "confirm").trim().toUpperCase() !== "LOESCHEN") {
    throw new Error("Bestätigung fehlt");
  }
  const { data, error } = await supabase.rpc("reset_money", {
    p_transactions: bool(fd, "transactions"),
    p_accounts: bool(fd, "accounts"),
    p_categories: bool(fd, "categories"),
    p_recurring: bool(fd, "recurring"),
    p_rules: bool(fd, "rules"),
    p_scenarios: bool(fd, "scenarios"),
  });
  if (error) throw new Error(error.message);
  ["/geld", "/", "/transaktionen", "/konten", "/fixkosten", "/kategorien", "/import", "/runway"]
    .forEach((p) => revalidatePath(p));
  return (data ?? {}) as ResetCounts;
}

/* ============================================================ Gym-Modul */
//
// Planung und Verwaltung laufen in KerimOS, das eigentliche Training in der
// Gym-App. Alle Zugriffe hier gehen serverseitig über den Gym-Schlüssel -
// die Gym-Datenbank hat eine eigene Anmeldung, in der ein KerimOS-Nutzer
// nicht existiert.

const GYM_PATHS = ["/gym", "/gym/verlauf", "/gym/garmin", "/"];
const revalidateGym = () => {
  GYM_PATHS.forEach((p) => revalidatePath(p));
  // Übungen und Muskelgruppen liegen in unstable_cache (lib/supabase/gym.ts).
  // revalidatePath allein räumt den nicht ab — ohne das hier bliebe eine neu
  // angelegte Übung bis zu einer Stunde unsichtbar.
  revalidateTag("gym-stammdaten");
};

/** Gym-Zugang samt Besitzer-Id. Wirft, wenn eins von beidem fehlt. */
async function gymZugang() {
  const gym = createGymClient();
  if (!gym) throw new Error("Gym-Zugang nicht eingerichtet");
  const userId = await resolveGymUserId(gym);
  if (!userId) {
    throw new Error(
      "Gym: GYM_USER_ID fehlt in den Umgebungsvariablen und es gibt noch " +
      "keine bestehende Zeile, von der die Zuordnung übernommen werden könnte."
    );
  }
  return { gym, userId };
}

/* --------------------------------------------------------------- Verlauf */
//
// Trainingstage, Übungen, Kalender und das laufende Training sind am
// 09.09.2026 entfallen — mit ihnen `SatzEingabe` und `CardioEingabe`.
// Erfasst wird auf der Uhr, korrigiert wird hier: die beiden Aktionen unten
// sind alles, was der Verlauf noch schreibt.

/** Einen einzelnen Satz im Nachhinein korrigieren. */
export async function updateExerciseLog(fd: FormData) {
  await requireUser();
  const { gym } = await gymZugang();
  const id = str(fd, "id");
  if (!id) return;

  check(await gym.from("exercise_logs").update({
    weight_kg: numOr(fd, "weight_kg", 0),
    reps: Math.max(0, Math.round(numOr(fd, "reps", 0))),
    rir: Math.min(10, Math.max(0, Math.round(numOr(fd, "rir", 2)))),
  }).eq("id", id), "Satz speichern");
  revalidateGym();
}

/**
 * Löscht eine abgeschlossene Einheit samt Sätzen und Erholungsdaten. Der
 * Kalendereintrag wird wieder auf "geplant" gesetzt.
 */
export async function deleteWorkoutSession(fd: FormData) {
  await requireUser();
  const { gym } = await gymZugang();
  const sessionId = str(fd, "id");
  if (!sessionId) return;

  const { data: session } = await gym.from("workout_sessions")
    .select("calendar_entry_id").eq("id", sessionId).maybeSingle();

  await gym.from("exercise_logs").delete().eq("workout_session_id", sessionId);
  await gym.from("cardio_logs").delete().eq("workout_session_id", sessionId);
  await gym.from("recovery_status").delete().eq("workout_session_id", sessionId);

  const entryId = session?.calendar_entry_id as string | null | undefined;
  if (entryId) {
    await gym.from("calendar_entries").update({ status: "planned" }).eq("id", entryId);
  }

  check(await gym.from("workout_sessions").delete().eq("id", sessionId),
    "Training löschen");
  revalidateGym();
}

/* ==================================================== Wochenrückblick */

/* ========================================================== Aufgaben */

/** Räumt alle erledigten Aufgaben weg - für den Frühjahrsputz. */

/* ------------------------------------------------------- Unteraufgaben */

/* ------------------------------------------------------ Lebensbereiche */


/** Legt die sieben Standardbereiche an, falls noch keine existieren. */
