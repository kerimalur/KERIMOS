import Link from "next/link";
import { WorkoutTracker } from "@/components/workout-tracker";
import { Card, CardTitle, Empty } from "@/components/ui";
import {
  gymConfigured, fetchWorkoutSession, fetchExercises, fetchMuscleGroups,
} from "@/lib/supabase/gym";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const { sessionId } = await params;
  const [view, uebungen, gruppen] = await Promise.all([
    fetchWorkoutSession(sessionId),
    fetchExercises(),
    fetchMuscleGroups(),
  ]);

  if (!view) {
    return (
      <Card>
        <CardTitle>Einheit nicht gefunden</CardTitle>
        <p className="text-sm text-ink-muted">
          Diese Trainingseinheit gibt es nicht mehr — vermutlich wurde sie
          abgebrochen oder gelöscht.
        </p>
        <Link href="/gym"
          className="mt-3 inline-block text-sm text-accent-soft transition hover:underline">
          Zurück zur Übersicht
        </Link>
      </Card>
    );
  }

  if (view.completedAt) {
    return (
      <Card>
        <CardTitle>Bereits abgeschlossen</CardTitle>
        <p className="text-sm text-ink-muted">
          Diese Einheit wurde am{" "}
          {new Date(view.completedAt).toLocaleDateString("de-CH", {
            day: "2-digit", month: "2-digit", year: "numeric",
          })}{" "}
          beendet. Im Verlauf lassen sich die Werte noch korrigieren.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/gym/verlauf"
            className="text-sm text-accent-soft transition hover:underline">
            Zum Verlauf
          </Link>
          <Link href="/gym" className="text-sm text-ink-muted transition hover:text-ink-soft">
            Zur Übersicht
          </Link>
        </div>
      </Card>
    );
  }

  const gruppeById = new Map(gruppen.map((g) => [g.id, g]));

  return (
    <WorkoutTracker
      sessionId={view.sessionId}
      trainingDayName={view.trainingDayName}
      startedAt={view.startedAt}
      exercises={view.exercises}
      alternativen={uebungen.map((u) => ({
        id: u.id,
        name: u.name,
        muscleGroupId: u.primary_muscle_id,
        muscleGroupName: u.muscleName,
        baseRecoveryHours: gruppeById.get(u.primary_muscle_id)?.base_recovery_hours ?? 48,
        equipment: u.equipment_needed,
      }))}
    />
  );
}
