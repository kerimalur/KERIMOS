import {
  punktErledigt, punktNicht, punktVerschieben, punktZuruecksetzen,
} from "@/lib/abgleich-actions";
import type { AbgleichPunkt } from "@/lib/abgleich";
import { cx, Input } from "@/components/ui";

/**
 * Der Abgleich: die Vorsätze von gestern Abend, einzeln abgefragt.
 *
 * Alles läuft über Formulare und keine einzige Zeile Client-JavaScript. Das
 * ist keine Sparsamkeit, sondern der Zweck: der Abgleich passiert abends um
 * halb elf am Handy, und was dann nicht sofort reagiert, passiert nicht.
 *
 * Der Grund für „nicht geschafft" steckt in einem `<details>`. Zugeklappt
 * steht dort nur ein Wort, aufgeklappt ein Feld — ohne Zustand im Browser
 * und ohne dass die Liste bei vier Punkten zur Wand wird.
 */
export function AbgleichListe({
  datum, punkte,
}: {
  datum: string;
  punkte: AbgleichPunkt[];
}) {
  if (punkte.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {punkte.map((p) => (
        <AbgleichZeile key={p.zeile} datum={datum} punkt={p} />
      ))}
    </ul>
  );
}

function AbgleichZeile({ datum, punkt }: { datum: string; punkt: AbgleichPunkt }) {
  const { zeile, stand, grund } = punkt;
  const erledigt = stand === "erledigt";

  return (
    <li className={cx("rounded-xl px-3 py-2",
      erledigt ? "bg-good-tint/40"
        : stand === "nicht" ? "bg-bad-tint/30"
          : stand === "verschoben" ? "bg-sand/40" : "bg-sand/60")}>
      <div className="flex items-start gap-2.5">
        {/* Ein Formular je Zeile: der Klick schickt genau diese eine Zeile,
            und ein zweiter Klick nimmt den Haken wieder weg. */}
        <form action={punktErledigt} className="shrink-0 pt-0.5">
          <input type="hidden" name="datum" value={datum} />
          <input type="hidden" name="zeile" value={zeile} />
          <button aria-label={erledigt ? "wieder öffnen" : "erledigt"}
            className={cx(
              "grid h-[18px] w-[18px] place-items-center rounded-md border text-[11px] transition",
              erledigt ? "border-good bg-good-tint text-good-bright"
                : "border-line-strong text-transparent hover:text-ink-faint")}>
            ✓
          </button>
        </form>

        <span className={cx("min-w-0 flex-1 text-sm",
          erledigt ? "text-ink-faint line-through"
            : stand === "verschoben" ? "text-ink-muted" : "text-ink")}>
          {zeile}
        </span>
      </div>

      {/* Beantwortet: der Stand steht da, plus ein Weg zurück. Keine
          Antwort ist endgültig — sonst trägt man sie aus Vorsicht nicht ein. */}
      {(stand === "nicht" || stand === "verschoben") && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-2 pl-[28px] text-xs">
          <span className={stand === "nicht" ? "text-bad" : "text-ink-muted"}>
            {stand === "nicht" ? `Nicht geschafft — ${grund}` : "Auf morgen geschoben"}
          </span>
          <form action={punktZuruecksetzen} className="inline">
            <input type="hidden" name="datum" value={datum} />
            <input type="hidden" name="zeile" value={zeile} />
            <button className="text-ink-faint transition hover:text-ink-muted">
              zurücknehmen
            </button>
          </form>
        </div>
      )}

      {stand === "offen" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-[28px] text-xs">
          <details className="min-w-0">
            <summary className="cursor-pointer list-none text-ink-muted transition hover:text-ink-soft">
              nicht geschafft
            </summary>
            <form action={punktNicht} className="mt-1.5 flex flex-wrap items-center gap-2">
              <input type="hidden" name="datum" value={datum} />
              <input type="hidden" name="zeile" value={zeile} />
              <div className="min-w-44 flex-1">
                <Input name="grund" required maxLength={200} placeholder="weil …" />
              </div>
              <button className="rounded-lg border border-line px-2.5 py-1 text-ink-soft transition hover:border-line-strong">
                festhalten
              </button>
            </form>
          </details>

          <form action={punktVerschieben} className="inline">
            <input type="hidden" name="datum" value={datum} />
            <input type="hidden" name="zeile" value={zeile} />
            <button className="text-ink-muted transition hover:text-ink-soft">
              → auf morgen
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
