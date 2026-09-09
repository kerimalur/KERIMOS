import Link from "next/link";
import { ladePlanung, baueKalender, PLANUNG_SQL } from "@/lib/planung";
import {
  projektAnlegen, projektUmbenennen, projektLoeschen, aufgabeAnlegen,
} from "@/lib/planung-actions";
import { PlanungAufgaben } from "@/components/planung-aufgaben";
import { PlanungKalender } from "@/components/planung-kalender";
import {
  Button, Card, CardTitle, Empty, Input, Label, Select,
} from "@/components/ui";
import { heuteISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Planung — Projekte, Aufgaben, Kalender.
 *
 * Die Reihenfolge auf der Seite bildet ab, wie man sie benutzt: zuerst die
 * Aufgaben (das Einzige, was täglich angefasst wird), daneben der Kalender
 * (wann), darunter die Projekte (wozu). Die Projekte stehen absichtlich
 * unten — sie ändern sich alle paar Wochen, die Aufgaben stündlich.
 */
export default async function PlanungPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const { monat } = await searchParams;
  const { projekte, aufgaben, tabelleFehlt } = await ladePlanung();
  const heute = heuteISO();
  const kalender = baueKalender(aufgaben, monat, heute);

  if (tabelleFehlt) {
    return (
      <div className="py-6">
        <Kopf />
        <Card>
          <CardTitle>Tabellen fehlen noch</CardTitle>
          <p className="text-sm text-ink-muted">
            Führe <code className="rounded bg-sand px-1 py-0.5 text-xs">
              supabase/migrations/21_planung.sql
            </code> im SQL-Editor aus, dann läuft die Seite. Zum Kopieren:
          </p>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-sand p-4 text-xs
                          leading-relaxed text-ink-soft">
            {PLANUNG_SQL}
          </pre>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-6">
      <Kopf />

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          <PlanungAufgaben aufgaben={aufgaben} projekte={projekte} />

          <Card>
            <CardTitle>Neue Aufgabe</CardTitle>
            <form action={aufgabeAnlegen} className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 basis-48">
                <Label htmlFor="task-name">Was</Label>
                <Input id="task-name" name="name" required
                  placeholder="Steuererklärung anfangen" className="w-full" />
              </div>
              <div>
                <Label htmlFor="task-datum">Wann</Label>
                <Input id="task-datum" name="due_date" type="date" className="w-40" />
              </div>
              <div>
                <Label htmlFor="task-projekt">Projekt</Label>
                <Select id="task-projekt" name="project_id" defaultValue="" className="w-40">
                  <option value="">ohne Projekt</option>
                  {projekte.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <Button type="submit">Anlegen</Button>
            </form>
            <p className="mt-2 text-[11px] text-ink-faint">
              Datum und Projekt sind beide freiwillig. Ohne Datum steht die
              Aufgabe in der Ablage unter dem Kalender und lässt sich von dort
              auf einen Tag ziehen.
            </p>
          </Card>
        </div>

        <PlanungKalender monat={kalender.monat} tage={kalender.tage}
          aufgaben={aufgaben} />
      </div>

      {/* ------------------------------------------------------- Projekte */}
      <div className="mt-7">
        <div className="mb-3 text-[11px] font-medium uppercase
                        tracking-[0.12em] text-ink-muted">
          Projekte
        </div>

        {projekte.length === 0 ? (
          <Empty>
            Noch kein Projekt. Aufgaben gehen auch ohne — ein Projekt lohnt
            sich erst, wenn mehrere zusammengehören.
          </Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projekte.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: p.farbe }} />
                    <span className="truncate font-display text-base font-bold text-ink">
                      {p.name}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-ink-muted">
                    {p.offen > 0 ? `${p.offen} offen` : p.gesamt > 0 ? "fertig" : "leer"}
                  </span>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-ink-faint
                                      transition hover:text-ink-muted">
                    ändern
                  </summary>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <form action={projektUmbenennen}
                      className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <Input name="name" defaultValue={p.name} required
                        aria-label="Name" className="w-36 py-1 text-xs" />
                      <Input name="color" type="color" defaultValue={p.farbe}
                        aria-label="Farbe" className="h-8 w-12 p-1" />
                      <Button type="submit" variant="ghost"
                        className="px-2.5 py-1 text-xs">
                        Speichern
                      </Button>
                    </form>
                    <form action={projektLoeschen}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" variant="danger"
                        className="px-2.5 py-1 text-xs">
                        Löschen
                      </Button>
                    </form>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    Löschen entfernt nur das Projekt. Die {p.gesamt} zugehörigen
                    Aufgaben bleiben stehen und stehen danach ohne Projekt da.
                  </p>
                </details>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-3">
          <CardTitle>Neues Projekt</CardTitle>
          <form action={projektAnlegen} className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="projekt-name">Name</Label>
              <Input id="projekt-name" name="name" required
                placeholder="Wohnungssuche" className="w-52" />
            </div>
            <div>
              <Label htmlFor="projekt-farbe">Farbe</Label>
              <Input id="projekt-farbe" name="color" type="color"
                defaultValue="#9A8C74" className="h-9 w-14 p-1" />
            </div>
            <Button type="submit">Anlegen</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Kopf() {
  return (
    <div className="mb-5">
      <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
        ← Startseite
      </Link>
      <h1 className="font-display mt-1 text-2xl font-bold leading-tight text-ink">
        Planung
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Aufgaben, ihre Termine und die Projekte dahinter. Eine Aufgabe braucht
        nur einen Namen — Datum und Projekt kommen dazu, wenn sie etwas
        klären, und nicht vorher.
      </p>
    </div>
  );
}
