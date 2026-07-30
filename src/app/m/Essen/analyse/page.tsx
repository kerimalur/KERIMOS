import { MenuAnalyse } from "@/components/menu-analyse";
import { Empty } from "@/components/ui";
import {
  fetchDaySeries, toWeekBuckets, fetchTopRecipes, fetchTopFoods,
  fetchFoods, foodValueRanking, fetchMenuSettings, menuConfigured,
} from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function EssenAnalysePage() {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const [days, topRecipes, topFoods, foods, settings] = await Promise.all([
    fetchDaySeries(12),
    fetchTopRecipes(),
    fetchTopFoods(),
    fetchFoods("", 1000),
    fetchMenuSettings(),
  ]);

  const weeks = toWeekBuckets(days);

  return (
    <MenuAnalyse
      days={days}
      weeks={weeks}
      goals={{
        kcal: Number(settings.kcal_ziel) || 2000,
        protein: Number(settings.protein_ziel) || 150,
        kosten: Number(settings.kosten_ziel) || 20,
      }}
      topRecipes={topRecipes}
      topFoods={topFoods}
      proteinValue={foodValueRanking(foods, "protein", 10)}
      kcalValue={foodValueRanking(foods, "kcal", 10)}
    />
  );
}
