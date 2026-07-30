import { heuteISO, addDays } from "@/lib/time";
import { dateLabel } from "@/lib/format";
import type { LifeArea, Subtask, Task, TaskView } from "@/lib/types";

/**
 * Fügt Aufgaben, Bereiche und Unteraufgaben zusammen. Bewusst drei flache
 * Abfragen statt eines eingebetteten Joins - dasselbe Muster wie im Gym- und
 * Menü-Modul, weil PostgREST bei Joins keinen ableitbaren Typ liefert.
 */
export function buildTasks(
  tasks: Task[], subtasks: Subtask[], areas: LifeArea[]
): TaskView[] {
  const areaById = new Map(areas.map((a) => [a.id, a]));

  const nachAufgabe = new Map<string, Subtask[]>();
  for (const s of subtasks) {
    const list = nachAufgabe.get(s.task_id) ?? [];
    list.push(s);
    nachAufgabe.set(s.task_id, list);
  }
  for (const list of nachAufgabe.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  return tasks.map((t) => {
    const area = t.life_area_id ? areaById.get(t.life_area_id) : undefined;
    const subs = nachAufgabe.get(t.id) ?? [];
    return {
      ...t,
      areaName: area?.name ?? null,
      areaColor: area?.color ?? null,
      subtasks: subs,
      subtasksDone: subs.filter((s) => s.done_at !== null).length,
    };
  });
}

/**
 * Reihenfolge der offenen Aufgaben: was überfällig ist, steht oben; danach
 * nach Deadline. Wichtiges schlägt Unwichtiges, Aufgaben ohne Deadline
 * landen am Ende - sie drängen nicht, sollen aber nicht verschwinden.
 */
export function sortOpen(tasks: TaskView[]): TaskView[] {
  return [...tasks].sort((a, b) => {
    if ((a.due_on === null) !== (b.due_on === null)) return a.due_on === null ? 1 : -1;
    if (a.due_on !== null && b.due_on !== null && a.due_on !== b.due_on) {
      return a.due_on.localeCompare(b.due_on);
    }
    if (a.priority !== b.priority) return b.priority - a.priority;
    // Ältestes zuerst - was länger liegt, drängt mehr
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

export type Dringlichkeit = "ueberfaellig" | "heute" | "bald" | "offen" | "ohne";

/** Wie dringend ist die Aufgabe, gemessen an heute? */
export function dringlichkeit(dueOn: string | null, heute = heuteISO()): Dringlichkeit {
  if (dueOn === null) return "ohne";
  if (dueOn < heute) return "ueberfaellig";
  if (dueOn === heute) return "heute";
  if (dueOn <= addDays(heute, 2)) return "bald";
  return "offen";
}

/** "überfällig" · "heute" · "morgen" · "Do, 06.08.2026" · "" */
export function faelligText(dueOn: string | null, heute = heuteISO()): string {
  if (dueOn === null) return "";
  if (dueOn < heute) return "überfällig";
  if (dueOn === heute) return "heute";
  if (dueOn === addDays(heute, 1)) return "morgen";
  return dateLabel(dueOn);
}

/** Farbklasse zur Dringlichkeit - überall dieselbe Sprache. */
export const DRINGLICH_CLASS: Record<Dringlichkeit, string> = {
  ueberfaellig: "text-bad",
  heute: "text-accent-soft",
  bald: "text-warn",
  offen: "text-ink-muted",
  ohne: "text-ink-faint",
};
