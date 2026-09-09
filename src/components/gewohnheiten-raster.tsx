import { type GewohnheitStand } from "@/lib/gewohnheiten";
import { gewohnheitAbhaken } from "@/lib/gewohnheiten-actions";
import { cx } from "@/components/ui";
import { heuteISO } from "@/lib/time";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Vier Wochen als Raster — und jedes Feld ist ein Knopf.
 *
 * Welche Tage das Raster zeigt, rechnet `lib/gewohnheiten-zaehlung.ts`.
 *
 * Nachtragen ist der Grund, warum die Felder klickbar sind und nicht nur
 * gefärbt: Man merkt am Mittwoch, dass Montag fehlt. Ohne diesen Weg wäre die
 * einzige Antwort „dann stimmt die Zahl eben nicht", und ab da stimmt sie nie
 * wieder.
 *
 * Zukünftige Tage der laufenden Woche bleiben leer und unklickbar. Ein Haken
 * für übermorgen wäre keine Aufzeichnung mehr, sondern ein Vorsatz.
 */
export function GewohnheitenRaster({ h }: { h: GewohnheitStand }) {
  const heute = heuteISO();

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WOCHENTAGE.map((t) => (
          <div key={t} className="text-center text-[10px] text-ink-faint">{t}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {h.raster.map((tag) => {
          if (tag.zukunft) {
            return (
              <div key={tag.datum}
                className="aspect-square rounded-md border border-dashed border-line/50" />
            );
          }

          return (
            <form key={tag.datum} action={gewohnheitAbhaken}>
              <input type="hidden" name="id" value={h.id} />
              <input type="hidden" name="datum" value={tag.datum} />
              <input type="hidden" name="getan" value={tag.getan ? "" : "1"} />
              <button type="submit"
                title={`${tag.datum}${tag.getan ? " — getan" : ""}`}
                className={cx(
                  "aspect-square w-full rounded-md border text-[10px] transition",
                  "duration-150 ease-tactile hover:opacity-80 active:scale-90",
                  tag.getan ? "border-transparent" : "border-line/70 bg-sand/40",
                  tag.datum === heute && "ring-1 ring-accent ring-offset-1 ring-offset-card")}
                style={tag.getan ? { background: h.farbe } : undefined}>
                <span className="sr-only">{tag.datum}</span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
