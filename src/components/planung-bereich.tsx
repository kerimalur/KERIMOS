import { ladePlanung, baueKalender, PLANUNG_SQL } from "@/lib/planung";
import { projektUmbenennen, projektLoeschen } from "@/lib/planung-actions";
import { NeuesProjekt } from "@/components/planung-neu";
import { PlanungAufgaben } from "@/components/planung-aufgaben";
import { PlanungKalender } from "@/components/planung-kalender";
import { Button, Card, CardTitle, Input } from "@/components/ui";
import { heuteISO } from "@/lib/time";
import { ladeGewohnheitsMarken } from "@/lib/gewohnheiten";
import { ladeOberflaeche } from "@/lib/oberflaeche";

/**
 * Der ganze Planungsbereich: Kalender, Aufgaben, Projekte — in dieser
 * Reihenfolge.
 *
 * Die Reihenfolge ist nicht verhandelt, sie bildet das Notion-Dashboard ab,
 * das dieser Bereich ersetzt: oben der Kalender (wann), in der Mitte die
 * Tabelle (was), unten die Projekte (wozu). Wer das Dashboard kennt, findet
 * sich ohne Umgewöhnung zurecht — und das ist bei einem Werkzeug, das man
 * jeden Tag aufmacht, mehr wert als jede Verbesserung, die man erst lernen
 * muss.
 *
 * Steht als eigene Komponente da, weil derselbe Aufbau an zwei Stellen
 * gebraucht wird: eingebettet auf der Startseite und als eigene Seite unter
 * `/planung`. Zwei Abschriften wären zwei Orte, an denen man dieselbe
 * Änderung machen müsste — und einer davon bliebe irgendwann zurück.
 *
 * @param monat Welcher Monat im Kalender steht (aus `?monat=`).
 * @param basis Wohin das Blättern zeigt — "/" auf der Startseite.
 * @param kompakt Lässt die Überschrift weg; auf der eigenen Seite steht sie
 *   schon im Kopf.
 */
export async function PlanungBereich({
  monat, basis = "/planung", kompakt = false,
}: {
  monat?: string;
  basis?: string;
  kompakt?: boolean;
}) {
  // Die Gewohnheiten kommen aus ihrem eigenen Tracker und stehen trotzdem in
  // diesem Kalender: ein Tag hat eine Ansicht, nicht zwei. Fehlen die Tabellen
  // noch, ist die Liste leer und der Kalender zeigt nur Aufgaben.
  const [{ projekte, aufgaben, tabelleFehlt }, marken, ansicht] = await Promise.all([
    ladePlanung(),
    ladeGewohnheitsMarken(),
    ladeOberflaeche(),
  ]);
  const heute = heuteISO();

  // Was im Kalender steht, entscheidet /einstellungen/planung. Die Liste
  // darunter zeigt Erledigtes immer — dort ist es zugeklappt und stört nicht.
  const imKalender = ansicht.planungErledigte
    ? aufgaben : aufgaben.filter((a) => !a.erledigt);
  const kalender = baueKalender(imKalender, monat, heute);

  if (tabelleFehlt) {
    return (
      <Card>
        <CardTitle>Planung — Tabellen fehlen noch</CardTitle>
        <p className="text-sm text-ink-muted">
          Führe <code className="rounded bg-sand px-1 py-0.5 text-xs">
            supabase/migrations/21_planung.sql
          </code> und danach <code className="rounded bg-sand px-1 py-0.5 text-xs">
            22_planung_kategorie.sql
          </code> im SQL-Editor aus. Beides zusammen ergibt den Stand unten —
          zum Kopieren:
        </p>
        <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-sand p-4 text-xs
                        leading-relaxed text-ink-soft">
          {PLANUNG_SQL}
        </pre>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!kompakt && (
        <div className="text-[11px] font-medium uppercase
                        tracking-[0.12em] text-ink-muted">
          Planung
        </div>
      )}

      {/* ------------------------------------------------------- Kalender */}
      <PlanungKalender monat={kalender.monat} tage={kalender.tage}
        aufgaben={imKalender}
        marken={ansicht.planungGewohnheiten ? marken : []}
        basis={basis} />

      {/* ------------------------------------------------------- Aufgaben */}
      <PlanungAufgaben aufgaben={aufgaben} projekte={projekte} />

      {/* ------------------------------------------------------- Projekte */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase
                           tracking-[0.12em] text-ink-muted">
            Projekte
          </span>
          {projekte.length > 0 && <NeuesProjekt />}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projekte.length === 0 && (
            // Die leere Kachel ersetzt die Leermeldung: sie sagt dasselbe und
            // ist zugleich der Weg. Eine Meldung, die nur bedauert, ist eine
            // Zeile, die nichts tut.
            <NeuesProjekt knopf="kachel" />
          )}
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
                  Einträge bleiben stehen und stehen danach ohne Projekt da.
                </p>
              </details>
            </Card>
          ))}
        </div>

        {projekte.length === 0 && (
          <p className="mt-2 max-w-2xl text-[11px] text-ink-faint">
            Aufgaben gehen auch ohne Projekt — eins lohnt sich erst, wenn
            mehrere zusammengehören.
          </p>
        )}
      </div>
    </div>
  );
}
