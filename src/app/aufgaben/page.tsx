import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clearDoneTasks, createTask, seedLifeAreas } from "@/lib/actions";
import { TaskList } from "@/components/task-list";
import { LifeAreas } from "@/components/life-areas";
import { Button, Card, CardTitle, Input, Label, Select, Stat } from "@/components/ui";
import { buildTasks, sortOpen } from "@/lib/tasks";
import { heuteISO } from "@/lib/time";
import type { LifeArea, Subtask, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AufgabenPage({
  searchParams,
}: {
  searchParams: Promise<{ bereich?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const heute = heuteISO();

  const [{ data: taskRows, error }, { data: areaRows }, { data: subRows }] =
    await Promise.all([
      supabase.from("tasks").select("*").order("created_at"),
      supabase.from("life_areas").select("*").order("sort_order"),
      supabase.from("subtasks").select("*"),
    ]);

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-medium text-ink">Aufgaben</h1>
        <Card>
          <CardTitle>Tabelle fehlt noch</CardTitle>
          <p className="text-sm text-ink-muted">
            Einmalig <code className="rounded bg-sand px-1 py-0.5 text-xs">
            supabase/migrations/10_tasks.sql</code> im SQL-Editor des Projekts
            Kompass ausführen, dann diese Seite neu laden.
          </p>
          <p className="mt-1 break-words font-mono text-xs text-ink-muted">{error.message}</p>
        </Card>
      </div>
    );
  }

  const areas = (areaRows ?? []) as LifeArea[];
  const aktiveAreas = areas.filter((a) => !a.archived);
  const alle = buildTasks(
    (taskRows ?? []) as Task[], (subRows ?? []) as Subtask[], areas
  );

  // Filter über die Adresszeile - so bleibt der Blick auf einen Bereich
  // teilbar und übersteht ein Neuladen.
  const filter = sp.bereich ?? "";
  const gefiltert = filter ? alle.filter((t) => t.life_area_id === filter) : alle;

  const offen = sortOpen(gefiltert.filter((t) => t.done_at === null));
  const fertig = gefiltert
    .filter((t) => t.done_at !== null)
    .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  const ueberfaellig = offen.filter((t) => t.due_on !== null && t.due_on < heute).length;
  const heuteFaellig = offen.filter((t) => t.due_on === heute).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Aufgaben</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Was ansteht, mit Deadline und Lebensbereich. Die offenen Aufgaben
          stehen auch auf der Startseite und im Handy-Einstieg — dort reicht
          das Plus zum Notieren, hier gibt es Details und Unteraufgaben.
        </p>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Offen" value={String(offen.length)} />
          <Stat label="Heute fällig" value={String(heuteFaellig)}
            tone={heuteFaellig > 0 ? "warn" : "neutral"} />
          <Stat label="Überfällig" value={String(ueberfaellig)}
            tone={ueberfaellig > 0 ? "bad" : "good"} />
        </div>
      </Card>

      <Card>
        <CardTitle>Neue Aufgabe</CardTitle>
        <form action={createTask} className="space-y-3">
          <div>
            <Label htmlFor="title">Was ist zu tun</Label>
            <Input id="title" name="title" required placeholder="z.B. Steuererklärung ausfüllen" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="due_on">Deadline — leer heisst irgendwann</Label>
              <Input id="due_on" name="due_on" type="date" />
            </div>
            <div>
              <Label htmlFor="life_area_id">Lebensbereich</Label>
              <Select id="life_area_id" name="life_area_id" defaultValue={filter}>
                <option value="">— ohne —</option>
                {aktiveAreas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="details">Details</Label>
            <textarea id="details" name="details" rows={2}
              placeholder="optional — was gehört dazu, worauf achten?"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink
                         placeholder:text-ink-faint outline-none transition
                         hover:border-line-strong focus:border-accent focus:ring-2
                         focus:ring-accent/15" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" name="priority"
                className="h-4 w-4 rounded border-line accent-accent" />
              Wichtig
            </label>
            <Button type="submit">Aufgabe anlegen</Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-ink-muted">
          Unteraufgaben kommen dazu, sobald die Aufgabe steht — unten
          antippen und aufklappen.
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="mb-0">Offen</CardTitle>
          {aktiveAreas.length > 0 && (
            <nav className="flex flex-wrap gap-1">
              <FilterLink href="/aufgaben" aktiv={filter === ""}>Alle</FilterLink>
              {aktiveAreas.map((a) => (
                <FilterLink key={a.id} href={`/aufgaben?bereich=${a.id}`}
                  aktiv={filter === a.id} farbe={a.color}>
                  {a.name}
                </FilterLink>
              ))}
            </nav>
          )}
        </div>
        <TaskList tasks={offen} areas={aktiveAreas} heute={heute} />
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <CardTitle className="mb-0">Erledigt</CardTitle>
          {fertig.length > 0 && (
            <form action={clearDoneTasks}>
              <button className="text-xs text-ink-faint transition hover:text-bad">
                Alle erledigten löschen
              </button>
            </form>
          )}
        </div>
        <TaskList tasks={fertig.slice(0, 30)} areas={aktiveAreas} heute={heute} erledigt />
      </Card>

      <Card>
        <CardTitle>Lebensbereiche</CardTitle>
        {areas.length === 0 ? (
          <div>
            <p className="mb-3 text-sm text-ink-muted">
              Noch keine Bereiche. KerimOS legt dir dieselben sieben an, die auch
              die Zeiterfassung kennt — Ziele, Arbeit, Pflicht, Regeneration,
              Soziales, Spass, Leerlauf. Eigene kommen danach einfach dazu.
            </p>
            <form action={seedLifeAreas}>
              <Button type="submit">Bereiche anlegen</Button>
            </form>
          </div>
        ) : (
          <>
            <LifeAreas areas={areas} />
            <p className="mt-3 text-xs text-ink-muted">
              Bereich anklicken zum Umbenennen. Die mit dem Vermerk „Zeit“
              entsprechen einem Bucket der Zeiterfassung — eigene Bereiche
              gelten nur für Aufgaben.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

/** Filterknopf über der offenen Liste. */
function FilterLink({
  href, aktiv, farbe, children,
}: {
  href: string;
  aktiv: boolean;
  farbe?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href}
      className={
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition " +
        (aktiv ? "bg-sand text-ink" : "text-ink-muted hover:bg-sand/60 hover:text-ink-soft")
      }>
      {farbe && <span className="h-2 w-2 rounded-full" style={{ background: farbe }} />}
      {children}
    </Link>
  );
}
