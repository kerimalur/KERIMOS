import { GarminPanel } from "@/components/garmin-panel";
import { GarminVorschauPanel } from "@/components/garmin-vorschau";
import { Empty } from "@/components/ui";
import { gymConfigured, fetchExercises } from "@/lib/supabase/gym";
import {
  fetchGarminMappings, fetchUnmappedGarmin, fetchGarminSessions, fetchGarminTage,
  fetchGarminVorschau,
} from "@/lib/supabase/garmin";

export const dynamic = "force-dynamic";

export default async function GymGarminPage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const [exercises, mappings, unmapped, sessions, tage, vorschau] = await Promise.all([
    fetchExercises(),
    fetchGarminMappings(),
    fetchUnmappedGarmin(),
    fetchGarminSessions(),
    fetchGarminTage(),
    fetchGarminVorschau(),
  ]);

  const auswahl = exercises.map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="space-y-5">
      {/* Zuerst das, was auf Kerim wartet - der Rest ist Verwaltung. */}
      <GarminVorschauPanel vorschau={vorschau} exercises={auswahl} />
      <GarminPanel
        exercises={auswahl}
        mappings={mappings}
        unmapped={unmapped}
        sessions={sessions}
        tage={tage}
      />
    </div>
  );
}
