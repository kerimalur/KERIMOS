import { GymPlanner } from "@/components/gym-planner";
import { Empty } from "@/components/ui";
import {
  gymConfigured, fetchCalendarEntries, fetchTrainingDays,
} from "@/lib/supabase/gym";
import { heuteISO, addDays } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function GymKalenderPage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const heute = heuteISO();
  const [entries, days] = await Promise.all([
    // Vier Wochen zurück reichen, um zu sehen, was zuletzt lief
    fetchCalendarEntries(addDays(heute, -28)),
    fetchTrainingDays(),
  ]);

  return (
    <GymPlanner
      entries={entries}
      days={days.map((d) => ({
        id: d.id, name: d.name, anzahlUebungen: d.exercises.length,
      }))}
      heute={heute}
    />
  );
}
