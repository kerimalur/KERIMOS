import { cx } from "@/components/ui";
import { heuteFaellig, uhrzeitKurz, type RoutineZiel } from "@/lib/routinen/typen";

/**
 * Was heute für die eigenen Ziele ansteht — kompakt, zum Anzeigen.
 * Steht auf der Startseite zwischen Titel und Kacheln und oben im Routinen-Tab.
 */
export function RoutinenHeute({ ziele, wochentag, className }: {
  ziele: RoutineZiel[]; wochentag: number; className?: string;
}) {
  const gruppen = heuteFaellig(ziele, wochentag);
  if (gruppen.length === 0) return null;

  return (
    <div className={cx("space-y-2", className)}>
      {gruppen.map(({ ziel, handlungen }) => (
        <div key={ziel.id}>
          <p className="text-[11px] font-medium text-ink-faint">Für „{ziel.titel}"</p>
          <ul className="mt-0.5 space-y-0.5">
            {handlungen.map((h) => (
              <li key={h.id} className="flex items-baseline gap-2 text-sm text-ink-soft">
                <span className="text-accent">•</span>
                <span className="min-w-0 flex-1">{h.titel}</span>
                {h.uhrzeit && <span className="tabular text-xs text-ink-faint">{uhrzeitKurz(h.uhrzeit)}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
