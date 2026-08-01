"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateTask, toggleTask, deleteTask,
  addSubtask, toggleSubtask, deleteSubtask,
} from "@/lib/actions";
import { Button, Empty, Input, Label, Select, cx } from "@/components/ui";
import { DRINGLICH_CLASS, dringlichkeit, faelligText } from "@/lib/tasks";
import type { LifeArea, TaskView } from "@/lib/types";

/**
 * Die volle Aufgabenliste: abhaken, aufklappen, ändern, Unteraufgaben
 * pflegen. Ein Klick auf den Titel öffnet die Details - dasselbe Muster wie
 * bei den Terminen, damit man nichts Neues lernen muss.
 */
export function TaskList({
  tasks, areas, heute, erledigt = false,
}: {
  tasks: TaskView[];
  areas: LifeArea[];
  heute: string;
  /** Erledigte Aufgaben werden gedämpft und durchgestrichen gezeigt. */
  erledigt?: boolean;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (tasks.length === 0) {
    return <Empty>{erledigt ? "Noch nichts abgehakt." : "Nichts offen."}</Empty>;
  }

  async function lauf(action: (fd: FormData) => Promise<void>, fd: FormData, zu = false) {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      await action(fd);
      if (zu) setOffen(null);
      router.refresh();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {fehler && (
        <div className="mb-3 rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
        </div>
      )}

      <ul className="divide-y divide-line">
        {tasks.map((t) => {
          const auf = offen === t.id;
          const d = dringlichkeit(t.due_on, heute);
          return (
            <li key={t.id} className="py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <button
                  onClick={() => lauf(toggleTask, formOf({ id: t.id, done: erledigt ? "" : "true" }))}
                  aria-label={erledigt ? "Wieder öffnen" : "Aufgabe abhaken"}
                  className={cx(
                    "mt-0.5 h-4 w-4 shrink-0 self-start rounded border transition",
                    erledigt
                      ? "border-line bg-sand text-[10px] leading-none text-ink-muted"
                      : "border-line-strong hover:border-accent hover:bg-accent/15"
                  )}>
                  {erledigt && "✓"}
                </button>

                <button onClick={() => setOffen(auf ? null : t.id)}
                  className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
                  {!erledigt && (
                    <span className={cx("w-24 shrink-0 text-xs", DRINGLICH_CLASS[d])}>
                      {faelligText(t.due_on, heute)}
                    </span>
                  )}
                  <span className={cx("text-sm",
                    erledigt ? "text-ink-faint line-through" : "text-ink")}>
                    {t.priority === 1 && !erledigt && (
                      <span className="mr-1 text-accent-soft">•</span>
                    )}
                    {t.title}
                  </span>
                  {t.subtasks.length > 0 && (
                    <span className="shrink-0 text-xs text-ink-faint">
                      {t.subtasksDone}/{t.subtasks.length}
                    </span>
                  )}
                  {t.areaName && (
                    <span className="shrink-0 text-xs"
                      style={{ color: erledigt ? undefined : t.areaColor ?? undefined }}>
                      {t.areaName}
                    </span>
                  )}
                  {t.details && !auf && (
                    <span className="min-w-0 truncate text-xs text-ink-faint">
                      · {t.details}
                    </span>
                  )}
                </button>

                <button onClick={() => lauf(deleteTask, formOf({ id: t.id }))}
                  aria-label="Aufgabe löschen"
                  className="ml-auto shrink-0 px-1 text-xs text-ink-faint transition hover:text-bad">
                  ✕
                </button>
              </div>

              {auf && (
                <div className="mt-3 space-y-3 rounded-xl bg-sand/50 p-3">
                  <form action={(fd) => lauf(updateTask, fd, true)} className="space-y-3">
                    <input type="hidden" name="id" value={t.id} />
                    <div>
                      <Label>Aufgabe</Label>
                      <Input name="title" defaultValue={t.title} required />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Deadline — leer heisst irgendwann</Label>
                        <Input name="due_on" type="date" defaultValue={t.due_on ?? ""} />
                      </div>
                      <div>
                        <Label>Lebensbereich</Label>
                        <Select name="life_area_id" defaultValue={t.life_area_id ?? ""}>
                          <option value="">— ohne —</option>
                          {areas.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Details</Label>
                      <textarea name="details" rows={3} defaultValue={t.details ?? ""}
                        placeholder="Was gehört dazu, worauf achten?"
                        className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm
                                   text-ink placeholder:text-ink-faint outline-none transition
                                   hover:border-line-strong focus:border-accent
                                   focus:ring-2 focus:ring-accent/15" />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-ink-muted">
                        <input type="checkbox" name="priority" defaultChecked={t.priority === 1}
                          className="h-3.5 w-3.5 rounded border-line accent-accent" />
                        Wichtig
                      </label>
                      <div className="ml-auto flex gap-2">
                        <Button type="submit" disabled={busy}>Speichern</Button>
                        <Button type="button" variant="ghost" onClick={() => setOffen(null)}>
                          Schliessen
                        </Button>
                      </div>
                    </div>
                  </form>

                  {/* Unteraufgaben - bewusst innerhalb der Aufgabe, nicht als
                      eigene Ebene in der Liste. Sonst wird die Übersicht zur
                      Baumansicht und man findet nichts mehr. */}
                  <div className="border-t border-line pt-3">
                    <Label>Unteraufgaben</Label>
                    {t.subtasks.length > 0 && (
                      <ul className="mb-2 space-y-1">
                        {t.subtasks.map((s) => (
                          <li key={s.id} className="flex items-baseline gap-2.5 text-sm">
                            <button
                              onClick={() => lauf(toggleSubtask,
                                formOf({ id: s.id, done: s.done_at ? "" : "true" }))}
                              aria-label="Unteraufgabe abhaken"
                              className={cx(
                                "mt-0.5 h-3.5 w-3.5 shrink-0 self-start rounded border transition",
                                s.done_at
                                  ? "border-line bg-sand text-[9px] leading-none text-ink-muted"
                                  : "border-line-strong hover:border-accent hover:bg-accent/15"
                              )}>
                              {s.done_at && "✓"}
                            </button>
                            <span className={cx("min-w-0 flex-1",
                              s.done_at ? "text-ink-faint line-through" : "text-ink-soft")}>
                              {s.title}
                            </span>
                            <button onClick={() => lauf(deleteSubtask, formOf({ id: s.id }))}
                              aria-label="Unteraufgabe löschen"
                              className="shrink-0 px-1 text-xs text-ink-faint transition hover:text-bad">
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <form action={(fd) => lauf(addSubtask, fd)} className="flex gap-2">
                      <input type="hidden" name="task_id" value={t.id} />
                      <Input name="title" required placeholder="Schritt hinzufügen"
                        className="flex-1" />
                      <Button type="submit" variant="ghost" disabled={busy}
                        className="shrink-0 px-3 py-2 text-xs">
                        +
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function formOf(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}
