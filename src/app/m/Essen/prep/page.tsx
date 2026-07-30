import Link from "next/link";
import { Card, CardTitle, Empty } from "@/components/ui";
import { fetchPrepStand } from "@/lib/supabase/menu";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const MENU_APP = "https://men-plan-kerim-alurs-projects.vercel.app";

/**
 * Prep-Stand in KerimOS, Bearbeiten noch in der Menü-App.
 * Nächster Schritt der Übernahme: Zyklen, Töpfe und Kochliste hierher holen.
 */
export default async function EssenPrepPage() {
  const stand = await fetchPrepStand();
  if (!stand) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const knopf =
    "rounded-xl border border-line bg-card px-3.5 py-2 text-sm text-ink-soft " +
    "transition hover:border-line-strong hover:text-ink";

  return (
    <>
      <Card>
        <CardTitle>Kühlschrank</CardTitle>
        <p className="text-sm text-ink">
          {stand.tage === null
            ? "Keine vorgekochten Boxen zugeordnet."
            : stand.tage === 0
              ? "Die letzte Box ist für heute."
              : `Boxen reichen noch ${stand.tage} ${stand.tage === 1 ? "Tag" : "Tage"}`}
          {stand.bis && stand.tage !== null && stand.tage > 0 && (
            <span className="text-ink-muted"> — bis {dateLabel(stand.bis)}</span>
          )}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {stand.ungeplant > 0
            ? `${stand.ungeplant} von 7 Tagen ungeplant`
            : "Die nächsten 7 Tage sind geplant"}
          {stand.offeneEinkaeufe > 0 && ` · ${stand.offeneEinkaeufe} Posten offen`}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`${MENU_APP}/prep`} target="_blank" rel="noopener noreferrer"
            className={knopf}>
            Zyklus planen oder kochen ↗
          </Link>
          <Link href="/m/Essen/einkauf" className={knopf}>Einkaufsliste</Link>
          <Link href="/m/Essen/plan?ansicht=woche" className={knopf}>Wochenplan</Link>
        </div>
      </Card>

      <p className="text-xs text-ink-muted">
        Zyklen, Töpfe und Kochliste liegen noch in der Menü-App. Sie sind der
        nächste Schritt der Übernahme — die Daten sind dieselben, es fehlt nur
        die Oberfläche hier.
      </p>
    </>
  );
}
