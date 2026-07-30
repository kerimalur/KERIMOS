import { RecipeList } from "@/components/recipe-list";
import { Empty } from "@/components/ui";
import { fetchRecipes, fetchFoods, menuConfigured } from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function EssenRezeptePage() {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const [recipes, foods] = await Promise.all([fetchRecipes(), fetchFoods()]);
  return <RecipeList recipes={recipes} foods={foods} />;
}
