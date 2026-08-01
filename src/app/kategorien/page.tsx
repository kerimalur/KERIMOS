import { createClient } from "@/lib/supabase/server";
import { createCategory, deleteCategory } from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, Select, Badge, Empty } from "@/components/ui";
import { chf } from "@/lib/format";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KategorienPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories").select("*").eq("archived", false)
    .order("kind").order("sort_order").order("name");
  const cats = (data ?? []) as Category[];

  const groups: [string, Category[]][] = [
    ["Ausgaben", cats.filter((c) => c.kind === "expense")],
    ["Einnahmen", cats.filter((c) => c.kind === "income")],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Kategorien</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Als <span className="text-ink-soft">fix</span> markierte Ausgaben fallen ohnehin an -
          sie sind die Basis der Fixkosten-Rechnung.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {groups.map(([title, list]) => (
            <Card key={title}>
              <CardTitle>{title}</CardTitle>
              {list.length === 0 ? (
                <Empty>Keine Kategorien.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {list.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: c.color }} />
                        <span className="text-sm text-ink">{c.name}</span>
                        {c.is_fixed && <Badge tone="accent">fix</Badge>}
                        {c.monthly_budget != null && (
                          <Badge>Budget {chf(Number(c.monthly_budget))}</Badge>
                        )}
                      </span>
                      <form action={deleteCategory}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-ink-muted transition hover:text-bad">
                          löschen
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <CardTitle>Kategorie hinzufügen</CardTitle>
          <form action={createCategory} className="space-y-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="kind">Art</Label>
              <Select id="kind" name="kind" defaultValue="expense">
                <option value="expense">Ausgabe</option>
                <option value="income">Einnahme</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="monthly_budget">Monatsbudget (optional)</Label>
              <Input id="monthly_budget" name="monthly_budget" type="number" step="10" />
            </div>
            <div>
              <Label htmlFor="color">Farbe</Label>
              <input id="color" name="color" type="color" defaultValue="#9A8C74"
                className="h-9 w-full rounded-lg border border-line bg-card" />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="is_fixed"
                className="h-4 w-4 rounded border-line bg-card" />
              Fixkosten
            </label>
            <Button type="submit" className="w-full">Anlegen</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
