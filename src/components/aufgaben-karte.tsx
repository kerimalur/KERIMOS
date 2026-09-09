import Link from "next/link";
import { ladePlanung } from "@/lib/planung";
import { aufgabeAbhaken } from "@/lib/planung-actions";
import { EinrichtungHinweis } from "@/components/einrichtung-hinweis";
import { Card, CardTitle, cx } from "@/components/ui";
import { dateLabel } from "@/lib/format";

/** Wie viele Zeilen höchstens. Darüber steht der Weg zur vollen Liste. */
const MAX = 6;

/**
 * Was heute ansteht — die Aufgaben auf dem Dashboard.
 *
 * Zeigt NICHT alle offenen Aufgaben, sondern die, die eine Entscheidung
 * verlangen: überfällige, heutige und die ohne Termin. Was erst nächste Woche
 * fällig ist, gehört auf `/planung` und nicht auf die Startseite — sonst
 * scrollt man jeden Morgen an Dingen vorbei, die nichts mit heute zu tun
 * haben, und hört nach einer Woche auf hinzusehen.
 *
 * Aufgaben ohne Termin sind trotzdem dabei, aber unten: sie drängen nicht,
 * verschwinden aber auch nicht aus dem Blick.
 */
export async function AufgabenKarte() {
  const { aufgaben, tabelleFehlt } = await ladePlanung();

  if (tabelleFehlt) {
    return (
      <EinrichtungHinweis titel="Aufgaben" datei="21_planung.sql" ziel="/planung" />
    );
  }

  const offen = aufgaben.filter((a) => !a.erledigt);
  // Reihenfolge: überfällig, heute, ohne Termin. „später" bleibt draussen.
  const rang = { ueberfaellig: 0, heute: 1, ohne: 2, spaeter: 9 } as const;
  const dran = offen
    .filter((a) => a.dringend !== "spaeter")
    .sort((a, b) =>
      rang[a.dringend] - rang[b.dringend] ||
      (a.faellig ?? "").localeCompare(b.faellig ?? ""));

  const spaeter = offen.length - dran.length;

  if (offen.length === 0) return null;

  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Aufgaben</CardTitle>
        <Link href="/planung" className="text-xs text-accent-soft hover:underline">
          alle {offen.length} ↗
        </Link>
      </div>

      {dran.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Für heute nichts. {spaeter} {spaeter === 1 ? "Aufgabe" : "Aufgaben"} später fällig.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {dran.slice(0, MAX).map((a) => (
            <li key={a.id}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-1
                         transition hover:bg-sand/50">
              <form action={aufgabeAbhaken} className="shrink-0">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="done" value="1" />
                <button type="submit" aria-label="erledigt"
                  className="grid h-[20px] w-[20px] place-items-center rounded-md border
                             border-line-strong text-[11px] text-transparent transition
                             duration-150 ease-tactile hover:border-accent active:scale-90">
                  ✓
                </button>
              </form>

              <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.name}</span>

              {a.projektName && (
                <span className="hidden shrink-0 items-center gap-1.5 text-[11px]
                                 text-ink-muted sm:flex">
                  <span className="h-2 w-2 rounded-full"
                    style={{ background: a.projektFarbe ?? "#9A8C74" }} />
                  {a.projektName}
                </span>
              )}

              <span className={cx("tabular shrink-0 text-[11px]",
                a.dringend === "ueberfaellig" ? "text-bad-bright"
                  : a.dringend === "heute" ? "text-accent-soft" : "text-ink-faint")}>
                {a.dringend === "ueberfaellig" ? `überfällig · ${dateLabel(a.faellig!)}`
                  : a.dringend === "heute" ? "heute"
                    : "ohne Termin"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {dran.length > MAX && (
        <p className="mt-2 px-1.5 text-[11px] text-ink-faint">
          und {dran.length - MAX} weitere.
        </p>
      )}
    </Card>
  );
}
