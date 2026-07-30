import { FoodList } from "@/components/food-list";
import { Empty } from "@/components/ui";
import { fetchFoods, fetchFoodCategories, menuConfigured } from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function EssenLebensmittelPage() {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const [foods, categories] = await Promise.all([
    fetchFoods("", 1000), fetchFoodCategories(),
  ]);
  return <FoodList foods={foods} categories={categories} />;
}
