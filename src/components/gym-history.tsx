"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateExerciseLog, deleteWorkoutSession } from "@/lib/actions";
import { Badge, Card, CardTitle, Empty, Input, cx } from "@/components/ui";

interface HistorySet {
  id: string; exerciseId: string; exerciseName: string;
  setNumber: number; weightKg: number; reps: number; rir: number;
}
interface HistoryCardio {
  id: string; exerciseName: string; durationMinutes: number; distanceKm: number | null;
}
interface Session {
  id: string; trainingDayName: string; startedAt: string; completedAt: string;
  sets: HistorySet[]; cardio: HistoryCardio[]; volumen: number;
}

/** "Do, 30.07.2026 · 18:45" */
function zeitpunkt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  })} · ${d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "1 h 12 min" · "48 min" */
function dauer(von: string, bis: string): string {
  const min = Math.round((new Date(bis).getTime() - new Date(von).getTime()) / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Sätze einer Einheit nach Übung bündeln, Reihenfolge beibehalten. */
function nachUebung(sets: HistorySet[]) {
  const map = new Map<string, { name: string; saetze: HistorySet[] }>();
  for (const s of [...sets].sort((a, b) => a.setNumber - b.setNumber)) {
    const eintrag = map.get(s.exerciseId) ?? { name: s.exerciseName, saetze: [] };
    eintrag.saetze.push(s);
    map.set(s.exerciseId, eintrag);
  }
  return [...map.values()];
}

const RIR_FARBE = (rir: number) =>
  rir <= 1 ? "text-bad" : rir <= 3 ? "text-warn" : "text-good";

/**
 * Trainingsverlauf: was wurde wann bewegt. Werte lassen sich nachträglich
 * korrigieren - im Gym vertippt man sich, und eine falsche Zahl verzerrt
 * später jede Auswertung.
 */
export function GymHistory({ sessions }: { sessions: Session[] }) {
  const router = useRouter();
  const [offen, setOffen] = useState<string | null>(null);
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

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

  async function loeschen(s: Session) {
    if (!confirm(`Training vom ${zeitpunkt(s.completedAt)} löschen? Alle Sätze und Erholungsdaten gehen mit.`)) return;
    const fd = new FormData();
    fd.set("id", s.id);
    await lauf(deleteWorkoutSession, fd);
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardTitle>Verlauf</CardTitle>
        <Empty>
          Noch kein abgeschlossenes Training. Sobald du eine Einheit beendest,
          steht sie hier.
        </Empty>
      </Card>
    );
  }

  return (
    <>
      {fehler && (
        <div className="rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
        </div>
      )}

      <Card>
        <CardTitle>Verlauf · {sessions.length} Trainings</CardTitle>
        <p className="text-xs text-ink-muted">
          Antippen zeigt die Sätze. Zum Korrigieren auf „Werte ändern“ —
          gespeichert wird jeder Satz einzeln.
        </p>
      </Card>

      {sessions.map((s) => {
        const auf = offen === s.id;
        const gruppen = nachUebung(s.sets);
        return (
          <Card key={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button onClick={() => setOffen(auf ? null : s.id)}
                className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-ink">
                  {s.trainingDayName}
                </span>
                <span className="block text-xs text-ink-muted">
                  {zeitpunkt(s.completedAt)}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span>{dauer(s.startedAt, s.completedAt)}</span>
                  {s.sets.length > 0 && <span>{s.sets.length} Sätze</span>}
                  {s.cardio.length > 0 && <span>{s.cardio.length}× Cardio</span>}
                  {s.volumen > 0 && (
                    <span className="tabular">{s.volumen.toLocaleString("de-CH")} kg</span>
                  )}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => {
                    setOffen(s.id);
                    setBearbeitet(bearbeitet === s.id ? null : s.id);
                  }}
                  className="text-xs text-accent-soft transition hover:underline">
                  {bearbeitet === s.id ? "Fertig" : "Werte ändern"}
                </button>
                <button onClick={() => loeschen(s)} disabled={busy}
                  aria-label="Training löschen"
                  className="px-1 text-sm text-ink-faint transition hover:text-bad">
                  ✕
                </button>
              </div>
            </div>

            {auf && (
              <div className="mt-3 space-y-3">
                {gruppen.length === 0 && s.cardio.length === 0 && (
                  <p className="text-sm text-ink-muted">Keine Sätze erfasst.</p>
                )}

                {gruppen.map((g, gi) => {
                  const max = Math.max(0, ...g.saetze.map((x) => x.weightKg));
                  return (
                    <div key={gi} className="rounded-xl bg-sand/50 p-3">
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{g.name}</span>
                        {max > 0 && (
                          <span className="tabular shrink-0 text-xs text-ink-muted">
                            max {max} kg
                          </span>
                        )}
                      </div>
                      <div className="mb-1 grid grid-cols-[24px_1fr_1fr_1fr_auto] gap-1.5 px-1">
                        {["#", "kg", "Wdh", "RIR", ""].map((h, i) => (
                          <span key={i}
                            className="text-center text-[10px] uppercase tracking-wide text-ink-muted">
                            {h}
                          </span>
                        ))}
                      </div>
                      <div className="space-y-1">
                        {g.saetze.map((satz, si) => (
                          bearbeitet === s.id ? (
                            <form key={satz.id} action={(fd) => lauf(updateExerciseLog, fd)}
                              className="grid grid-cols-[24px_1fr_1fr_1fr_auto] items-center gap-1.5">
                              <input type="hidden" name="id" value={satz.id} />
                              <span className="text-center text-xs text-ink-muted">{si + 1}</span>
                              <Input name="weight_kg" type="number" step="any"
                                defaultValue={satz.weightKg} className="py-1.5 text-center text-xs"
                                aria-label={`Gewicht Satz ${si + 1}`} />
                              <Input name="reps" type="number" min={0}
                                defaultValue={satz.reps} className="py-1.5 text-center text-xs"
                                aria-label={`Wiederholungen Satz ${si + 1}`} />
                              <Input name="rir" type="number" min={0} max={10}
                                defaultValue={satz.rir} className="py-1.5 text-center text-xs"
                                aria-label={`RIR Satz ${si + 1}`} />
                              <button
                                className="px-1.5 text-xs text-accent-soft transition hover:underline">
                                OK
                              </button>
                            </form>
                          ) : (
                            <div key={satz.id}
                              className={cx("grid grid-cols-[24px_1fr_1fr_1fr_auto] gap-1.5 rounded-lg py-1",
                                si % 2 === 0 && "bg-card/60")}>
                              <span className="text-center text-xs text-ink-muted">{si + 1}</span>
                              <span className="tabular text-center text-xs text-ink-soft">
                                {satz.weightKg}
                              </span>
                              <span className="tabular text-center text-xs text-ink-soft">
                                {satz.reps}
                              </span>
                              <span className={cx("tabular text-center text-xs font-medium",
                                RIR_FARBE(satz.rir))}>
                                {satz.rir}
                              </span>
                              <span className="w-6" />
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  );
                })}

                {s.cardio.map((c) => (
                  <div key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-warn-tint/60 p-3">
                    <span className="min-w-0 truncate text-sm text-ink">{c.exerciseName}</span>
                    <Badge tone="warn">
                      {c.durationMinutes} min
                      {c.distanceKm !== null && ` · ${c.distanceKm} km`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}
