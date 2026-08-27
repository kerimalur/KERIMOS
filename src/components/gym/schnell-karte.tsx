import { schnellTraining, schnellTrainingLoeschen } from "@/lib/schnell-training-actions";
import { Card, CardTitle, Input, Label, cx } from "@/components/ui";
import { NACHTRAG_TAGE } from "@/lib/schnell-training";
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
  heute, gestern, einheiten, naechsterSplit, fehler = null,
}: {
  heute: string;
  gestern: string;
  /** Meldung einer gescheiterten Aktion, aus `?fehler=` auf der Adresse. */
  fehler?: string | null;
  /** Einheiten von heute und gestern — alle Quellen, nicht nur angetippte. */
  einheiten: Einheit[];
  /** Der logische Gegenpart zur letzten Einheit. Null, wenn nicht ableitbar. */
  naechsterSplit: string | null;
}) {
  // Wie weit das Datumsfeld zurückreichen darf — dieselbe Grenze, die die
  // Aktion prüft. Zwei Zahlen dafür wären zwei Wahrheiten.
  const grenze = new Date(Date.parse(`${heute}T12:00:00Z`) - NACHTRAG_TAGE * 86400000)
    .toISOString().slice(0, 10);

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

      {fehler && (
        <div className="mb-3 rounded-xl border border-bad/40 bg-bad-tint px-3 py-2.5
                        text-xs leading-relaxed text-ink-soft">
          <p>
            <strong className="text-bad-bright">Das hat nicht geklappt.</strong>{" "}
            {fehler}
          </p>

          {/* Nur bei genau diesem Fall: die Prüfregel auf `log_source` kennt
              „schnell" nicht. Die SQL steht hier, weil sie hier gebraucht
              wird — nicht auf einer Einstellungsseite, die man dann sucht. */}
          {/log_source/.test(fehler) && (
            <>
              <p className="mt-2">
                Einmal im Supabase-SQL-Editor der <strong>Gym</strong>-Datenbank
                ausführen. Zuerst schauen, was bisher erlaubt ist:
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-paper/60 p-2 text-[11px] text-ink-soft">
                <code>{`select pg_get_constraintdef(oid)
from pg_constraint
where conname = 'workout_sessions_log_source_check';`}</code>
              </pre>
              <p className="mt-2">
                Steht dort nur <code>manual</code> und <code>garmin</code>, passt
                das hier. Kommt ein anderer Wert vor, nimm ihn mit in die Liste:
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-paper/60 p-2 text-[11px] text-ink-soft">
                <code>{`alter table workout_sessions
  drop constraint if exists workout_sessions_log_source_check;

alter table workout_sessions
  add constraint workout_sessions_log_source_check
  check (log_source is null or log_source in ('manual', 'garmin', 'schnell'));`}</code>
              </pre>
              <p className="mt-2 text-ink-faint">
                Fehlt ein bestehender Wert in der Liste, scheitert der zweite
                Befehl mit einer klaren Meldung — Postgres prüft die
                vorhandenen Zeilen mit. Kaputtgehen kann dabei nichts.
              </p>
            </>
          )}
        </div>
      )}

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

      {/* Zugeklappt, weil es der seltene Fall ist. Datum und Uhrzeit stehen
          hier und nicht bei den grossen Knöpfen: die sind für „jetzt gerade",
          und ein Formular davor würde den einen Tipp kaputtmachen, für den
          es sie gibt. */}
      <details className="mt-3 border-t border-line/70 pt-3">
        <summary className="cursor-pointer list-none text-xs text-ink-muted transition hover:text-ink-soft">
          Anderer Tag oder andere Uhrzeit
          {vonGestern.length > 0 && (
            <span className="ml-1.5 text-ink-faint">
              — gestern steht schon: {vonGestern.map((e) => e.split ?? "Training").join(", ")}
            </span>
          )}
        </summary>

        <form className="mt-2.5 flex flex-wrap items-end gap-2.5">
          <div>
            <Label htmlFor="schnell-datum">Tag</Label>
            <Input id="schnell-datum" name="datum" type="date"
              defaultValue={gestern} min={grenze} max={heute} className="w-36" />
          </div>
          <div>
            <Label htmlFor="schnell-zeit">Uhrzeit</Label>
            <Input id="schnell-zeit" name="zeit" type="time" className="w-28" />
          </div>
          {/* Zwei Absender in einem Formular: der Knopf schickt seinen eigenen
              Wert mit, so gehen Datum und Uhrzeit aus denselben Feldern an
              beide. */}
          <button formAction={schnellTraining} name="split" value="push"
            className="rounded-xl border border-line bg-sand px-4 py-2 text-sm
                       font-medium text-ink-soft transition hover:border-line-strong
                       hover:text-ink active:scale-[0.98]">
            Push
          </button>
          <button formAction={schnellTraining} name="split" value="pull"
            className="rounded-xl border border-line bg-sand px-4 py-2 text-sm
                       font-medium text-ink-soft transition hover:border-line-strong
                       hover:text-ink active:scale-[0.98]">
            Pull
          </button>
        </form>

        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Ohne Uhrzeit landet der Eintrag mittags — das hält den Tag, sagt aber
          nichts über die Einheit. Nachtragen geht {NACHTRAG_TAGE} Tage zurück;
          weiter zurück wäre meist ein Vertipper und keine Absicht.
        </p>
      </details>
    </Card>
  );
}
