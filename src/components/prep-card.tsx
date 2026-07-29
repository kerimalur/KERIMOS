import Link from "next/link";
import { fetchPrepStand } from "@/lib/supabase/menu";
import { Card } from "@/components/ui";

const MENU_APP = "https://men-plan-kerim-alurs-projects.vercel.app";

/**
 * Meal Prep: wie weit die Boxen reichen und was als Nächstes ansteht.
 *
 * Die Karte entscheidet nichts selbst, sie stellt die Frage und bietet die
 * drei Wege an: schon gekocht, Einkaufsliste schreiben, Menü planen. Sie
 * erscheint nur, wenn tatsächlich etwas ansteht - sonst ist sie weg.
 */
export async function PrepCard() {
  const stand = await fetchPrepStand();
  if (!stand) return null;

  const knapp = stand.tage === null || stand.tage <= 2;
  const luecken = stand.ungeplant > 0;
  if (!knapp && !luecken && stand.offeneEinkaeufe === 0) return null;

  const lage =
    stand.tage === null ? "Keine vorgekochten Boxen mehr im Kühlschrank."
      : stand.tage === 0 ? "Die letzte Box ist für heute."
        : `Boxen reichen noch ${stand.tage} ${stand.tage === 1 ? "Tag" : "Tage"}.`;

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
          {luecken && `${stand.ungeplant} von 7 Tagen ungeplant`}
          {luecken && stand.offeneEinkaeufe > 0 && " · "}
          {stand.offeneEinkaeufe > 0 && `${stand.offeneEinkaeufe} Posten offen`}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`${MENU_APP}/prep`} target="_blank" rel="noopener noreferrer"
          className={knopf}>
          Schon geprept — Boxen eintragen
        </Link>
        <Link href={`${MENU_APP}/einkaufsliste`} target="_blank" rel="noopener noreferrer"
          className={knopf}>
          Einkaufsliste schreiben
        </Link>
        <Link href={`${MENU_APP}/plan`} target="_blank" rel="noopener noreferrer"
          className={knopf}>
          Menü planen
        </Link>
        <Link href="/m/Essen" className={knopf}>
          Übersicht
        </Link>
      </div>
    </Card>
  );
}
