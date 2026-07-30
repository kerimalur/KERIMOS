import { ExerciseList } from "@/components/exercise-list";
import { Empty } from "@/components/ui";
import { gymConfigured, fetchExercises, fetchMuscleGroups } from "@/lib/supabase/gym";

export const dynamic = "force-dynamic";

export default async function GymUebungenPage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const [exercises, muscleGroups] = await Promise.all([
    fetchExercises(), fetchMuscleGroups(),
  ]);

  return (
    <ExerciseList
      exercises={exercises}
      muscleGroups={muscleGroups.map((m) => ({ id: m.id, name: m.name }))}
    />
  );
}
