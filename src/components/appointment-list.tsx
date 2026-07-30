"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAppointment, deleteAppointment } from "@/lib/actions";
import { Button, Empty, Input, Label, cx } from "@/components/ui";
import { dateLabel } from "@/lib/format";

export interface Appointment {
  id: string;
  title: string;
  starts_on: string;
  start_minute: number | null;
  end_minute: number | null;
  location: string | null;
  note: string | null;
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "09:00–11:30" · "09:00" · "ganztägig" */
function zeitText(a: Appointment): string {
  if (a.start_minute === null) return "ganztägig";
  return a.end_minute === null
    ? hhmm(a.start_minute)
    : `${hhmm(a.start_minute)}–${hhmm(a.end_minute)}`;
}

/**
 * Terminliste mit Bearbeiten-Möglichkeit: ein Klick auf den Termin klappt das
 * Formular auf. Gedacht für den häufigsten Fall - falsches Datum getippt.
 */
export function AppointmentList({
  termine, heute, vergangen = false,
}: {
  termine: Appointment[];
  heute: string;
  /** Vergangene Termine werden gedämpft dargestellt. */
  vergangen?: boolean;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (termine.length === 0) return <Empty>Nichts geplant.</Empty>;

  async function lauf(action: (fd: FormData) => Promise<void>, fd: FormData) {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      await action(fd);
      setOffen(null);
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
      {termine.map((a) => {
        const auf = offen === a.id;
        return (
          <li key={a.id} className="py-2.5">
            <div className={cx("flex flex-wrap items-baseline gap-x-3 gap-y-1",
              vergangen && "text-ink-faint")}>
              <button onClick={() => setOffen(auf ? null : a.id)}
                className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
                <span className={cx("w-28 shrink-0 text-xs",
                  vergangen ? "" : "text-ink-muted")}>
                  {!vergangen && a.starts_on === heute ? "heute" : dateLabel(a.starts_on)}
                </span>
                <span className={cx("tabular w-24 shrink-0 text-xs",
                  vergangen ? "" : "text-ink-soft")}>
                  {zeitText(a)}
                </span>
                <span className={cx("text-sm", vergangen ? "" : "text-ink")}>{a.title}</span>
                {a.location && (
                  <span className={cx("text-xs", vergangen ? "" : "text-ink-muted")}>
                    · {a.location}
                  </span>
                )}
                {a.note && (
                  <span className={cx("text-xs", vergangen ? "" : "text-ink-faint")}>
                    · {a.note}
                  </span>
                )}
              </button>
              <button onClick={() => lauf(deleteAppointment, formOf({ id: a.id }))}
                aria-label="Termin löschen"
                className="ml-auto shrink-0 px-1 text-xs text-ink-faint transition hover:text-bad">
                ✕
              </button>
            </div>

            {auf && (
              <form action={(fd) => lauf(updateAppointment, fd)}
                className="mt-3 space-y-3 rounded-xl bg-sand/50 p-3">
                <input type="hidden" name="id" value={a.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Was</Label>
                    <Input name="title" defaultValue={a.title} required />
                  </div>
                  <div>
                    <Label>Wann</Label>
                    <Input name="starts_on" type="date" defaultValue={a.starts_on} required />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Von — leer heisst ganztägig</Label>
                    <Input name="start" type="time"
                      defaultValue={a.start_minute === null ? "" : hhmm(a.start_minute)} />
                  </div>
                  <div>
                    <Label>Bis</Label>
                    <Input name="end" type="time"
                      defaultValue={a.end_minute === null ? "" : hhmm(a.end_minute)} />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input name="location" defaultValue={a.location ?? ""} placeholder="optional" />
                  </div>
                </div>
                <div>
                  <Label>Notiz</Label>
                  <Input name="note" defaultValue={a.note ?? ""} placeholder="optional" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy}>Speichern</Button>
                  <Button type="button" variant="ghost" onClick={() => setOffen(null)}>
                    Abbrechen
                  </Button>
                </div>
              </form>
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
