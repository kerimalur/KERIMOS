"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { planTraining, deleteCalendarEntry, startWorkout } from "@/lib/actions";
import { Badge, Button, Card, CardTitle, Empty, Input, Label, Select } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { dayNameShort } from "@/lib/time";

interface TrainingDayLite { id: string; name: string; anzahlUebungen: number }
interface Entry {
  id: string; training_day_id: string; trainingDayName: string;
  scheduled_date: string; status: string; offeneSessionId: string | null;
}

/**
 * Trainingsplanung: welcher Trainingstag an welchem Datum. Der Start-Knopf
 * legt die Einheit an und wechselt in die Gym-App - dort wird trainiert.
 */
export function GymPlanner({
  entries, days, heute, gymAppUrl,
}: {
  entries: Entry[];
  days: TrainingDayLite[];
  heute: string;
  gymAppUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const kommend = entries.filter((e) => e.scheduled_date >= heute && e.status === "planned");
  const vergangen = entries
    .filter((e) => e.scheduled_date < heute || e.status !== "planned")
    .reverse();

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

  async function starten(entry: Entry) {
    if (busy) return;
    // Läuft schon eine Einheit, direkt dorthin - ohne eine zweite anzulegen
    if (entry.offeneSessionId) {
      window.location.href = `${gymAppUrl}/workout/${entry.offeneSessionId}`;
      return;
    }
    setBusy(true);
    setFehler(null);
    try {
      const fd = new FormData();
      fd.set("training_day_id", entry.training_day_id);
      fd.set("calendar_entry_id", entry.id);
      fd.set("date", entry.scheduled_date);
      const url = await startWorkout(fd);
      window.location.href = url;
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Training konnte nicht gestartet werden");
      setBusy(false);
    }
  }

  /** "heute" · "morgen" · "Do, 06.08.2026" */
  function datumText(iso: string): string {
    if (iso === heute) return "heute";
    return `${dayNameShort(iso)}, ${dateLabel(iso)}`;
  }

  return (
    <>
      {fehler && (
        <div className="rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
        </div>
      )}

      <Card>
        <CardTitle>Training einplanen</CardTitle>
        {days.length === 0 ? (
          <Empty>
            Erst braucht es einen Trainingstag — unter „Tage“ anlegen, dann
            lässt er sich hier auf ein Datum legen.
          </Empty>
        ) : (
          <form action={(fd) => lauf(planTraining, fd)}
            className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Label htmlFor="pl-day">Trainingstag</Label>
              <Select id="pl-day" name="training_day_id" required defaultValue="">
                <option value="" disabled>Wählen …</option>
                {days.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.anzahlUebungen} Übungen)
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Label htmlFor="pl-date">Datum</Label>
              <Input id="pl-date" name="scheduled_date" type="date"
                defaultValue={heute} required />
            </div>
            <Button type="submit" disabled={busy}>Einplanen</Button>
          </form>
        )}
      </Card>

      <Card>
        <CardTitle>Anstehend</CardTitle>
        {kommend.length === 0 ? (
          <Empty>Nichts geplant.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {kommend.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="w-32 shrink-0 text-xs text-ink-muted">
                  {datumText(e.scheduled_date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {e.trainingDayName}
                </span>
                {e.offeneSessionId && <Badge tone="warn">läuft</Badge>}
                <Button onClick={() => starten(e)} disabled={busy}
                  className="shrink-0 px-3 py-1.5 text-xs">
                  {e.offeneSessionId ? "Fortsetzen" : "Start"}
                </Button>
                <button onClick={() => lauf(deleteCalendarEntry, formOf({ id: e.id }))}
                  aria-label="Planung löschen"
                  className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {vergangen.length > 0 && (
        <Card>
          <CardTitle>Vorbei</CardTitle>
          <ul className="divide-y divide-line">
            {vergangen.slice(0, 20).map((e) => (
              <li key={e.id}
                className="flex flex-wrap items-center gap-2 py-2 text-ink-faint">
                <span className="w-32 shrink-0 text-xs">{dateLabel(e.scheduled_date)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{e.trainingDayName}</span>
                {e.status === "completed" && <Badge tone="good">erledigt</Badge>}
                {e.status === "skipped" && <Badge>ausgelassen</Badge>}
                <button onClick={() => lauf(deleteCalendarEntry, formOf({ id: e.id }))}
                  aria-label="Eintrag löschen"
                  className="shrink-0 px-1 text-sm transition hover:text-bad">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function formOf(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}
