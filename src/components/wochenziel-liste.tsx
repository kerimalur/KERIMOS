import { wochenzielAbhaken, wochenzielAnlegen, wochenzielLoeschen } from "@/lib/wochenziel-actions";
import type { Wochenziel } from "@/lib/wochenziele";
import { Input, Button, cx } from "@/components/ui";

/**
 * Die Ziele einer Woche — abhakbar.
 *
 * Dieselbe Liste steht auf der Startseite und im Rückblick. Auf der
 * Startseite ohne Eingabefeld: Ziele setzt man sonntags beim Rückblick, nicht
 * nebenbei. Wäre das Feld überall, würde die Liste über die Woche wachsen und
 * genau das verlieren, wofür sie da ist — zwei, drei Dinge, die zählen.
 */
export function WochenzielListe({
  ziele, weekStart, mitFormular = false,
}: {
  ziele: Wochenziel[];
  weekStart: string;
  mitFormular?: boolean;
}) {
  const offen = ziele.filter((z) => !z.erledigtAm).length;

  return (
    <div>
      {ziele.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {mitFormular
            ? "Noch kein Ziel für diese Woche. Zwei oder drei reichen — mehr wird keine Woche."
            : "Kein Ziel gesetzt."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {ziele.map((z) => {
            const erledigt = !!z.erledigtAm;
            return (
              <li key={z.id}
                className={cx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
                  erledigt ? "bg-good-tint/40" : "bg-sand/60")}>
                {/* Formular statt Kästchen mit JavaScript: der Haken muss auch
                    dann gehen, wenn sonst nichts geladen hat. */}
                <form action={wochenzielAbhaken}>
                  <input type="hidden" name="id" value={z.id} />
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

                <span className={cx("min-w-0 flex-1",
                  erledigt ? "text-ink-faint line-through" : "text-ink-soft")}>
                  {z.titel}
                </span>

                {mitFormular && (
                  <form action={wochenzielLoeschen}>
                    <input type="hidden" name="id" value={z.id} />
                    <button className="text-xs text-ink-faint transition hover:text-bad">
                      weg
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mitFormular && (
        <form action={wochenzielAnlegen} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="week_start" value={weekStart} />
          <div className="min-w-48 flex-1">
            <Input name="titel" required
              placeholder="z.B. 24 Backtest-Trades durchziehen" />
          </div>
          <Button type="submit" variant="ghost">Ziel setzen</Button>
        </form>
      )}

      {!mitFormular && ziele.length > 0 && offen === 0 && (
        <p className="mt-2 text-[11px] text-good-bright">
          Alle Wochenziele erledigt.
        </p>
      )}
    </div>
  );
}
