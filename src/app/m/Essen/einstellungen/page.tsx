import { MenuSettings } from "@/components/menu-settings";
import { Empty } from "@/components/ui";
import {
  fetchMenuSettings, fetchRecipes, fetchFoodCategories, fetchRecipeCategories,
  fetchEventRules, menuConfigured,
} from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function EssenEinstellungenPage() {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const [settings, recipes, foodCategories, recipeCategories, eventRules] = await Promise.all([
    fetchMenuSettings(),
    fetchRecipes(),
    fetchFoodCategories(),
    fetchRecipeCategories(),
    fetchEventRules(),
  ]);

  return (
    <MenuSettings
      settings={settings}
      recipes={recipes.map((r) => ({ id: r.id, name: r.name, meal_type: r.meal_type }))}
      foodCategories={foodCategories}
      recipeCategories={recipeCategories}
      eventRules={eventRules}
    />
  );
}
