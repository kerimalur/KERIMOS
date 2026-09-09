import Link from "next/link";
import { type GewohnheitMitRaster } from "@/lib/gewohnheiten";
import { gewohnheitAbhaken, gewohnheitTagLeeren } from "@/lib/gewohnheiten-actions";
import { monatPlus, monatsLabel, monatsStart } from "@/lib/gewohnheiten-zaehlung";
import { cx } from "@/components/ui";
import { heuteISO } from "@/lib/time";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Ein Monat als Raster — und jedes Feld ist ein Knopf.
 *
 * Nachtragen ist der Grund, warum die Felder klickbar sind und nicht nur
 * gefärbt: Man merkt am Mittwoch, dass Montag fehlt. Ohne diesen Weg wäre die
 * einzige Antwort „dann stimmt die Zahl eben nicht", und ab da stimmt sie nie
 * wieder.
 *
 * Ein leerer Tag bekommt einen Eintrag, ein voller wird geleert — mit allen
 * Varianten auf einmal. Wer im Raster auf einen Tag drückt, meint den Tag;
 * welche Variante genau, wählt man im Dialog oben. Zwei verschiedene Fragen
 * an derselben Fläche wären eine zu viel.
 *
 * Vor- und Nachlauftage der Nachbarmonate stehen blass da und sind nicht
 * klickbar: sonst trägt man beim Blättern in den falschen Monat ein.
 *
 * Geblättert wird über die Adresse (`?monat=`), nicht über einen Zustand im
 * Browser. So ist ein bestimmter Monat verlinkbar, der Zurück-Knopf tut das
 * Erwartete, und die Seite bleibt eine Server-Komponente.
 */
export function GewohnheitenRaster({ h }: { h: GewohnheitMitRaster }) {
  const heute = heuteISO();
  const dieserMonat = monatsStart(heute);
  const vor = monatPlus(h.monat, -1);
  const zurueck = monatPlus(h.monat, 1);
  // Kein Blättern in die Zukunft: dort steht nichts und kann nichts stehen.
  const weiterMoeglich = zurueck <= dieserMonat;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Link href={`/gewohnheiten?monat=${vor.slice(0, 7)}`} scroll={false}
          aria-label="Monat zurück"
          className="rounded-lg px-2 py-0.5 text-sm text-ink-muted transition
                     hover:bg-sand hover:text-ink-soft">
          ‹
        </Link>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          {monatsLabel(h.monat)}
        </span>
        {weiterMoeglich ? (
          <Link href={`/gewohnheiten?monat=${zurueck.slice(0, 7)}`} scroll={false}
            aria-label="Monat vor"
            className="rounded-lg px-2 py-0.5 text-sm text-ink-muted transition
                       hover:bg-sand hover:text-ink-soft">
            ›
          </Link>
        ) : (
          <span className="px-2 py-0.5 text-sm text-ink-faint/40" aria-hidden>›</span>
        )}
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WOCHENTAGE.map((t) => (
          <div key={t} className="text-center text-[10px] text-ink-faint">{t}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {h.raster.map((tag) => {
          const tagesZahl = Number(tag.datum.slice(8, 10));

          if (tag.ausserhalb || tag.zukunft) {
            return (
              <div key={tag.datum}
                className={cx(
                  "grid aspect-square place-items-center rounded-md text-[10px]",
                  tag.ausserhalb
                    ? "text-ink-faint/30"
                    : "border border-dashed border-line/50 text-ink-faint/50")}>
                {tag.ausserhalb ? "" : tagesZahl}
              </div>
            );
          }

          const voll = tag.eintraege.length > 0;
          const titel = voll
            ? `${tag.datum} — ${tag.eintraege
                .map((e) => e.variante ?? "eingetragen").join(", ")}`
            : tag.datum;

          return (
            <form key={tag.datum}
              action={voll ? gewohnheitTagLeeren : gewohnheitAbhaken}>
              <input type="hidden" name="id" value={h.id} />
              <input type="hidden" name="datum" value={tag.datum} />
              {!voll && <input type="hidden" name="getan" value="1" />}
              <button type="submit" title={titel}
                className={cx(
                  "grid aspect-square w-full place-items-center rounded-md border",
                  "text-[10px] transition duration-150 ease-tactile",
                  "hover:opacity-80 active:scale-90",
                  voll ? "border-transparent text-white" : "border-line/70 bg-sand/40 text-ink-faint",
                  tag.datum === heute && "ring-1 ring-accent ring-offset-1 ring-offset-card")}
                style={voll ? { background: h.farbe } : undefined}>
                {/* Mehrere Einheiten an einem Tag: die Zahl statt des Datums —
                    sonst sieht ein Doppeltag aus wie jeder andere. */}
                {tag.eintraege.length > 1 ? `${tag.eintraege.length}×` : tagesZahl}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
