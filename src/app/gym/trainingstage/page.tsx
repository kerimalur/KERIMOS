import { TrainingDays } from "@/components/training-days";
import { Empty } from "@/components/ui";
import {
  gymConfigured, fetchTrainingDays, fetchExercises, fetchRecovery,
} from "@/lib/supabase/gym";

export const dynamic = "force-dynamic";

export default async function GymTrainingstagePage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const [days, exercises, recovery] = await Promise.all([
    fetchTrainingDays(), fetchExercises(), fetchRecovery(),
  ]);

  return (
    <TrainingDays
      days={days}
      exercises={exercises.map((e) => ({
        id: e.id, name: e.name, muscleName: e.muscleName, is_cardio: e.is_cardio,
      }))}
      recovery={recovery}
    />
  );
}
