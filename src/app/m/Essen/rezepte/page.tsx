import { RecipeList } from "@/components/recipe-list";
import { DayTemplateList } from "@/components/day-template-list";
import { Empty } from "@/components/ui";
import {
  fetchRecipes, fetchFoods, fetchRecipeCategories, fetchDayTemplates, menuConfigured,
} from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function EssenRezeptePage() {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const [recipes, foods, categories, templates] = await Promise.all([
    fetchRecipes(), fetchFoods(), fetchRecipeCategories(), fetchDayTemplates(),
  ]);

  return (
    <>
      <RecipeList recipes={recipes} foods={foods} categories={categories} />
      {/* Vorlagen stehen unter den Rezepten: erst hat man Rezepte, dann
          stellt man daraus ganze Tage zusammen. */}
      <DayTemplateList
        templates={templates}
        rezepte={recipes.map((r) => ({ id: r.id, name: r.name, meal_type: r.meal_type }))}
      />
    </>
  );
}
