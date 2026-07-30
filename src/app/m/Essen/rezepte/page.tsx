import { RecipeList } from "@/components/recipe-list";
import { Empty } from "@/components/ui";
import { fetchRecipes, fetchFoods, fetchRecipeCategories, menuConfigured } from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function EssenRezeptePage() {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const [recipes, foods, categories] = await Promise.all([
    fetchRecipes(), fetchFoods(), fetchRecipeCategories(),
  ]);
  return <RecipeList recipes={recipes} foods={foods} categories={categories} />;
}
