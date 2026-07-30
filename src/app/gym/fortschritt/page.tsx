import { GymExerciseProgress } from "@/components/gym-exercise-progress";
import { Empty } from "@/components/ui";
import {
  gymConfigured, fetchExercises, fetchExerciseHistory, fetchGymTotals,
} from "@/lib/supabase/gym";

export const dynamic = "force-dynamic";

const ERLAUBTE_WOCHEN = [0, 4, 12, 52];

export default async function GymFortschrittPage({
  searchParams,
}: {
  searchParams: Promise<{ ex?: string; w?: string }>;
}) {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const sp = await searchParams;
  const [uebungen, totals] = await Promise.all([fetchExercises(), fetchGymTotals()]);

  if (uebungen.length === 0) {
    return (
      <GymExerciseProgress
        uebungen={[]} gewaehlt={null} wochen={4} punkte={[]} totals={totals}
      />
    );
  }

  const gewaehlt = uebungen.find((u) => u.id === sp.ex) ?? uebungen[0];
  const gewuenscht = Number(sp.w);
  const wochen = ERLAUBTE_WOCHEN.includes(gewuenscht) ? gewuenscht : 4;

  const punkte = await fetchExerciseHistory(gewaehlt.id, wochen, gewaehlt.is_cardio);

  return (
    <GymExerciseProgress
      uebungen={uebungen.map((u) => ({
        id: u.id, name: u.name, muscleName: u.muscleName, isCardio: u.is_cardio,
      }))}
      gewaehlt={{
        id: gewaehlt.id, name: gewaehlt.name,
        muscleName: gewaehlt.muscleName, isCardio: gewaehlt.is_cardio,
      }}
      wochen={wochen}
      punkte={punkte}
      totals={totals}
    />
  );
}
