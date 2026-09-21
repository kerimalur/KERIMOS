import { gewichtEintragen } from "@/lib/woche-actions";
import { Card, CardTitle, Input, Button, cx } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import type { WochenDaten } from "@/lib/woche";

/**
 * Gewicht — einmal pro Woche reicht.
 *
 * Gezeigt wird der letzte Wert und der Unterschied zum Wert davor, dazu die
 * letzten Einträge als kleine Liste. Keine Kurve: bei einem Wert pro Woche
 * sagt die Liste dasselbe mit weniger Aufwand.
 */
export function GewichtKarte({ d }: { d: WochenDaten }) {
  const [letzter, davor] = d.gewichte;
  const diff = letzter && davor ? letzter.kg - davor.kg : null;
  const dieseWoche = d.gewichte.find((g) => g.datum >= d.weekStart && g.datum <= d.tage[6]);
  const datum = d.tage.includes(d.heute) ? d.heute : d.tage[6];

  return (
    <Card>
      <CardTitle>Gewicht</CardTitle>

      {letzter ? (
        <div className="mb-4 flex items-baseline gap-3">
          <span className="font-display text-3xl font-bold tabular text-ink">
            {letzter.kg.toFixed(1)}
          </span>
          <span className="text-sm text-ink-muted">kg · {dateLabel(letzter.datum)}</span>
          {diff !== null && (
            <span className={cx("ml-auto tabular text-sm font-medium",
              diff < 0 ? "text-good" : diff > 0 ? "text-accent-soft" : "text-ink-muted")}>
              {diff > 0 ? "+" : ""}{diff.toFixed(1)} kg
            </span>
          )}
        </div>
      ) : (
        <p className="mb-4 text-sm text-ink-muted">Noch kein Gewicht eingetragen.</p>
      )}

      {!dieseWoche && (
        <form action={gewichtEintragen} className="flex items-center gap-2">
          <input type="hidden" name="datum" value={datum} />
          <Input name="kg" type="number" inputMode="decimal" step="0.1" min="30" max="250"
            required aria-label="Körpergewicht in Kilogramm"
            placeholder={letzter ? letzter.kg.toFixed(1) : "z.B. 85.0"} className="flex-1" />
          <Button type="submit" className="shrink-0">kg eintragen</Button>
        </form>
      )}
      {dieseWoche && (
        <p className="text-xs text-good-bright">Diese Woche gewogen ✓</p>
      )}

      {d.gewichte.length > 1 && (
        <ul className="mt-4 grid grid-cols-3 gap-x-3 gap-y-1 border-t border-line/70 pt-3
                       text-xs text-ink-muted sm:grid-cols-4">
          {d.gewichte.slice(0, 8).map((g) => (
            <li key={g.datum + g.kg} className="tabular">
              <span className="text-ink-faint">{g.datum.slice(8)}.{g.datum.slice(5, 7)}.</span>{" "}
              <span className="text-ink-soft">{g.kg.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
