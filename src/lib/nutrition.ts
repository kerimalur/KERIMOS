/**
 * Nährwert-Rechnung für den Essen-Bereich.
 *
 * Bewusst ohne Datenbankbezug, damit Client-Komponenten sie ebenfalls nutzen
 * können: das Mahlzeiten-Formular rechnet live mit, gespeichert wird derselbe
 * Wert. Die Regeln sind dieselben wie in der Menü-App, damit Zahlen nicht
 * auseinanderlaufen.
 */

export type Einheit = "g" | "ml" | "dl" | "l" | "stk";

export interface FoodValues {
  calories_per_100: number;
  protein_per_100: number;
  carbs_per_100?: number | null;
  fat_per_100?: number | null;
  cost_per_100: number;
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  cost: number;
}

/**
 * Menge und Einheit in einen Faktor bezogen auf 100 Basiseinheiten.
 * Bei "stk" halten die *_per_100-Felder den Wert pro Stück.
 */
export function faktor(amount: number | string, unit: string): number {
  const n = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  switch (unit) {
    case "g": return n / 100;
    case "ml": return n / 100;
    case "dl": return n;          // 1 dl = 100 ml
    case "l": return n * 10;      // 1 l  = 1000 ml
    case "stk": return n;
    default: return n / 100;
  }
}

export function rechne(food: FoodValues, amount: number | string, unit: string): Nutrition {
  const f = faktor(amount, unit);
  return {
    kcal: Math.round(food.calories_per_100 * f * 10) / 10,
    protein: Math.round(food.protein_per_100 * f * 10) / 10,
    carbs: Math.round((food.carbs_per_100 ?? 0) * f * 10) / 10,
    fat: Math.round((food.fat_per_100 ?? 0) * f * 10) / 10,
    cost: Math.round(food.cost_per_100 * f * 1000) / 1000,
  };
}

export function summe(teile: Partial<Nutrition>[]): Nutrition {
  return teile.reduce<Nutrition>(
    (acc, t) => ({
      kcal: Math.round((acc.kcal + (t.kcal ?? 0)) * 10) / 10,
      protein: Math.round((acc.protein + (t.protein ?? 0)) * 10) / 10,
      carbs: Math.round((acc.carbs + (t.carbs ?? 0)) * 10) / 10,
      fat: Math.round((acc.fat + (t.fat ?? 0)) * 10) / 10,
      cost: Math.round((acc.cost + (t.cost ?? 0)) * 1000) / 1000,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 }
  );
}

/** Einheiten, die zu einem Lebensmittel passen. */
export function einheitenFuer(unit: string): Einheit[] {
  if (unit === "ml") return ["ml", "dl", "l"];
  if (unit === "stk") return ["stk"];
  return ["g"];
}
