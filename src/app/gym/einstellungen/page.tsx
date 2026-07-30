import { GymSettings } from "@/components/gym-settings";
import { Empty } from "@/components/ui";
import {
  gymConfigured, fetchWeeklyGoal, fetchMuscleGroups, countSessionsSince,
} from "@/lib/supabase/gym";
import { heuteISO, weekStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function GymEinstellungenPage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const [weeklyGoal, muscleGroups, dieseWoche] = await Promise.all([
    fetchWeeklyGoal(),
    fetchMuscleGroups(),
    countSessionsSince(weekStart(heuteISO())),
  ]);

  return (
    <GymSettings
      weeklyGoal={weeklyGoal}
      muscleGroups={muscleGroups}
      dieseWoche={dieseWoche}
    />
  );
}
