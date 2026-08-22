"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask, toggleTask } from "@/lib/actions";
import { Button, Input, Label, Select, cx } from "@/components/ui";
import { DRINGLICH_CLASS, dringlichkeit, faelligText } from "@/lib/tasks";
import type { LifeArea, TaskView } from "@/lib/types";

/**
 * Die Aufgaben-Karte auf der Startseite und im Handy-Einstieg.
 *
 * Zwei Dinge muss sie können, mehr nicht: sehen, was ansteht, und mit einem
 * Klick aufs Plus etwas notieren. Alles Weitere - Details, Unteraufgaben,
 * erledigte Aufgaben - lebt auf /aufgaben.
 */
export function TaskQuick({
  tasks, areas, heute,
}: {
  tasks: TaskView[];
  areas: LifeArea[];
  heute: string;
}) {
  const router = useRouter();
  const [auf, setAuf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Optimistisch abgehakt: der Haken sitzt sofort, auch bevor der Server
  // geantwortet hat. Sonst fühlt sich jeder Klick träge an.
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());

  const offen = tasks.filter((t) => !erledigt.has(t.id));
  const ueberfaellig = offen.filter((t) => t.due_on !== null && t.due_on < heute).length;

  async function abhaken(id: string) {
    setErledigt((s) => new Set(s).add(id));
    const fd = new FormData();
    fd.set("id", id);
    fd.set("done", "true");
    try {
      await toggleTask(fd);
      router.refresh();
    } catch (e) {
      // Zurücknehmen, sonst verschwindet die Aufgabe nur scheinbar
      setErledigt((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      setFehler(e instanceof Error ? e.message : "Abhaken fehlgeschlagen");
    }
  }

  async function anlegen(fd: FormData) {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      await createTask(fd);
      setAuf(false);
      router.refresh();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Aufgabe konnte nicht angelegt werden");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Aufgaben
        </span>
        <div className="flex items-baseline gap-3">
          {ueberfaellig > 0 && (
            <span className="text-xs text-bad">
              {ueberfaellig} überfällig
            </span>
          )}
          {offen.length === 0 && !auf && (
            <span className="text-xs text-ink-faint">nichts offen</span>
          )}
          <button onClick={() => setAuf(!auf)}
            aria-label={auf ? "Abbrechen" : "Aufgabe hinzufügen"}
            className={cx("flex h-6 w-6 items-center justify-center rounded-lg text-base leading-none transition",
              auf ? "bg-sand text-ink" : "text-ink-muted hover:bg-sand hover:text-ink")}>
            {auf ? "×" : "+"}
          </button>
        </div>
      </div>

      {fehler && (
        <div className="mb-3 rounded-xl border border-bad/40 bg-bad-tint px-3 py-2 text-xs text-bad">
          {fehler}
        </div>
      )}

      {auf && (
        <form action={anlegen} className="mb-3 space-y-2.5 rounded-xl bg-sand/50 p-3">
          <Input name="title" required autoFocus placeholder="Was ist zu tun?" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <Label htmlFor="quick_due">Deadline</Label>
              <Input id="quick_due" name="due_on" type="date" />
            </div>
            <div>
              <Label htmlFor="quick_area">Lebensbereich</Label>
              <Select id="quick_area" name="life_area_id" defaultValue="">
                <option value="">— ohne —</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input type="checkbox" name="priority"
                className="h-3.5 w-3.5 rounded border-line accent-accent" />
              Wichtig
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="px-3 py-1.5 text-xs">
                Hinzufügen
              </Button>
            </div>
          </div>
        </form>
      )}

      {offen.length === 0 ? (
        !auf && (
          <p className="text-sm text-ink-muted">
            Keine offenen Aufgaben. Mit dem Plus notierst du eine.
          </p>
        )
      ) : (
        <ul className="space-y-1.5">
          {offen.slice(0, 6).map((t) => {
            const d = dringlichkeit(t.due_on, heute);
            const text = faelligText(t.due_on, heute);
            return (
              <li key={t.id} className="flex items-baseline gap-2.5 text-sm">
                <button onClick={() => abhaken(t.id)} aria-label="Aufgabe abhaken"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 self-start rounded border border-line-strong
                             transition hover:border-accent hover:bg-accent/15" />
                <span className={cx("w-24 shrink-0 text-xs", DRINGLICH_CLASS[d])}>
                  {text}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  {t.priority === 1 && <span className="mr-1 text-accent-soft">•</span>}
                  {t.title}
                  {t.subtasks.length > 0 && (
                    <span className="ml-1.5 text-xs text-ink-faint">
                      {t.subtasksDone}/{t.subtasks.length}
                    </span>
                  )}
                </span>
                {t.areaName && (
                  <span className="shrink-0 text-xs" style={{ color: t.areaColor ?? undefined }}>
                    {t.areaName}
                  </span>
                )}
              </li>
            );
          })}

          {offen.length > 6 && (
            <li>
              <span className="text-xs text-ink-faint">
                {offen.length - 6} weitere
              </span>
            </li>
          )}
        </ul>
      )}
    </>
  );
}
