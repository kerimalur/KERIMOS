import { createClient } from "@/lib/supabase/server";
import { applyShift, createShift, deleteShift } from "@/lib/actions";
import { Button, Card, CardTitle, Empty, Input, Label, Select } from "@/components/ui";
import { heuteISO } from "@/lib/time";
import type { Activity } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Shift {
  id: string;
  name: string;
  activity_id: string;
  blocks: { start: number; minutes: number }[];
  weg_minutes: number;
  weg_activity_id: string | null;
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function SchichtenPage() {
  const supabase = await createClient();
  const [{ data: shiftRows, error: shiftError }, { data: actRows }] = await Promise.all([
    supabase.from("shifts").select("*").order("name"),
    supabase.from("activities").select("*").eq("archived", false).order("name"),
  ]);

  const shifts = (shiftRows ?? []) as Shift[];
  const activities = (actRows ?? []) as Activity[];
  const byId = new Map(activities.map((a) => [a.id, a]));
  const arbeit = activities.filter((a) => a.bucket === "arbeit");
  const heute = heuteISO();

  if (shiftError) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-medium text-ink">Schichten</h1>
        <Card>
          <CardTitle>Tabelle fehlt noch</CardTitle>
          <p className="text-sm text-ink-muted">
            Die Tabelle <code className="rounded bg-sand px-1 py-0.5 text-xs">shifts</code>{" "}
            existiert noch nicht. Einmalig im Supabase SQL Editor (Projekt Kompass)
            das SQL aus der Einrichtung ausführen, dann diese Seite neu laden.
          </p>
          <p className="mt-1 break-words font-mono text-xs text-ink-muted">{shiftError.message}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Schichten</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Einmal definieren, dann pro Arbeitstag mit zwei Klicks eintragen — die Blöcke
          landen als normale Zeiteinträge im Kalender und bleiben dort änderbar,
          falls eine Schicht mal anders läuft.
        </p>
      </div>

      {/* Schicht eintragen */}
      <Card>
        <CardTitle>Schicht eintragen</CardTitle>
        {shifts.length === 0 ? (
          <p className="text-sm text-ink-muted">Zuerst unten eine Schicht anlegen.</p>
        ) : (
          <form action={applyShift} className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="entry_date">Tag</Label>
              <Input id="entry_date" name="entry_date" type="date" defaultValue={heute} required />
            </div>
            <div className="min-w-48">
              <Label htmlFor="shift_id">Schicht</Label>
              <Select id="shift_id" name="shift_id" required>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <Button type="submit">Eintragen</Button>
          </form>
        )}
      </Card>

      {/* Bestehende Schichten */}
      <Card>
        <CardTitle>Deine Schichten</CardTitle>
        {shifts.length === 0 ? (
          <Empty>Noch keine Schicht angelegt.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {shifts.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="text-sm font-medium text-ink">{s.name}</span>
                <span className="tabular text-xs text-ink-muted">
                  {s.blocks.map((b) => `${hhmm(b.start)}–${hhmm(b.start + b.minutes)}`).join(" · ")}
                </span>
                <span className="text-xs text-ink-muted">
                  → {byId.get(s.activity_id)?.name ?? "?"}
                </span>
                {s.weg_minutes > 0 && (
                  <span className="text-xs text-ink-faint">
                    + {s.weg_minutes} min Weg je Richtung
                  </span>
                )}
                <form action={deleteShift} className="ml-auto">
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-xs text-ink-faint transition hover:text-bad">✕</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Neue Schicht */}
      <Card>
        <CardTitle>Neue Schicht</CardTitle>
        <form action={createShift} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required
                placeholder="z.B. Abenddienst / Zimmerstunde" />
            </div>
            <div>
              <Label htmlFor="activity_id">Zählt als Aktivität</Label>
              <Select id="activity_id" name="activity_id" required
                defaultValue={arbeit[0]?.id ?? ""}>
                {(arbeit.length > 0 ? arbeit : activities).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Block 1</Label>
              <div className="flex items-center gap-2">
                <Input name="von1" type="time" required aria-label="Block 1 von" />
                <span className="text-xs text-ink-muted">bis</span>
                <Input name="bis1" type="time" required aria-label="Block 1 bis" />
              </div>
            </div>
            <div>
              <Label>Block 2 — leer lassen ohne Zimmerstunde</Label>
              <div className="flex items-center gap-2">
                <Input name="von2" type="time" aria-label="Block 2 von" />
                <span className="text-xs text-ink-muted">bis</span>
                <Input name="bis2" type="time" aria-label="Block 2 bis" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="weg_minutes">Arbeitsweg in Minuten (je Richtung, optional)</Label>
              <Input id="weg_minutes" name="weg_minutes" type="number" min={0} max={180}
                placeholder="0" />
            </div>
            <div>
              <Label htmlFor="weg_activity_id">Weg zählt als</Label>
              <Select id="weg_activity_id" name="weg_activity_id" defaultValue="">
                <option value="">— kein Wegeintrag —</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <Button type="submit">Schicht anlegen</Button>
        </form>
      </Card>
    </div>
  );
}
