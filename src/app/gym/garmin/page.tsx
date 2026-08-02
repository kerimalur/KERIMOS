import { GarminPanel } from "@/components/garmin-panel";
import { Empty } from "@/components/ui";
import { gymConfigured, fetchExercises } from "@/lib/supabase/gym";
import {
  fetchGarminMappings, fetchUnmappedGarmin, fetchGarminSessions,
} from "@/lib/supabase/garmin";

export const dynamic = "force-dynamic";

export default async function GymGarminPage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const [exercises, mappings, unmapped, sessions] = await Promise.all([
    fetchExercises(),
    fetchGarminMappings(),
    fetchUnmappedGarmin(),
    fetchGarminSessions(),
  ]);

  return (
    <GarminPanel
      exercises={exercises.map((e) => ({ id: e.id, name: e.name }))}
      mappings={mappings}
      unmapped={unmapped}
      sessions={sessions}
    />
  );
}
