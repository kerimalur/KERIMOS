import { ladePlanung, baueKalender, zuAnsicht, PLANUNG_SQL } from "@/lib/planung";
import { NeuesProjekt } from "@/components/planung-neu";
import { PlanungProjekt } from "@/components/planung-projekt";
import { PlanungAufgaben } from "@/components/planung-aufgaben";
import { PlanungKalender } from "@/components/planung-kalender";
import { Card, CardTitle } from "@/components/ui";
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
 * @param ansicht "woche" (Vorgabe) oder "monat", aus `?ansicht=`.
 * @param von Erster Tag des Zeitraums, aus `?von=`.
 * @param basis Wohin das Blättern zeigt — "/" auf der Startseite.
 * @param kompakt Lässt die Überschrift weg; auf der eigenen Seite steht sie
 *   schon im Kopf.
 */
export async function PlanungBereich({
  ansicht, von, basis = "/planung", kompakt = false,
}: {
  ansicht?: string;
  von?: string;
  basis?: string;
  kompakt?: boolean;
}) {
  // Die Gewohnheiten kommen aus ihrem eigenen Tracker und stehen trotzdem in
  // diesem Kalender: ein Tag hat eine Ansicht, nicht zwei. Fehlen die Tabellen
  // noch, ist die Liste leer und der Kalender zeigt nur Aufgaben.
  const [{ projekte, aufgaben, tabelleFehlt }, marken, zeigen] = await Promise.all([
    ladePlanung(),
    ladeGewohnheitsMarken(),
    ladeOberflaeche(),
  ]);
  const heute = heuteISO();

  // Was im Kalender steht, entscheidet /einstellungen/planung. Die Liste
  // darunter zeigt Erledigtes immer — dort ist es zugeklappt und stört nicht.
  const imKalender = zeigen.planungErledigte
    ? aufgaben : aufgaben.filter((a) => !a.erledigt);
  const kalender = baueKalender(imKalender, zuAnsicht(ansicht), von, heute);

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
      <PlanungKalender ansicht={kalender.ansicht} anker={kalender.anker}
        tage={kalender.tage} aufgaben={imKalender}
        marken={zeigen.planungGewohnheiten ? marken : []}
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
          {projekte.map((p) => <PlanungProjekt key={p.id} p={p} />)}
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
