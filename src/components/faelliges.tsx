import { createClient } from "@/lib/supabase/server";
import { heuteISO, addDays } from "@/lib/time";
import { dateLabel } from "@/lib/format";
import { Card, CardTitle, Badge } from "@/components/ui";

/**
 * Was fällig ist — im Wochenrückblick.
 *
 * Ein Rückblick, der nur zurückschaut, lässt genau das liegen, was gerade
 * kippt. Deshalb steht hier, was überfällig ist und was in den nächsten
 * sieben Tagen dran ist — und zwar bevor man über die vergangene Woche
 * nachdenkt, nicht danach.
 *
 * Zeigt nichts an, wenn nichts fällig ist. Eine Karte mit „alles erledigt"
 * ist Dekoration; sie kostet Platz und trainiert einem an, sie zu übersehen.
 */
export async function Faelliges() {
  const db = await createClient();
  const heute = heuteISO();
  const grenze = addDays(heute, 7);

  const { data } = await db.from("tasks")
    .select("id, title, due_on, priority")
    .is("done_at", null)
    .not("due_on", "is", null)
    .lte("due_on", grenze)
    .order("due_on", { ascending: true });

  const aufgaben = (data ?? []) as {
    id: string; title: string; due_on: string; priority: number;
  }[];
  if (aufgaben.length === 0) return null;

  const ueberfaellig = aufgaben.filter((a) => a.due_on < heute);
  const heuteFaellig = aufgaben.filter((a) => a.due_on === heute);
  const demnaechst = aufgaben.filter((a) => a.due_on > heute);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CardTitle className="mb-0">Fällig</CardTitle>
        {ueberfaellig.length > 0 && (
          <Badge tone="bad">{ueberfaellig.length} überfällig</Badge>
        )}
        {heuteFaellig.length > 0 && <Badge tone="warn">{heuteFaellig.length} heute</Badge>}
      </div>

      <ul className="space-y-1.5">
        {[...ueberfaellig, ...heuteFaellig, ...demnaechst].map((a) => {
          const spaet = a.due_on < heute;
          const jetzt = a.due_on === heute;
          return (
            <li key={a.id}
              className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                spaet ? "bg-bad-tint" : jetzt ? "bg-warn-tint" : "bg-sand/60"}`}>
              <span className="min-w-0 flex-1 truncate text-ink">{a.title}</span>
              {a.priority > 0 && <Badge tone="accent">wichtig</Badge>}
              <span className={`tabular shrink-0 text-xs ${
                spaet ? "text-bad-bright" : jetzt ? "text-accent" : "text-ink-muted"}`}>
                {spaet ? `${dateLabel(a.due_on)} — überfällig`
                  : jetzt ? "heute" : dateLabel(a.due_on)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
