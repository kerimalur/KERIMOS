import { createClient } from "@/lib/supabase/server";
import { createAppointment } from "@/lib/actions";
import { AppointmentList, type Appointment } from "@/components/appointment-list";
import { Button, Card, CardTitle, Input, Label } from "@/components/ui";
import { heuteISO, addDays } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TerminePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments")
    .select("*").gte("starts_on", addDays(heuteISO(), -30))
    .order("starts_on").order("start_minute", { nullsFirst: true });

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-xl font-bold text-ink">Termine</h1>
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
        <h1 className="font-display text-xl font-bold text-ink">Termine</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Hier eintragen, unterwegs sehen: die anstehenden Termine stehen auf der
          Startseite und im Handy-Einstieg. Zum Ändern den Termin antippen.
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

          {/* Steuert, ab wann der Termin auf der Startseite auftaucht.
              Leer = zwei Tage vorher. Wer etwas vorbereiten muss, setzt
              hier den Tag, an dem die Vorbereitung beginnt. */}
          <div className="rounded-xl bg-sand/60 p-3">
            <Label htmlFor="show_from">
              Muss ich etwas vorbereiten? Dann ab wann erinnern
            </Label>
            <Input id="show_from" name="show_from" type="date" />
            <p className="mt-1 text-xs text-ink-muted">
              Leer lassen, wenn nichts vorzubereiten ist — dann erscheint der
              Termin zwei Tage vorher auf der Startseite.
            </p>
          </div>

          <Button type="submit">Termin anlegen</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Anstehend</CardTitle>
        <AppointmentList termine={kommend} heute={heute} />
      </Card>

      {vergangen.length > 0 && (
        <Card>
          <CardTitle>Vorbei</CardTitle>
          <AppointmentList termine={vergangen} heute={heute} vergangen />
        </Card>
      )}
    </div>
  );
}
