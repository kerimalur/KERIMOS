import { essenLoeschen, essenSetzen } from "@/lib/woche-actions";
import { Card, CardTitle, cx } from "@/components/ui";
import { dayName } from "@/lib/time";
import type { WochenDaten } from "@/lib/woche";

/**
 * Essen: Plan eingehalten — ja oder nein, und wenn nein, woran es lag.
 *
 * Keine Mahlzeiten abhaken, keine Kalorien zählen. Die Frage ist nur, ob der
 * Tag nach Plan lief. Die Probleme stehen unten gesammelt, weil sich dort
 * zeigt, was sich wiederholt — und das ist das Einzige, was man ändern kann.
 */
export function EssenKarte({ d }: { d: WochenDaten }) {
  const tage = d.tage.filter((t) => t <= d.heute);
  const eintrag = (t: string) => d.essen.find((e) => e.datum === t);
  const ok = d.essen.filter((e) => e.eingehalten).length;
  const probleme = d.essen.filter((e) => !e.eingehalten && e.problem);

  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Essen nach Plan</CardTitle>
        {d.essen.length > 0 && (
          <span className={cx("tabular text-sm font-medium",
            ok === d.essen.length ? "text-good" : "text-ink")}>
            {ok} / {d.essen.length} Tage
          </span>
        )}
      </div>

      {tage.length === 0 ? (
        <p className="text-sm text-ink-muted">Diese Woche hat noch nicht angefangen.</p>
      ) : (
        <ul className="space-y-2">
          {[...tage].reverse().map((t) => {
            const e = eintrag(t);
            const tag = t === d.heute ? "Heute" : dayName(t);
            return (
              <li key={t} className="rounded-xl bg-sand/50 px-3 py-2.5">
                {e ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 capitalize text-ink-soft">{tag}</span>
                    <span className={e.eingehalten ? "text-good-bright" : "text-bad-bright"}>
                      {e.eingehalten ? "✓ eingehalten" : "✗ nicht eingehalten"}
                    </span>
                    {e.problem && (
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                        — {e.problem}
                      </span>
                    )}
                    <form action={essenLoeschen} className="ml-auto">
                      <input type="hidden" name="datum" value={t} />
                      <button className="text-xs text-ink-faint transition hover:text-ink-soft">
                        ändern
                      </button>
                    </form>
                  </div>
                ) : (
                  <form action={essenSetzen} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="datum" value={t} />
                    <span className="w-24 shrink-0 text-sm capitalize text-ink-soft">{tag}</span>
                    <button name="eingehalten" value="1"
                      className="rounded-lg border border-good/40 bg-good-tint/40 px-3 py-1 text-xs
                                 font-medium text-good-bright transition hover:border-good
                                 active:scale-[0.97]">
                      ✓ Ja
                    </button>
                    <input name="problem" placeholder="Wenn nein: was war das Problem?"
                      className="min-w-40 flex-1 rounded-lg border border-line bg-field px-2.5
                                 py-1 text-xs text-ink placeholder:text-ink-faint outline-none
                                 focus:border-accent" />
                    <button name="eingehalten" value="0"
                      className="rounded-lg border border-bad/40 bg-bad-tint/40 px-3 py-1 text-xs
                                 font-medium text-bad-bright transition hover:border-bad
                                 active:scale-[0.97]">
                      ✗ Nein
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {probleme.length > 0 && (
        <div className="mt-4 border-t border-line/70 pt-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-muted">
            Was diese Woche dazwischenkam
          </p>
          <ul className="space-y-1 text-sm text-ink-soft">
            {probleme.map((p) => (
              <li key={p.datum}>
                <span className="capitalize text-ink-faint">{dayName(p.datum)}:</span>{" "}
                {p.problem}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
