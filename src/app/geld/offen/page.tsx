import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchOffeneGruppen } from "@/lib/uncategorized";
import { categorizeGroup, markAsTransfer } from "@/lib/geld-actions";
import { Card, CardTitle, Select, Button, Empty } from "@/components/ui";
import { chf, dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Buchungen ohne Kategorie zuordnen.
 *
 * Gebündelt nach Empfänger: eine Entscheidung deckt alle Buchungen desselben
 * Ladens ab. Die grössten Posten stehen oben, dort bringt das Zuordnen am
 * meisten für die Auswertung.
 */
export default async function GeldOffenPage() {
  const supabase = await createClient();

  const [gruppen, { data: kategorien }] = await Promise.all([
    fetchOffeneGruppen(),
    supabase.from("categories").select("id, name, kind").order("name"),
  ]);

  const ausgaben = (kategorien ?? []).filter((k) => k.kind === "expense");
  const offenSumme = gruppen.reduce((s, g) => s + g.summe, 0);
  const offenAnzahl = gruppen.reduce((s, g) => s + g.anzahl, 0);

  return (
    <div className="space-y-5 py-6">
      <div>
        <Link href="/geld" className="text-xs text-ink-muted transition hover:text-ink-soft">
          ← Geld
        </Link>
        <h1 className="font-display mt-1 text-xl font-bold text-ink">
          Nicht zugeordnet
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          {offenAnzahl === 0
            ? "Alles zugeordnet."
            : `${offenAnzahl} Buchungen über ${chf(offenSumme)} in ${gruppen.length}
               Gruppen. Eine Zuordnung gilt für alle Buchungen desselben Empfängers
               — auch für künftige mit gleichem Text.`}
        </p>
      </div>

      {gruppen.length === 0 ? (
        <Empty>Nichts offen. Jede Ausgabe hat eine Kategorie.</Empty>
      ) : (
        <div className="space-y-2">
          {gruppen.map((g) => (
            <Card key={g.empfaenger} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {g.empfaenger}
                </span>
                <span className="tabular shrink-0 text-sm text-ink">
                  {chf(g.summe)}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {g.anzahl}× · zuletzt {dateLabel(g.zuletzt)}
                </span>
              </div>

              <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
                {g.beispiel}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <form action={categorizeGroup} className="flex flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="ids" value={g.ids.join(",")} />
                  <Select name="categoryId" required defaultValue=""
                    className="min-w-0 flex-1 sm:max-w-[18rem]">
                    <option value="" disabled>Kategorie wählen…</option>
                    {ausgaben.map((k) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </Select>
                  <Button type="submit" className="shrink-0">Zuordnen</Button>
                </form>

                {/* Eigene Umbuchungen sind keine Ausgaben und würden die
                    Auswertung verfälschen. */}
                <form action={markAsTransfer}>
                  <input type="hidden" name="ids" value={g.ids.join(",")} />
                  <Button type="submit" variant="ghost" className="shrink-0 text-xs">
                    Umbuchung
                  </Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
