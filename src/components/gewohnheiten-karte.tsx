import Link from "next/link";
import { ladeGewohnheiten, type GewohnheitStand } from "@/lib/gewohnheiten";
import { gewohnheitAbhaken } from "@/lib/gewohnheiten-actions";
import { Card, CardTitle, cx } from "@/components/ui";

/**
 * Die Gewohnheiten als eine Reihe Haken — der ganze tägliche Umgang mit dem
 * Tracker besteht aus einem Druck pro Zeile.
 *
 * Rechts steht die Zahl, wegen der es den Tracker gibt: wie oft diese Woche.
 * Wo ein Wochenziel gesetzt ist, steht es dahinter, sonst nur die Zahl — ein
 * Ziel zu erfinden, nur damit die Anzeige vollständig aussieht, macht aus
 * einer Beobachtung eine Bewertung.
 *
 * @param bereich Nur Gewohnheiten dieses Bereichs (z. B. "gym"), oder alle.
 * @param titel   Überschrift der Karte.
 * @param leer    Was steht da, wenn es keine Gewohnheit gibt. Null blendet
 *                die Karte aus — so verhält sie sich auf der Startseite wie
 *                jede andere Karte dort.
 */
export async function GewohnheitenKarte({
  bereich = null, titel = "Gewohnheiten", leer = null,
}: {
  bereich?: string | null;
  titel?: string;
  leer?: string | null;
}) {
  const { gewohnheiten, tabelleFehlt } = await ladeGewohnheiten(bereich);

  if (tabelleFehlt) return null;
  if (gewohnheiten.length === 0) {
    if (!leer) return null;
    return (
      <Card>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">{titel}</CardTitle>
          <Link href="/gewohnheiten" className="text-xs text-accent-soft hover:underline">
            anlegen ↗
          </Link>
        </div>
        <p className="text-sm text-ink-muted">{leer}</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">{titel}</CardTitle>
        <Link href="/gewohnheiten" className="text-xs text-accent-soft hover:underline">
          Verlauf ↗
        </Link>
      </div>

      <ul className="space-y-1">
        {gewohnheiten.map((h) => (
          <li key={h.id}>
            <HakenZeile h={h} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Eine Zeile, ein Formular. Der gewünschte Zustand steht im Formular, nicht
 * in der Datenbank — ein zweiter Klick nimmt den Haken wieder weg, und zwei
 * schnelle Klicks heben sich sauber auf.
 */
export function HakenZeile({ h, datum }: { h: GewohnheitStand; datum?: string }) {
  return (
    <form action={gewohnheitAbhaken}>
      <input type="hidden" name="id" value={h.id} />
      {datum && <input type="hidden" name="datum" value={datum} />}
      {/* Leerer Wert heisst "Haken weg" — `txt()` liest ihn als falsch. */}
      <input type="hidden" name="getan" value={h.heuteGetan ? "" : "1"} />
      <button type="submit"
        className={cx(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
          "transition duration-150 ease-tactile hover:bg-sand/60 active:scale-[0.99]",
          h.heuteGetan ? "text-ink" : "text-ink-soft")}>
        <span aria-hidden
          className={cx(
            "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg border text-[12px]",
            h.heuteGetan
              ? "border-good/50 bg-good-tint text-good-bright"
              : "border-line-strong text-transparent")}
          style={h.heuteGetan ? undefined : { borderColor: h.farbe + "66" }}>
          ✓
        </span>

        <span className="min-w-0 flex-1 truncate">
          {h.icon && <span className="mr-1.5">{h.icon}</span>}
          {h.name}
        </span>

        {h.streak > 1 && (
          <span className="tabular shrink-0 text-[11px] text-ink-faint">
            {h.streak} Tage am Stück
          </span>
        )}

        <span className={cx("tabular shrink-0 text-xs",
          h.zielProWoche > 0 && h.dieseWoche >= h.zielProWoche
            ? "font-medium text-good" : "text-ink-muted")}>
          {h.dieseWoche}
          {h.zielProWoche > 0 && ` / ${h.zielProWoche}`}
          <span className="ml-1 text-ink-faint">diese Woche</span>
        </span>
      </button>
    </form>
  );
}
