import { createClient } from "@/lib/supabase/server";
import { createAppointment, deleteAppointment } from "@/lib/actions";
import { Button, Card, CardTitle, Empty, Input, Label } from "@/components/ui";
import { heuteISO, addDays } from "@/lib/time";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export interface Appointment {
  id: string;
  title: string;
  starts_on: string;
  start_minute: number | null;
  end_minute: number | null;
  location: string | null;
  note: string | null;
}

export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "09:00–11:30" · "09:00" · "ganztägig" */
export function zeitText(a: Appointment): string {
  if (a.start_minute === null) return "ganztägig";
  return a.end_minute === null
    ? hhmm(a.start_minute)
    : `${hhmm(a.start_minute)}–${hhmm(a.end_minute)}`;
}

export default async function TerminePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments")
    .select("*").gte("starts_on", addDays(heuteISO(), -30))
    .order("starts_on").order("start_minute", { nullsFirst: true });

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-medium text-ink">Termine</h1>
        <Card>
          <CardTitle>Tabelle fehlt noch</CardTitle>
          <p className="text-sm text-ink-muted">
            Einmalig <code className="rounded bg-sand px-1 py-0.5 text-xs">
            supabase/migrations/07_appointments.sql</code> im SQL-Editor des
            Projekts Kompass ausführen, dann diese Seite neu laden.
          </p>
          <p className="mt-1 break-words font-mono text-xs text-ink-muted">{error.message}</p>
        </Card>
      </div>
    );
  }

  const alle = (data ?? []) as Appointment[];
  const heute = heuteISO();
  const kommend = alle.filter((a) => a.starts_on >= heute);
  const vergangen = alle.filter((a) => a.starts_on < heute).reverse();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Termine</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Hier eintragen, unterwegs sehen: die anstehenden Termine stehen auf der
          Startseite und im Handy-Einstieg.
        </p>
      </div>

      <Card>
        <CardTitle>Neuer Termin</CardTitle>
        <form action={createAppointment} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="title">Was</Label>
              <Input id="title" name="title" required placeholder="z.B. Zahnarzt" />
            </div>
            <div>
              <Label htmlFor="starts_on">Wann</Label>
              <Input id="starts_on" name="starts_on" type="date"
                defaultValue={heute} required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="start">Von — leer heisst ganztägig</Label>
              <Input id="start" name="start" type="time" />
            </div>
            <div>
              <Label htmlFor="end">Bis</Label>
              <Input id="end" name="end" type="time" />
            </div>
            <div>
              <Label htmlFor="location">Ort</Label>
              <Input id="location" name="location" placeholder="optional" />
            </div>
          </div>
          <div>
            <Label htmlFor="note">Notiz</Label>
            <Input id="note" name="note" placeholder="optional" />
          </div>
          <Button type="submit">Termin anlegen</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Anstehend</CardTitle>
        {kommend.length === 0 ? (
          <Empty>Nichts geplant.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {kommend.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span className="w-28 shrink-0 text-xs text-ink-muted">
                  {a.starts_on === heute ? "heute" : dateLabel(a.starts_on)}
                </span>
                <span className="tabular w-24 shrink-0 text-xs text-ink-soft">
                  {zeitText(a)}
                </span>
                <span className="text-sm text-ink">{a.title}</span>
                {a.location && (
                  <span className="text-xs text-ink-muted">· {a.location}</span>
                )}
                {a.note && <span className="text-xs text-ink-faint">· {a.note}</span>}
                <form action={deleteAppointment} className="ml-auto">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs text-ink-faint transition hover:text-bad">✕</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {vergangen.length > 0 && (
        <Card>
          <CardTitle>Vorbei</CardTitle>
          <ul className="divide-y divide-line">
            {vergangen.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 py-2 text-ink-faint">
                <span className="w-28 shrink-0 text-xs">{dateLabel(a.starts_on)}</span>
                <span className="tabular w-24 shrink-0 text-xs">{zeitText(a)}</span>
                <span className="text-sm">{a.title}</span>
                <form action={deleteAppointment} className="ml-auto">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs transition hover:text-bad">✕</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
