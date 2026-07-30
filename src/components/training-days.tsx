"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTrainingDay, updateTrainingDay, deleteTrainingDay,
  addExerciseToDay, updateDayExercise, removeExerciseFromDay, moveExerciseInDay,
  startWorkout,
} from "@/lib/actions";
import { Badge, Button, Card, CardTitle, Empty, Input, Label, cx } from "@/components/ui";

interface Exercise {
  id: string; name: string; muscleName: string; is_cardio: boolean;
}
interface DayExercise {
  id: string; exercise_id: string; exerciseName: string; muscleName: string;
  is_cardio: boolean; order_index: number;
  target_sets: number | null; target_reps: string | null;
}
interface TrainingDay {
  id: string; name: string; description: string | null;
  exercises: DayExercise[]; muscles: string[];
}
interface Recovery { id: string; name: string; pct: number }

/**
 * Trainingstage: die Vorlagen, aus denen ein Training entsteht. Ein Tag
 * bündelt Übungen mit Zielsätzen und -wiederholungen; was daraus wird,
 * entscheidet erst die Einheit im Gym.
 */
export function TrainingDays({
  days, exercises, recovery,
}: {
  days: TrainingDay[];
  exercises: Exercise[];
  recovery: Recovery[];
}) {
  const router = useRouter();
  const [offen, setOffen] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const inErholung = recovery.filter((r) => r.pct < 100).sort((a, b) => a.pct - b.pct);

  async function lauf(action: (fd: FormData) => Promise<void>, fd: FormData) {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      await action(fd);
      router.refresh();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  /** Legt die Einheit an und öffnet die Workout-Seite. */
  async function starten(dayId: string) {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      const fd = new FormData();
      fd.set("training_day_id", dayId);
      const url = await startWorkout(fd);
      router.push(url);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Training konnte nicht gestartet werden");
      setBusy(false);
    }
  }

  return (
    <>
      {fehler && (
        <div className="rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
        </div>
      )}

      {inErholung.length > 0 && (
        <Card>
          <CardTitle>In Erholung</CardTitle>
          <p className="mb-3 text-xs text-ink-muted">
            Diese Muskelgruppen sind noch nicht vollständig erholt — beim Planen
            des nächsten Tages im Blick behalten.
          </p>
          <ul className="space-y-2.5">
            {inErholung.slice(0, 8).map((r) => (
              <li key={r.id}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm text-ink-soft">{r.name}</span>
                  <span className="tabular text-xs text-ink-muted">{r.pct} %</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div className={cx("h-full rounded-full",
                    r.pct >= 75 ? "bg-good" : r.pct >= 40 ? "bg-warn" : "bg-bad")}
                    style={{ width: `${Math.max(4, r.pct)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="mb-0">Trainingstage</CardTitle>
          <button onClick={() => setNeu(!neu)}
            className="text-xs font-medium text-accent-soft transition hover:underline">
            {neu ? "Schliessen" : "+ Neuer Trainingstag"}
          </button>
        </div>

        {neu && (
          <form action={(fd) => lauf(createTrainingDay, fd)}
            className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-sand/60 p-3">
            <div className="min-w-40 flex-1">
              <Label htmlFor="td-name">Name</Label>
              <Input id="td-name" name="name" required placeholder="z.B. Push A" />
            </div>
            <div className="min-w-40 flex-1">
              <Label htmlFor="td-desc">Beschreibung</Label>
              <Input id="td-desc" name="description" placeholder="optional" />
            </div>
            <Button type="submit" disabled={busy}>Anlegen</Button>
          </form>
        )}

        {days.length === 0 ? (
          <Empty>
            Noch kein Trainingstag. Leg einen an und häng Übungen daran —
            danach lässt er sich planen und starten.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {days.map((d) => {
              const auf = offen === d.id;
              return (
                <li key={d.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setOffen(auf ? null : d.id)}
                      className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium text-ink">
                        {d.name}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {d.exercises.length} Übungen
                        {d.description && ` · ${d.description}`}
                      </span>
                      {d.muscles.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {d.muscles.slice(0, 4).map((m) => (
                            <Badge key={m} tone="accent">{m}</Badge>
                          ))}
                          {d.muscles.length > 4 && (
                            <span className="text-[11px] text-ink-faint">
                              +{d.muscles.length - 4}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                    <Button onClick={() => starten(d.id)}
                      disabled={busy || d.exercises.length === 0}
                      className="shrink-0 px-3 py-1.5 text-xs">
                      Start
                    </Button>
                    <button onClick={() => lauf(deleteTrainingDay, formOf({ id: d.id }))}
                      aria-label="Trainingstag löschen"
                      className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad">
                      ✕
                    </button>
                  </div>

                  {auf && (
                    <div className="mt-3 rounded-xl bg-sand/50 p-3">
                      {d.exercises.length === 0 ? (
                        <p className="text-sm text-ink-muted">Noch keine Übung.</p>
                      ) : (
                        <ul className="divide-y divide-line/70">
                          {d.exercises.map((e, i) => (
                            <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5">
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm text-ink">
                                  {e.exerciseName}
                                </span>
                                <span className="text-xs text-ink-muted">{e.muscleName}</span>
                              </span>

                              <form action={(fd) => lauf(updateDayExercise, fd)}
                                className="flex items-center gap-1.5">
                                <input type="hidden" name="id" value={e.id} />
                                <Input name="target_sets" type="number" min={1} max={10}
                                  defaultValue={e.target_sets ?? 3} className="w-16"
                                  aria-label={`Sätze ${e.exerciseName}`} />
                                <span className="text-xs text-ink-muted">×</span>
                                <Input name="target_reps"
                                  defaultValue={e.target_reps ?? "8-12"} className="w-20"
                                  aria-label={`Wiederholungen ${e.exerciseName}`} />
                                <button className="text-xs text-accent-soft hover:underline">
                                  OK
                                </button>
                              </form>

                              <span className="flex shrink-0 items-center">
                                <button
                                  onClick={() => lauf(moveExerciseInDay,
                                    formOf({ id: e.id, richtung: "hoch" }))}
                                  disabled={i === 0}
                                  aria-label="Nach oben"
                                  className="px-1 text-xs text-ink-faint transition hover:text-ink disabled:opacity-30">
                                  ↑
                                </button>
                                <button
                                  onClick={() => lauf(moveExerciseInDay,
                                    formOf({ id: e.id, richtung: "runter" }))}
                                  disabled={i === d.exercises.length - 1}
                                  aria-label="Nach unten"
                                  className="px-1 text-xs text-ink-faint transition hover:text-ink disabled:opacity-30">
                                  ↓
                                </button>
                                <button
                                  onClick={() => lauf(removeExerciseFromDay, formOf({ id: e.id }))}
                                  aria-label={`${e.exerciseName} entfernen`}
                                  className="px-1 text-sm text-ink-faint transition hover:text-bad">
                                  ✕
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <UebungHinzufuegen dayId={d.id} exercises={exercises}
                        onFertig={() => router.refresh()} />

                      <div className="mt-3 border-t border-line/70 pt-3">
                        <form action={(fd) => lauf(updateTrainingDay, fd)}
                          className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={d.id} />
                          <div className="w-40">
                            <Label>Name</Label>
                            <Input name="name" defaultValue={d.name} />
                          </div>
                          <div className="min-w-40 flex-1">
                            <Label>Beschreibung</Label>
                            <Input name="description" defaultValue={d.description ?? ""} />
                          </div>
                          <Button variant="ghost" type="submit" disabled={busy}>
                            Speichern
                          </Button>
                        </form>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function formOf(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}

/** Übungssuche innerhalb eines Trainingstags. */
function UebungHinzufuegen({
  dayId, exercises, onFertig,
}: { dayId: string; exercises: Exercise[]; onFertig: () => void }) {
  const [suche, setSuche] = useState("");
  const [busy, setBusy] = useState(false);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return exercises.filter((e) =>
      e.name.toLowerCase().includes(q) || e.muscleName.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [exercises, suche]);

  async function hinzu(e: Exercise) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("training_day_id", dayId);
    fd.set("exercise_id", e.id);
    fd.set("target_sets", e.is_cardio ? "1" : "3");
    fd.set("target_reps", e.is_cardio ? "—" : "8-12");
    await addExerciseToDay(fd);
    setSuche("");
    setBusy(false);
    onFertig();
  }

  return (
    <div className="relative mt-3">
      <Input value={suche} onChange={(ev) => setSuche(ev.target.value)}
        placeholder="Übung suchen und antippen …" aria-label="Übung suchen" />
      {treffer.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          {treffer.map((e) => (
            <li key={e.id}>
              <button onClick={() => hinzu(e)}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-sand">
                <span className="min-w-0 truncate text-ink">{e.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {e.is_cardio ? "Cardio" : e.muscleName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
