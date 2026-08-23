import { createClient } from "@/lib/supabase/server";
import { toggleTask, deleteTask } from "@/lib/actions";
import { AppointmentList, type Appointment } from "@/components/appointment-list";
import { TerminAufgabeForm } from "@/components/termin-aufgabe-form";
import { Card, CardTitle, Badge, Empty, cx } from "@/components/ui";
import { heuteISO, addDays } from "@/lib/time";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Termine und Aufgaben — eine Seite, zwei Arten.
 *
 * Vorher standen Aufgaben unter `/aufgaben` und Termine hier; die
 * Aufgaben-Seite ist beim Zuschnitt vom 21.08. weggefallen, die Tabelle blieb
 * und wurde nur noch im Wochenrückblick gelesen. Aufschreiben ging damit
 * nirgends mehr.
 *
 * Beides gehört zusammen, weil man es im selben Moment notiert: „Dienstag
 * Zahnarzt" und „vorher Rezept holen" schreibt niemand auf zwei Seiten. Getrennt
 * bleiben nur die Listen darunter — ein Termin wird wahrgenommen, eine Aufgabe
 * abgehakt, und das sind zwei verschiedene Bewegungen.
 */

interface Aufgabe {
  id: string;
  title: string;
  details: string | null;
  due_on: string | null;
  priority: number;
  done_at: string | null;
}

export default async function TerminePage() {
  const supabase = await createClient();
  const heute = heuteISO();

  const [{ data: terminRows, error }, { data: aufgabenRows }] = await Promise.all([
    supabase.from("appointments").select("*")
      .gte("starts_on", addDays(heute, -30))
      .order("starts_on").order("start_minute", { nullsFirst: true }),
    supabase.from("tasks")
      .select("id, title, details, due_on, priority, done_at")
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: false })
      .limit(200),
  ]);

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-xl font-bold text-ink">Termine und Aufgaben</h1>
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

  const alle = (terminRows ?? []) as Appointment[];
  const kommend = alle.filter((a) => a.starts_on >= heute);
  const vergangen = alle.filter((a) => a.starts_on < heute).reverse();

  const aufgaben = (aufgabenRows ?? []) as Aufgabe[];
  const offen = aufgaben.filter((a) => !a.done_at);
  // Erledigtes bleibt sichtbar, aber nur das von heute: es soll den Haken
  // rückgängig machen können, ohne die Liste mit Wochen alter Arbeit zu füllen.
  const heuteErledigt = aufgaben.filter(
    (a) => a.done_at && a.done_at.slice(0, 10) === heute);

  const ueberfaellig = offen.filter((a) => a.due_on && a.due_on < heute).length;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-bold text-ink">Termine und Aufgaben</h1>
          {ueberfaellig > 0 && <Badge tone="bad">{ueberfaellig} überfällig</Badge>}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Hier eintragen, unterwegs sehen. Termine stehen zwei Tage vorher auf
          der Startseite; Aufgaben bleiben, bis du sie abhakst.
        </p>
      </div>

      <Card>
        <CardTitle>Neu</CardTitle>
        <TerminAufgabeForm heute={heute} />
      </Card>

      <Card>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Offene Aufgaben</CardTitle>
          <span className="text-[11px] text-ink-faint">{offen.length}</span>
        </div>
        {offen.length === 0 ? (
          <Empty>Nichts offen. Selten, geniess es.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {offen.map((a) => (
              <AufgabenZeile key={a.id} a={a} heute={heute} />
            ))}
          </ul>
        )}

        {heuteErledigt.length > 0 && (
          <>
            <div className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              Heute abgehakt
            </div>
            <ul className="space-y-1.5">
              {heuteErledigt.map((a) => (
                <AufgabenZeile key={a.id} a={a} heute={heute} />
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <CardTitle>Anstehende Termine</CardTitle>
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

function AufgabenZeile({ a, heute }: { a: Aufgabe; heute: string }) {
  const erledigt = !!a.done_at;
  const spaet = !erledigt && !!a.due_on && a.due_on < heute;
  const heuteFaellig = !erledigt && a.due_on === heute;

  return (
    <li className={cx("flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm",
      spaet ? "bg-bad-tint" : heuteFaellig ? "bg-warn-tint" : "bg-sand/60")}>
      {/* Der Haken ist ein Formular und kein Kästchen mit JavaScript: die Seite
          soll auch dann funktionieren, wenn sonst nichts geladen hat. */}
      <form action={toggleTask}>
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="done" value={erledigt ? "" : "1"} />
        <button aria-label={erledigt ? "wieder öffnen" : "abhaken"}
          className={cx(
            "flex h-5 w-5 items-center justify-center rounded-md border text-[11px] transition",
            erledigt
              ? "border-good bg-good-tint text-good-bright"
              : "border-line text-transparent hover:border-line-strong hover:text-ink-faint")}>
          ✓
        </button>
      </form>

      <span className={cx(erledigt ? "text-ink-faint line-through" : "text-ink")}>
        {a.title}
      </span>
      {a.priority > 0 && !erledigt && <Badge tone="warn">wichtig</Badge>}
      {a.due_on && (
        <span className={cx("text-xs",
          spaet ? "text-bad-bright" : heuteFaellig ? "text-accent" : "text-ink-muted")}>
          {spaet ? "überfällig seit " : ""}{dateLabel(a.due_on)}
        </span>
      )}
      {a.details && <span className="truncate text-xs text-ink-muted">{a.details}</span>}

      <form action={deleteTask} className="ml-auto">
        <input type="hidden" name="id" value={a.id} />
        <button className="text-xs text-ink-faint transition hover:text-bad">
          entfernen
        </button>
      </form>
    </li>
  );
}
