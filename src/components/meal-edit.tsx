"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  renamePlanMeal, updatePlanMealItemAmount, deletePlanMealItem, addPlanMealItem,
} from "@/lib/actions";
import { Button, Card, Input } from "@/components/ui";
import { rechne, einheitenFuer } from "@/lib/nutrition";
import type { FoodOption } from "@/components/meal-form";

/**
 * Eine bereits geplante Mahlzeit bearbeiten: Name ändern, Mengen anpassen,
 * Zutaten entfernen oder ergänzen.
 *
 * Gilt für frei geplante Mahlzeiten UND für Boxen — Boxen werden beim
 * Bearbeiten vorher aus dem Zyklus gelöst (siehe convertPortionToMeal) und
 * sind ab dann normale Mahlzeiten dieses Tages.
 *
 * Jede Änderung geht sofort an die Datenbank, damit die Tagessummen (die per
 * Trigger fallen) nie auseinanderlaufen. Kein Sammel-Speichern.
 */
export function MealEdit({ meal, foods, onFertig }: {
  meal: {
    id: string;
    name: string;
    items: { id: string; food_name: string; amount: number; unit: string }[];
  };
  foods: FoodOption[];
  onFertig: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(meal.name);
  const [suche, setSuche] = useState("");
  const [busy, setBusy] = useState(false);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
  }, [foods, suche]);

  async function lauf(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); router.refresh(); }
    finally { setBusy(false); }
  }

  async function nameSpeichern() {
    const sauber = name.trim();
    if (!sauber || sauber === meal.name) return;
    const fd = new FormData();
    fd.set("id", meal.id);
    fd.set("name", sauber);
    await lauf(() => renamePlanMeal(fd));
  }

  async function mengeSetzen(itemId: string, wert: number) {
    if (!Number.isFinite(wert) || wert <= 0) return;
    const fd = new FormData();
    fd.set("id", itemId);
    fd.set("amount", String(wert));
    await lauf(() => updatePlanMealItemAmount(fd));
  }

  async function entfernen(itemId: string) {
    const fd = new FormData();
    fd.set("id", itemId);
    await lauf(() => deletePlanMealItem(fd));
  }

  async function anhaengen(f: FoodOption) {
    const einheit = einheitenFuer(f.unit)[0];
    const amount = einheit === "stk" ? 1 : 100;
    const w = rechne(f, amount, einheit);
    const fd = new FormData();
    fd.set("meal_id", meal.id);
    fd.set("items", JSON.stringify([{
      food_id: f.id, food_name: f.name, amount, unit: einheit, ...w,
    }]));
    setSuche("");
    await lauf(() => addPlanMealItem(fd));
  }

  return (
    <Card className="mb-2 border-accent p-4">
      <div className="mb-3">
        <label htmlFor={`edit-name-${meal.id}`} className="mb-1.5 block text-xs text-ink-muted">
          Name der Mahlzeit
        </label>
        <div className="flex items-center gap-2">
          <Input id={`edit-name-${meal.id}`} value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={nameSpeichern}
            onKeyDown={(e) => e.key === "Enter" && nameSpeichern()}
            className="min-w-0 flex-1 text-base" />
        </div>
      </div>

      {/* Zutat ergänzen */}
      <div className="relative mb-3">
        <Input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder="Zutat hinzufügen …" aria-label="Zutat suchen"
          className="text-base" />
        {treffer.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
            {treffer.map((f) => (
              <li key={f.id}>
                <button onClick={() => anhaengen(f)} disabled={busy}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-sand disabled:opacity-40">
                  <span className="min-w-0 truncate text-ink">{f.name}</span>
                  <span className="tabular shrink-0 text-xs text-ink-muted">
                    {Math.round(f.calories_per_100)} kcal / 100 {f.unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Positionen */}
      {meal.items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Keine Zutaten mehr. Oben eine suchen und antippen.
        </p>
      ) : (
        <ul className="divide-y divide-line/70">
          {meal.items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {it.food_name}
              </span>
              <Input type="number" min={0} step="any" defaultValue={it.amount}
                onBlur={(e) => mengeSetzen(it.id, Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="w-24 text-base" aria-label={`Menge ${it.food_name}`} />
              {/* Einheit steht fest: sie ändern hiesse, die Nährwerte aus dem
                  Lebensmittel neu zu rechnen. Zutat entfernen und neu
                  hinzufügen ist dafür der klarere Weg. */}
              <span className="w-12 shrink-0 text-xs text-ink-muted">{it.unit}</span>
              <button onClick={() => entfernen(it.id)} disabled={busy}
                aria-label={`${it.food_name} entfernen`}
                className="px-1 text-sm text-ink-faint transition hover:text-bad disabled:opacity-40">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-xs text-ink-faint">
          Änderungen werden sofort gespeichert.
        </span>
        <Button onClick={() => { void nameSpeichern().then(onFertig); }} disabled={busy}>
          {busy ? "…" : "Fertig"}
        </Button>
      </div>
    </Card>
  );
}
