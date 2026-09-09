import {
  aufgabeAbhaken, aufgabeAendern, aufgabeLoeschen, erledigteAufraeumen,
} from "@/lib/planung-actions";
import type { Aufgabe, Projekt } from "@/lib/planung";
import { Button, Card, CardTitle, Empty, Input, Select, cx } from "@/components/ui";
import { dateLabel } from "@/lib/format";

/**
 * Die Aufgabenliste — offene oben, erledigte zugeklappt darunter.
 *
 * Der Haken ist ein eigenes Formular je Zeile und schickt sofort. Ein
 * zusätzlicher Speichern-Knopf wäre ein zweiter Schritt für eine Handlung,
 * die aus einem einzigen besteht — und genau der Grund, warum Listen mit
 * Speichern-Knopf nicht gepflegt werden.
 *
 * Die erledigten stehen in einem `<details>`: das klappt ohne eine Zeile
 * JavaScript zu und merkt sich nichts — beim nächsten Aufruf ist es wieder
 * zu, was hier die richtige Vorgabe ist. Man will sehen, was offen ist.
 */
export function PlanungAufgaben({
  aufgaben, projekte,
}: {
  aufgaben: Aufgabe[];
  projekte: Projekt[];
}) {
  const offen = aufgaben.filter((a) => !a.erledigt);
  const erledigt = aufgaben.filter((a) => a.erledigt);

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Aufgaben</CardTitle>
        <span className="text-xs text-ink-faint">
          {offen.length} offen
          {erledigt.length > 0 && ` · ${erledigt.length} erledigt`}
        </span>
      </div>

      {offen.length === 0 ? (
        <Empty>Nichts offen. Trag unten etwas ein, wenn es so weit ist.</Empty>
      ) : (
        <ul className="space-y-0.5">
          {offen.map((a) => (
            <AufgabenZeile key={a.id} a={a} projekte={projekte} />
          ))}
        </ul>
      )}

      {erledigt.length > 0 && (
        <details className="mt-4 border-t border-line/50 pt-3">
          <summary className="cursor-pointer text-xs text-ink-muted
                              transition hover:text-ink-soft">
            {erledigt.length} erledigt
          </summary>
          <ul className="mt-2 space-y-0.5">
            {erledigt.map((a) => (
              <AufgabenZeile key={a.id} a={a} projekte={projekte} />
            ))}
          </ul>
          <form action={erledigteAufraeumen} className="mt-3">
            <Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs">
              Erledigte endgültig löschen
            </Button>
          </form>
        </details>
      )}
    </Card>
  );
}

/** Farbe und Wort für „wie dringend". Nur drei Fälle, mehr liest niemand. */
const DRINGEND: Record<string, { klasse: string; text: string } | null> = {
  ueberfaellig: { klasse: "text-bad-bright", text: "überfällig" },
  heute: { klasse: "text-accent-soft", text: "heute" },
  spaeter: null,
  ohne: null,
};

function AufgabenZeile({ a, projekte }: { a: Aufgabe; projekte: Projekt[] }) {
  const hinweis = DRINGEND[a.dringend];

  return (
    <li className="group flex flex-wrap items-center gap-2 rounded-lg px-1.5 py-1
                   transition hover:bg-sand/50">
      {/* Der Haken. Eigenes Formular, damit der Klick genau diese Zeile
          schickt und sonst nichts. */}
      <form action={aufgabeAbhaken} className="shrink-0">
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="done" value={a.erledigt ? "0" : "1"} />
        <button type="submit" aria-label={a.erledigt ? "wieder öffnen" : "erledigt"}
          className={cx(
            "grid h-[20px] w-[20px] place-items-center rounded-md border text-[11px]",
            "transition duration-150 ease-tactile active:scale-90",
            a.erledigt
              ? "border-good/50 bg-good-tint text-good-bright"
              : "border-line-strong text-transparent hover:border-accent")}>
          ✓
        </button>
      </form>

      <span className={cx("min-w-0 flex-1 truncate text-sm",
        a.erledigt ? "text-ink-faint line-through" : "text-ink")}>
        {a.name}
      </span>

      {a.projektName && (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-muted">
          <span className="h-2 w-2 rounded-full"
            style={{ background: a.projektFarbe ?? "#9A8C74" }} />
          {a.projektName}
        </span>
      )}

      {a.faellig && (
        <span className={cx("tabular shrink-0 text-[11px]",
          hinweis?.klasse ?? "text-ink-faint")}>
          {hinweis?.text ?? dateLabel(a.faellig)}
        </span>
      )}

      {/* Ändern und Löschen erscheinen erst beim Darüberfahren: sie sind
          nicht der Grund, warum man die Liste anschaut. */}
      <details className="shrink-0">
        <summary className="cursor-pointer list-none px-1 text-xs text-ink-faint
                            opacity-0 transition hover:text-ink-soft
                            group-hover:opacity-100">
          ⋯
        </summary>
        <div className="mt-1.5 flex flex-wrap items-end gap-2 rounded-xl border
                        border-line/70 bg-sand/40 p-2">
          <form action={aufgabeAendern} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={a.id} />
            <Input name="name" defaultValue={a.name} required
              aria-label="Name" className="w-44 py-1 text-xs" />
            <Input name="due_date" type="date" defaultValue={a.faellig ?? ""}
              aria-label="Datum" className="w-36 py-1 text-xs" />
            <Select name="project_id" defaultValue={a.projektId ?? ""}
              aria-label="Projekt" className="w-36 py-1 text-xs">
              <option value="">ohne Projekt</option>
              {projekte.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs">
              Speichern
            </Button>
          </form>
          <form action={aufgabeLoeschen}>
            <input type="hidden" name="id" value={a.id} />
            <Button type="submit" variant="danger" className="px-2.5 py-1 text-xs">
              Löschen
            </Button>
          </form>
        </div>
      </details>
    </li>
  );
}
