import { schnellTraining, schnellTrainingLoeschen } from "@/lib/schnell-training-actions";
import { Card, CardTitle, cx } from "@/components/ui";
import type { Einheit } from "@/lib/supabase/gym";

/**
 * Push oder Pull mit einem Tipp.
 *
 * Kein Client-JavaScript, nur Formulare: das hier passiert am Handy in der
 * Garderobe, und was dann nicht sofort reagiert, passiert nicht.
 *
 * Der vorgeschlagene Split ist hervorgehoben, aber nicht vorausgewählt — Push
 * und Pull wechseln sich ab, und trotzdem entscheidet Kerim, nicht die
 * Ableitung. Ein Knopf, der sich selbst drückt, trägt irgendwann etwas ein,
 * das nicht stattgefunden hat.
 */
function Knopf({ split, datum, betont }: {
  split: "Push" | "Pull"; datum: string; betont: boolean;
}) {
  return (
    <form action={schnellTraining} className="flex-1">
      <input type="hidden" name="split" value={split.toLowerCase()} />
      <input type="hidden" name="datum" value={datum} />
      <button className={cx(
        "w-full rounded-2xl border px-4 py-4 text-base font-semibold transition",
        "duration-150 ease-tactile active:scale-[0.98]",
        betont
          ? "border-gym bg-gym-bg text-gym-bright"
          : "border-line bg-sand text-ink-soft hover:border-line-strong hover:text-ink")}>
        {split}
      </button>
    </form>
  );
}

export function SchnellKarte({
  heute, gestern, einheiten, naechsterSplit,
}: {
  heute: string;
  gestern: string;
  /** Einheiten von heute und gestern — alle Quellen, nicht nur angetippte. */
  einheiten: Einheit[];
  /** Der logische Gegenpart zur letzten Einheit. Null, wenn nicht ableitbar. */
  naechsterSplit: string | null;
}) {
  const vonHeute = einheiten.filter((e) => e.datum === heute);
  const vonGestern = einheiten.filter((e) => e.datum === gestern);
  const betont = (s: string) => naechsterSplit?.toLowerCase() === s.toLowerCase();

  return (
    <Card area="gym">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <CardTitle className="mb-0">Heute trainiert</CardTitle>
        {naechsterSplit && (
          <span className="text-xs text-ink-muted">
            dran wäre <strong className="text-gym-bright">{naechsterSplit}</strong>
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        Zählt wie eine erfasste Einheit — nur ohne Sätze. Für den Fortschritt
        je Übung brauchst du weiter eine getrackte Einheit.
      </p>

      <div className="flex gap-2.5">
        <Knopf split="Push" datum={heute} betont={betont("Push")} />
        <Knopf split="Pull" datum={heute} betont={betont("Pull")} />
      </div>

      {vonHeute.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line/70 pt-3">
          {vonHeute.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-good-bright">✓</span>
              <span className="text-ink">{e.split ?? "Training"}</span>
              <span className="text-xs text-ink-faint">
                {e.quelle === "garmin" ? "von der Uhr"
                  : e.quelle === "schnell" ? "angetippt" : "erfasst"}
              </span>
              {/* Zurücknehmen gibt es nur, wo auch etwas zurückzunehmen ist:
                  eine getrackte oder von der Uhr geholte Einheit wird hier
                  nicht gelöscht. */}
              {e.quelle === "schnell" && !e.hatLogs && (
                <form action={schnellTrainingLoeschen} className="ml-auto">
                  <input type="hidden" name="id" value={e.id} />
                  <button className="text-xs text-ink-faint transition hover:text-bad">
                    zurücknehmen
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Zugeklappt, weil es der seltene Fall ist. Aufgeklappt zwei Knöpfe —
          kein Datumsfeld: „gestern" ist die einzige Lücke, die man abends
          wirklich nachträgt, und alles andere gehört ins Kalenderfenster. */}
      <details className="mt-3 border-t border-line/70 pt-3">
        <summary className="cursor-pointer list-none text-xs text-ink-muted transition hover:text-ink-soft">
          Für gestern nachtragen
          {vonGestern.length > 0 && (
            <span className="ml-1.5 text-ink-faint">
              — steht schon: {vonGestern.map((e) => e.split ?? "Training").join(", ")}
            </span>
          )}
        </summary>
        <div className="mt-2.5 flex gap-2.5">
          <Knopf split="Push" datum={gestern} betont={false} />
          <Knopf split="Pull" datum={gestern} betont={false} />
        </div>
      </details>
    </Card>
  );
}
