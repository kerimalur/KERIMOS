import { habitEintragen, habitLoeschen } from "@/lib/woche-actions";
import { Card, CardTitle, Bar, cx } from "@/components/ui";
import { dayNameShort } from "@/lib/time";
import {
  AUSDAUER_ZIEL, HABIT_LABEL, KRAFT_ZIEL, type HabitArt,
} from "@/lib/woche-typen";
import type { WochenDaten } from "@/lib/woche";

/** Eine Zeile: Label, Stand/Ziel, Balken. */
function Zeile({
  label, stand, ziel, farbe, zusatz, stark,
}: {
  label: string; stand: number; ziel: number; farbe: string;
  zusatz?: string; stark?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-soft">
          {label}
          {zusatz && <span className="ml-2 text-xs text-ink-faint">{zusatz}</span>}
        </span>
        <span className={cx("tabular font-medium", stand >= ziel ? "text-good" : "text-ink")}>
          {stand} / {ziel}{stark && stand > ziel && " · stark"}
        </span>
      </div>
      <Bar pct={ziel > 0 ? (stand / ziel) * 100 : 0} color={farbe} className="mt-1.5" />
    </div>
  );
}

const KNOPF_FARBE: Record<HabitArt, string> = {
  push: "border-gym/40 hover:border-gym",
  pull: "border-gym/40 hover:border-gym",
  ausdauer: "border-good/40 hover:border-good",
};

/**
 * Training und Backtest — die Zahlen, an denen sich die Woche misst.
 *
 * Kraft und Ausdauer werden angetippt, der Backtest zählt sich selbst aus dem
 * Trading-Journal. Keine Dauer, keine Sätze: ob man war, ist die Frage.
 */
export function TrainingKarte({ d }: { d: WochenDaten }) {
  const push = d.habits.filter((h) => h.art === "push").length;
  const pull = d.habits.filter((h) => h.art === "pull").length;

  // Wählbar sind die Tage dieser Woche bis heute. Vorbelegt ist heute —
  // oder, beim Blick in eine vergangene Woche, deren Sonntag.
  const waehlbar = d.tage.filter((t) => t <= d.heute);
  const vorbelegt = waehlbar.includes(d.heute) ? d.heute : waehlbar[waehlbar.length - 1];

  return (
    <Card>
      <CardTitle>Training & Backtest</CardTitle>

      <div className="space-y-3.5">
        <Zeile label="Kraft" stand={d.kraft} ziel={KRAFT_ZIEL} farbe="#C68D6B"
          zusatz={d.kraft > 0 ? `${push}× Push · ${pull}× Pull` : undefined} />
        <Zeile label="Ausdauer" stand={d.ausdauer} ziel={AUSDAUER_ZIEL}
          farbe="#6E9B76" stark />
        {d.backtest && (
          <Zeile label="Backtest-Trades" stand={d.backtest.current}
            ziel={d.backtest.target} farbe="#8B94B8" zusatz="zählt automatisch" />
        )}
      </div>

      {waehlbar.length > 0 && (
        <form action={habitEintragen} className="mt-5 border-t border-line/70 pt-4">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">Erledigt am</span>
            <select name="datum" defaultValue={vorbelegt}
              className="rounded-lg border border-line bg-field px-2 py-1 text-xs text-ink">
              {waehlbar.map((t) => (
                <option key={t} value={t}>
                  {t === d.heute ? "heute" : `${dayNameShort(t)} ${t.slice(8)}.${t.slice(5, 7)}.`}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["push", "pull", "ausdauer"] as HabitArt[]).map((art) => (
              <button key={art} name="art" value={art}
                className={cx(
                  "rounded-xl border bg-sand px-3 py-3 text-sm font-semibold text-ink-soft",
                  "transition duration-150 ease-tactile hover:text-ink active:scale-[0.97]",
                  KNOPF_FARBE[art])}>
                + {HABIT_LABEL[art]}
              </button>
            ))}
          </div>
        </form>
      )}

      {/* Die Woche als Streifen: was an welchem Tag eingetragen ist. Ein Tipp
          auf ein Kärtchen nimmt es zurück — für Vertipper. */}
      <div className="mt-4 grid grid-cols-7 gap-1">
        {d.tage.map((t) => {
          const eintraege = d.habits.filter((h) => h.datum === t);
          return (
            <div key={t}
              className={cx("min-h-[64px] rounded-lg p-1.5",
                t === d.heute ? "bg-accent-tint/60" : "bg-sand/50")}>
              <div className="mb-1 text-center text-[10px] uppercase text-ink-faint">
                {dayNameShort(t)}
              </div>
              <div className="space-y-1">
                {eintraege.map((e) => (
                  <form key={e.id} action={habitLoeschen}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="datum" value={e.datum} />
                    <button title="Tippen zum Zurücknehmen"
                      className={cx(
                        "w-full truncate rounded-md px-1 py-0.5 text-[10px] font-medium transition",
                        "hover:line-through",
                        e.art === "ausdauer"
                          ? "bg-good-tint text-good-bright" : "bg-gym-bg text-gym-bright")}>
                      {HABIT_LABEL[e.art]}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
