import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { TaskQuick } from "@/components/task-quick";
import { buildTasks, sortOpen } from "@/lib/tasks";
import { heuteISO } from "@/lib/time";
import type { LifeArea, Subtask, Task } from "@/lib/types";

/**
 * Die wichtigsten offenen Aufgaben - auf der Startseite und im Handy-Einstieg
 * gleich unter der Morgen-Karte, direkt über den Terminen.
 *
 * Fehlt die Tabelle noch, bleibt die Karte still weg - genau wie die
 * Termin-Karte. So bricht die Startseite nicht, bevor die Migration lief.
 */
export async function TasksCard() {
  const supabase = await createClient();

  const [{ data: taskRows, error }, { data: areaRows }] = await Promise.all([
    supabase.from("tasks").select("*").is("done_at", null),
    supabase.from("life_areas").select("*").eq("archived", false).order("sort_order"),
  ]);

  if (error) return null;

  const tasks = (taskRows ?? []) as Task[];
  const areas = (areaRows ?? []) as LifeArea[];

  // Keine offene Aufgabe heisst: keine Karte. Ein leeres Kästchen mit
  // Schnellerfassung gehört auf die Aufgabenseite, nicht ins Cockpit.
  if (tasks.length === 0) return null;

  // Unteraufgaben nur für die tatsächlich angezeigten Aufgaben nachladen
  let subtasks: Subtask[] = [];
  if (tasks.length > 0) {
    const { data } = await supabase.from("subtasks")
      .select("*").in("task_id", tasks.map((t) => t.id));
    subtasks = (data ?? []) as Subtask[];
  }

  return (
    <Card className="p-5">
      <TaskQuick
        tasks={sortOpen(buildTasks(tasks, subtasks, areas))}
        areas={areas}
        heute={heuteISO()}
      />
    </Card>
  );
}
