import Link from "next/link";
import { PrepPlanner } from "@/components/prep-planner";
import { Card, CardTitle, Empty } from "@/components/ui";
import {
  fetchCycles, fetchRecipes, fetchPrepStand, menuConfigured,
} from "@/lib/supabase/menu";
import { heuteISO } from "@/lib/time";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EssenPrepPage() {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const [cycles, rezepte, stand] = await Promise.all([
    fetchCycles(), fetchRecipes(), fetchPrepStand(),
  ]);

  return (
    <>
      {stand && (
        <Card>
          <CardTitle>Kühlschrank</CardTitle>
          <p className="text-sm text-ink">
            {stand.tage === null
              ? "Keine Boxen einem Tag zugeordnet."
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
            {stand.offeneEinkaeufe > 0 && (
              <>
                {" · "}
                <Link href="/m/Essen/einkauf" className="text-accent-soft hover:underline">
                  {stand.offeneEinkaeufe} Posten offen
                </Link>
              </>
            )}
          </p>
        </Card>
      )}

      <PrepPlanner
        cycles={cycles}
        heute={heuteISO()}
        rezepte={rezepte.map((r) => ({
          id: r.id, name: r.name, meal_type: r.meal_type,
          default_portions: r.default_portions,
        }))}
      />
    </>
  );
}
