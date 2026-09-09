import Link from "next/link";
import { ladeOberflaeche } from "@/lib/oberflaeche";
import { planungAnsichtSpeichern } from "@/lib/oberflaeche-actions";
import { ladePlanung } from "@/lib/planung";
import { erledigteAufraeumen } from "@/lib/planung-actions";
import { Button, Card, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PlanungEinstellungen() {
  const [{ aufgaben, projekte, tabelleFehlt }, ansicht] = await Promise.all([
    ladePlanung(), ladeOberflaeche(),
  ]);

  const erledigt = aufgaben.filter((a) => a.erledigt).length;
  const habits = aufgaben.filter((a) => a.kategorie === "Habit").length;

  return (
    <>
      <Card>
        <CardTitle>Was im Kalender steht</CardTitle>
        <p className="mb-4 max-w-2xl text-sm text-ink-muted">
          Der Kalender zeigt inzwischen dreierlei am selben Tag: offene
          Aufgaben, erledigte Aufgaben und die Haken aus dem
          Gewohnheiten-Tracker. Für den einen ist das der vollständige Tag,
          für den anderen ein zugestellter Kalender — deshalb zwei Schalter
          statt einer Festlegung.
        </p>

        <form action={planungAnsichtSpeichern} className="space-y-4">
          <label className="flex max-w-2xl cursor-pointer items-start gap-3">
            <input type="checkbox" name="planung_erledigte" value="1"
              defaultChecked={ansicht.planungErledigte}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--akzent,#E7A96B)]" />
            <span>
              <span className="block text-sm text-ink">Erledigte Aufgaben zeigen</span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                Durchgestrichen an ihrem Tag stehen lassen. Aus heisst: der
                Kalender zeigt nur, was noch offen ist. In der Liste darunter
                bleiben sie in jedem Fall — dort sind sie zugeklappt.
              </span>
            </span>
          </label>

          <label className="flex max-w-2xl cursor-pointer items-start gap-3">
            <input type="checkbox" name="planung_gewohnheiten" value="1"
              defaultChecked={ansicht.planungGewohnheiten}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--akzent,#E7A96B)]" />
            <span>
              <span className="block text-sm text-ink">
                Gewohnheiten im selben Kalender
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                Die eingetragenen Tage aus dem{" "}
                <Link href="/einstellungen/gewohnheiten"
                  className="text-accent-soft hover:underline">
                  Gewohnheiten-Tracker
                </Link>{" "}
                erscheinen unten in der Tageszelle, abgesetzt von den Aufgaben.
                Aus heisst: zwei getrennte Ansichten, der Tracker behält seinen
                eigenen Monatsverlauf.
              </span>
            </span>
          </label>

          <Button type="submit">Speichern</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Zwei Arten, dasselbe zu notieren</CardTitle>
        <div className="max-w-2xl space-y-3 text-sm leading-relaxed text-ink-soft">
          <p>
            <strong className="text-ink">Eine Aufgabe mit Art „Habit"</strong> ist
            eine Zeile wie jede andere: ein Name, ein Haken, ein Tag. Gut für
            etwas, das an einem bestimmten Tag passieren soll und danach
            erledigt ist. Sie kennt keine Serie und keine Wochenquote.
          </p>
          <p>
            <strong className="text-ink">Eine Gewohnheit im Tracker</strong> ist
            das Gegenteil: sie hat kein Ende, dafür eine Serie, ein Wochenziel,
            Varianten wie Push/Pull/Ausdauer und einen Monatsverlauf zum
            Nachtragen. Gut für alles, was man zählt statt abhakt.
          </p>
          <p className="text-ink-muted">
            Beide stehen im selben Kalender, damit ein Tag eine Ansicht hat.
            Angelegt werden sie an verschiedenen Orten — Aufgaben unten auf der
            Startseite, Gewohnheiten unter{" "}
            <Link href="/einstellungen/gewohnheiten"
              className="text-accent-soft hover:underline">
              Einstellungen → Gewohnheiten
            </Link>.
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle>Aufräumen</CardTitle>
        {tabelleFehlt ? (
          <p className="text-sm text-ink-muted">
            Die Planung ist noch nicht eingerichtet — führe
            {" "}<code className="rounded bg-sand px-1 py-0.5 text-xs">
              21_planung.sql
            </code>,{" "}
            <code className="rounded bg-sand px-1 py-0.5 text-xs">
              22_planung_kategorie.sql
            </code> und{" "}
            <code className="rounded bg-sand px-1 py-0.5 text-xs">
              23_planung_ansicht.sql
            </code> im SQL-Editor aus.
          </p>
        ) : (
          <>
            <p className="mb-3 max-w-2xl text-sm text-ink-muted">
              Zurzeit {aufgaben.length} Einträge, davon {erledigt} erledigt
              und {habits} als Habit markiert, in {projekte.length}{" "}
              {projekte.length === 1 ? "Projekt" : "Projekten"}.
            </p>
            <form action={erledigteAufraeumen}>
              <Button type="submit" variant="danger" disabled={erledigt === 0}>
                {erledigt} erledigte Einträge löschen
              </Button>
            </form>
            <p className="mt-2 text-[11px] text-ink-faint">
              Endgültig — es gibt keinen Papierkorb. Offene Einträge und die
              Projekte bleiben unberührt.
            </p>
          </>
        )}
      </Card>
    </>
  );
}
