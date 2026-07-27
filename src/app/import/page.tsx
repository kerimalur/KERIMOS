import { createClient } from "@/lib/supabase/server";
import { CsvImport } from "@/components/csv-import";
import {
  createImportRule, deleteImportRule, applyRulesToUncategorized, seedImportRules,
} from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, Select, Badge, Empty } from "@/components/ui";
import type { Account, Category, ImportRule } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const supabase = await createClient();
  const [{ data: accs }, { data: cats }, { data: rules }] = await Promise.all([
    supabase.from("accounts").select("*").eq("archived", false).order("sort_order"),
    supabase.from("categories").select("*").eq("archived", false).order("kind").order("name"),
    supabase.from("import_rules").select("*").order("priority"),
  ]);

  const categories = (cats ?? []) as Category[];
  const ruleList = (rules ?? []) as ImportRule[];
  const catById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Import</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Lade den Auszug deiner Bank hoch — als echte CSV-Datei oder als Kontoauszug
          im Textformat, wie ihn Raiffeisen und andere ausgeben. KerimOS erkennt das
          Format selbst, rechnet die Summen gegen die Totale des Auszugs und überspringt
          alles, was schon erfasst ist.
        </p>
      </div>

      <CsvImport accounts={(accs ?? []) as Account[]} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="mb-0">Zuordnungs-Regeln</CardTitle>
            <form action={applyRulesToUncategorized}>
              <Button variant="ghost" type="submit">
                Auf offene Buchungen anwenden
              </Button>
            </form>
          </div>
          {ruleList.length === 0 ? (
            <div className="space-y-3">
              <Empty>
                Noch keine Regeln. Eine Regel wie „migros → Lebensmittel“ spart dir jeden
                Monat das Sortieren.
              </Empty>
              <form action={seedImportRules}>
                <Button type="submit" variant="ghost" className="w-full">
                  Schweizer Standard-Regeln anlegen
                </Button>
              </form>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {ruleList.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge>{r.match_type === "contains" ? "enthält" :
                      r.match_type === "starts_with" ? "beginnt mit" : "Regex"}</Badge>
                    <code className="rounded bg-card px-1.5 py-0.5 text-xs text-accent">
                      {r.pattern}
                    </code>
                    <span className="text-ink-muted">→</span>
                    <span className="text-ink">
                      {catById.get(r.category_id)?.name ?? "unbekannt"}
                    </span>
                  </div>
                  <form action={deleteImportRule}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-ink-muted transition hover:text-bad">
                      löschen
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardTitle>Regel hinzufügen</CardTitle>
          <form action={createImportRule} className="space-y-3">
            <div>
              <Label htmlFor="pattern">Suchbegriff</Label>
              <Input id="pattern" name="pattern" required placeholder="z. B. migros" />
            </div>
            <div>
              <Label htmlFor="match_type">Vergleich</Label>
              <Select id="match_type" name="match_type" defaultValue="contains">
                <option value="contains">enthält</option>
                <option value="starts_with">beginnt mit</option>
                <option value="regex">Regex</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="match_field">Feld</Label>
              <Select id="match_field" name="match_field" defaultValue="description">
                <option value="description">Bezeichnung</option>
                <option value="counterparty">Gegenpartei</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="category_id">Kategorie</Label>
              <Select id="category_id" name="category_id" required defaultValue="">
                <option value="" disabled>— wählen —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.kind === "income" ? "Ein" : "Aus"})
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" className="w-full">Regel anlegen</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
