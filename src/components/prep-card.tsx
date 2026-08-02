import Link from "next/link";
import { fetchPrepStand } from "@/lib/supabase/menu";
import { Card } from "@/components/ui";

/**
 * Meal Prep: wie weit die Boxen reichen und was als Nächstes ansteht.
 *
 * Die Karte entscheidet nichts selbst, sie stellt die Frage und bietet die
 * drei Wege an: schon gekocht, Einkaufsliste schreiben, Menü planen. Sie
 * erscheint nur, wenn tatsächlich etwas ansteht - sonst ist sie weg.
 *
 * Alle Wege führen in den Essen-Bereich von KerimOS. Die frühere
 * eigenständige Menü-App wird nicht mehr angesteuert.
 */
export async function PrepCard() {
  const stand = await fetchPrepStand();
  if (!stand) return null;

  const knapp = stand.tage === null || stand.tage <= 2;
  const luecken = stand.ungeplant > 0;
  if (!knapp && !luecken && stand.offeneEinkaeufe === 0) return null;

  // Konkretes Datum statt abstrakter Tageszahl: "reicht noch 3 Tage" zwingt
  // zum Kopfrechnen, "bis Mittwoch" nicht.
  const bisLabel = stand.bis
    ? new Date(stand.bis + "T12:00:00").toLocaleDateString("de-CH", {
        weekday: "long", day: "2-digit", month: "2-digit",
      })
    : null;

  const lage =
    stand.tage === null ? "Keine vorgekochten Boxen mehr im Kühlschrank."
      : stand.tage === 0 ? "Die letzte Box ist für heute."
        : `Boxen reichen bis ${bisLabel} — noch ${stand.tage} ${
            stand.tage === 1 ? "Tag" : "Tage"}.`;

  const knopf =
    "rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink-soft " +
    "transition hover:border-line-strong hover:text-ink";

  return (
    <Card className="p-5">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        Meal Prep
      </div>

      <p className="text-sm text-ink">{lage}</p>
      {(luecken || stand.offeneEinkaeufe > 0) && (
        <p className="mt-0.5 text-xs text-ink-muted">
          {luecken && `${stand.ungeplant} der nächsten 7 Tage noch ohne Plan`}
          {luecken && stand.offeneEinkaeufe > 0 && " · "}
          {stand.offeneEinkaeufe > 0 && `${stand.offeneEinkaeufe} Posten offen`}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/m/Essen/prep" className={knopf}>
          Schon geprept — Boxen eintragen
        </Link>
        <Link href="/m/Essen/einkauf" className={knopf}>
          Einkaufsliste schreiben
        </Link>
        <Link href="/m/Essen/plan?ansicht=woche" className={knopf}>
          Menü planen
        </Link>
      </div>
    </Card>
  );
}
