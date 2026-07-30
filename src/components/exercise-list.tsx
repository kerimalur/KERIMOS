"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createExercise, deleteExercise } from "@/lib/actions";
import { Badge, Button, Card, CardTitle, Empty, Input, Label, Select } from "@/components/ui";

interface Exercise {
  id: string; name: string; description: string | null;
  primary_muscle_id: string; muscleName: string;
  equipment_needed: string | null; is_cardio: boolean;
}
interface MuscleGroup { id: string; name: string }

/**
 * Übungsdatenbank. Die Übungen sind nicht an einen Nutzer gebunden - sie
 * bilden den gemeinsamen Vorrat, aus dem sich die Trainingstage bedienen.
 */
export function ExerciseList({
  exercises, muscleGroups,
}: { exercises: Exercise[]; muscleGroups: MuscleGroup[] }) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [filter, setFilter] = useState("");
  const [neu, setNeu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return exercises.filter((e) => {
      if (filter && e.primary_muscle_id !== filter) return false;
      return q ? e.name.toLowerCase().includes(q) : true;
    });
  }, [exercises, suche, filter]);

  async function lauf(action: (fd: FormData) => Promise<void>, fd: FormData) {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      await action(fd);
      router.refresh();
    } catch (e) {
      // Eine Übung, die noch in einem Trainingstag steckt, lässt sich nicht
      // löschen - die Datenbank hält die Verknüpfung. Das soll man sehen.
      setFehler(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {fehler && (
        <div className="mb-3 rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="mb-0">Übungen</CardTitle>
        <button onClick={() => setNeu(!neu)}
          className="text-xs font-medium text-accent-soft transition hover:underline">
          {neu ? "Schliessen" : "+ Eigene Übung"}
        </button>
      </div>

      {neu && (
        <form action={(fd) => lauf(createExercise, fd)}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-sand/60 p-3">
          <div className="min-w-40 flex-1">
            <Label htmlFor="ex-name">Name</Label>
            <Input id="ex-name" name="name" required placeholder="z.B. Schrägbankdrücken" />
          </div>
          <div className="w-44">
            <Label htmlFor="ex-muscle">Muskelgruppe</Label>
            <Select id="ex-muscle" name="primary_muscle_id" required defaultValue="">
              <option value="" disabled>Wählen …</option>
              {muscleGroups.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Label htmlFor="ex-equip">Gerät</Label>
            <Input id="ex-equip" name="equipment_needed" placeholder="optional" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-soft">
            <input type="checkbox" name="is_cardio" className="h-4 w-4 accent-accent" />
            Cardio
          </label>
          <Button type="submit" disabled={busy}>Anlegen</Button>
          <p className="w-full text-xs text-ink-muted">
            Cardio-Übungen werden nach Dauer und Distanz erfasst, nicht nach Sätzen.
          </p>
        </form>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={`${exercises.length} Übungen — suchen …`} className="min-w-48 flex-1" />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44">
          <option value="">Alle Muskelgruppen</option>
          {muscleGroups.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </div>

      {sichtbar.length === 0 ? (
        <Empty>Keine Übung gefunden.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {sichtbar.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{e.name}</span>
                <span className="block text-xs text-ink-muted">
                  {e.is_cardio ? "Cardio · Dauer / Distanz" : e.muscleName}
                  {e.equipment_needed && ` · ${e.equipment_needed}`}
                </span>
              </span>
              {e.is_cardio && <Badge tone="warn">Cardio</Badge>}
              <button onClick={() => lauf(deleteExercise, formOf({ id: e.id }))}
                aria-label="Übung löschen"
                className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function formOf(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}
