import "server-only";
import { createMenuClient } from "@/lib/supabase/menu";

/**
 * Kochliste für einen Zeitraum.
 *
 * Der Gedanke: Wer für mehrere Tage vorkocht, will nicht Tag für Tag
 * nachschlagen, sondern pro Gericht wissen, wie viel insgesamt gebraucht
 * wird - "4× Poulet-Reis-Pfanne, also 800 g Poulet, auf 4 Boxen aufteilen".
 *
 * Gerechnet wird auf den geplanten Mahlzeiten, nicht auf den Rezepten.
 * Beim Einplanen werden die Zutaten samt Mengen in `meal_items` kopiert;
 * wer dort eine Menge angepasst hat, bekommt hier seine eigene Zahl und
 * nicht die aus der Vorlage.
 */

export interface KochZutat {
  name: string;
  menge: number;
  unit: string;
  /** Menge für eine einzelne Portion - für das Aufteilen auf die Boxen. */
  proPortion: number;
}

export interface KochGericht {
  name: string;
  mealType: string;
  anzahl: number;
  kcalProPortion: number;
  proteinProPortion: number;
  zutaten: KochZutat[];
  /** Tage, an denen dieses Gericht geplant ist. */
  tage: string[];
}

const SLOT_ORDER = ["fruehstueck", "mittagessen", "abendessen", "snack"];

export async function fetchKochliste(
  von: string, bis: string,
): Promise<KochGericht[]> {
  const supabase = createMenuClient();
  if (!supabase) return [];

  const { data: plaene } = await supabase
    .from("meal_plans")
    .select("id, date")
    .gte("date", von)
    .lte("date", bis);

  const planIds = (plaene ?? []).map((p) => p.id as string);
  if (planIds.length === 0) return [];

  const datumVon = new Map(
    (plaene ?? []).map((p) => [p.id as string, String(p.date)]),
  );

  const { data: mahlzeiten } = await supabase
    .from("meals")
    .select("id, plan_id, meal_type, name, kcal_total, protein_total")
    .in("plan_id", planIds);

  const liste = mahlzeiten ?? [];
  if (liste.length === 0) return [];

  const { data: zutaten } = await supabase
    .from("meal_items")
    .select("meal_id, food_name, amount, unit")
    .in("meal_id", liste.map((m) => m.id as string));

  const zutatenNachMeal = new Map<string, typeof zutaten>();
  for (const z of zutaten ?? []) {
    const key = z.meal_id as string;
    zutatenNachMeal.set(key, [...(zutatenNachMeal.get(key) ?? []), z]);
  }

  // Nach Gerichtnamen bündeln - derselbe Name heisst dasselbe Gericht.
  const gerichte = new Map<string, KochGericht>();

  for (const m of liste) {
    const name = String(m.name ?? "").trim() || "Ohne Namen";
    const tag = datumVon.get(m.plan_id as string) ?? "";

    // Gross- und Kleinschreibung ignorieren: "Grill" und "grill" sind
    // dasselbe Gericht, würden sonst aber getrennt gezählt und man kocht
    // zweimal die halbe Menge.
    const schluessel = name.toLowerCase();

    let g = gerichte.get(schluessel);
    if (!g) {
      g = {
        name,
        mealType: String(m.meal_type ?? ""),
        anzahl: 0,
        kcalProPortion: Math.round(Number(m.kcal_total ?? 0)),
        proteinProPortion: Math.round(Number(m.protein_total ?? 0)),
        zutaten: [],
        tage: [],
      };
      gerichte.set(schluessel, g);
    }

    g.anzahl += 1;
    if (tag && !g.tage.includes(tag)) g.tage.push(tag);

    for (const z of zutatenNachMeal.get(m.id as string) ?? []) {
      const zName = String(z.food_name ?? "").trim();
      if (!zName) continue;
      const menge = Number(z.amount ?? 0);
      const unit = String(z.unit ?? "g");

      const vorhanden = g.zutaten.find((x) => x.name === zName && x.unit === unit);
      if (vorhanden) {
        vorhanden.menge += menge;
      } else {
        g.zutaten.push({ name: zName, menge, unit, proPortion: menge });
      }
    }
  }

  // proPortion nachziehen: die erste Portion hat die Referenzmenge geliefert,
  // durch das Aufsummieren stimmt sie nicht mehr.
  for (const g of gerichte.values()) {
    for (const z of g.zutaten) {
      z.proPortion = g.anzahl > 0 ? z.menge / g.anzahl : z.menge;
    }
    g.zutaten.sort((a, b) => b.menge - a.menge);
  }

  return [...gerichte.values()].sort(
    (a, b) =>
      SLOT_ORDER.indexOf(a.mealType) - SLOT_ORDER.indexOf(b.mealType) ||
      b.anzahl - a.anzahl ||
      a.name.localeCompare(b.name),
  );
}
