"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createFood, updateFood, deleteFood } from "@/lib/actions";
import { Button, Card, CardTitle, Empty, Input, Select } from "@/components/ui";

interface Food {
  id: string;
  name: string;
  calories_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  cost_per_100: number;
  unit: string;
}

/**
 * Lebensmittel-Datenbank. Alle Werte beziehen sich auf 100 Gramm bzw. 100
 * Milliliter - bei Stück auf ein Stück. Aus diesen Zahlen rechnet alles
 * andere: Rezepte, Mahlzeiten, Prep-Töpfe.
 */
export function FoodList({ foods }: { foods: Food[] }) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [neu, setNeu] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods;
  }, [foods, suche]);

  async function lauf(action: (fd: FormData) => Promise<void>, fd: FormData) {
    if (busy) return;
    setBusy(true);
    await action(fd);
    setBusy(false);
    setOffen(null);
    router.refresh();
  }

  const zahl = (label: string, name: string, wert?: number) => (
    <div className="w-24">
      <label className="mb-1 block text-xs text-ink-muted">{label}</label>
      <Input name={name} type="number" min={0} step="any"
        defaultValue={wert ?? ""} placeholder="0" />
    </div>
  );

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="mb-0">Lebensmittel</CardTitle>
        <button onClick={() => setNeu(!neu)}
          className="text-xs font-medium text-accent-soft transition hover:underline">
          {neu ? "Schliessen" : "+ Neues Lebensmittel"}
        </button>
      </div>

      {neu && (
        <form action={(fd) => lauf(createFood, fd)}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-sand/60 p-3">
          <div className="min-w-40 flex-1">
            <label htmlFor="f-name" className="mb-1 block text-xs text-ink-muted">Name</label>
            <Input id="f-name" name="name" required placeholder="z.B. Magerquark" />
          </div>
          <div className="w-24">
            <label htmlFor="f-unit" className="mb-1 block text-xs text-ink-muted">Einheit</label>
            <Select id="f-unit" name="unit" defaultValue="g">
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="stk">Stück</option>
            </Select>
          </div>
          {zahl("kcal", "kcal")}
          {zahl("Protein", "protein")}
          {zahl("KH", "carbs")}
          {zahl("Fett", "fat")}
          {zahl("CHF", "cost")}
          <Button type="submit">Anlegen</Button>
          <p className="w-full text-xs text-ink-muted">
            Werte pro 100 g bzw. 100 ml — bei Stück pro Stück.
          </p>
        </form>
      )}

      <Input value={suche} onChange={(e) => setSuche(e.target.value)}
        placeholder={`${foods.length} Lebensmittel — suchen …`} className="mb-3" />

      {sichtbar.length === 0 ? (
        <Empty>Nichts gefunden.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {sichtbar.slice(0, 120).map((f) => (
            <li key={f.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setOffen(offen === f.id ? null : f.id)}
                  className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm text-ink">{f.name}</span>
                  <span className="tabular block text-xs text-ink-muted">
                    {Math.round(f.calories_per_100)} kcal · {f.protein_per_100} g P
                    {f.carbs_per_100 > 0 && ` · ${f.carbs_per_100} g KH`}
                    {f.fat_per_100 > 0 && ` · ${f.fat_per_100} g F`}
                    {f.cost_per_100 > 0 && ` · CHF ${f.cost_per_100.toFixed(2)}`}
                    {" "}/ 100 {f.unit}
                  </span>
                </button>
                <button onClick={() => lauf(deleteFood, formOf({ id: f.id }))}
                  aria-label="Lebensmittel löschen"
                  className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad">
                  ✕
                </button>
              </div>

              {offen === f.id && (
                <form action={(fd) => lauf(updateFood, fd)}
                  className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-sand/50 p-3">
                  <input type="hidden" name="id" value={f.id} />
                  <div className="min-w-36 flex-1">
                    <label className="mb-1 block text-xs text-ink-muted">Name</label>
                    <Input name="name" defaultValue={f.name} />
                  </div>
                  {zahl("kcal", "kcal", f.calories_per_100)}
                  {zahl("Protein", "protein", f.protein_per_100)}
                  {zahl("KH", "carbs", f.carbs_per_100)}
                  {zahl("Fett", "fat", f.fat_per_100)}
                  {zahl("CHF", "cost", f.cost_per_100)}
                  <Button variant="ghost" type="submit">Speichern</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {sichtbar.length > 120 && (
        <p className="mt-3 text-xs text-ink-muted">
          {sichtbar.length - 120} weitere — Suche eingrenzen.
        </p>
      )}
    </Card>
  );
}

function formOf(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}
