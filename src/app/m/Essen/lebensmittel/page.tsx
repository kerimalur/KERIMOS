import { FoodList } from "@/components/food-list";
import { Empty } from "@/components/ui";
import { fetchFoods, menuConfigured } from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function EssenLebensmittelPage() {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const foods = await fetchFoods("", 1000);
  return <FoodList foods={foods} />;
}
