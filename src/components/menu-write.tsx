"use client";
import { useMemo, useState } from "react";
import { createRecipeWithItems } from "@/lib/actions";
import { Button, Card, Input, Select } from "@/components/ui";
import { MEAL_LABEL, MEAL_ORDER } from "@/lib/menu-labels";
import { rechne, summe, einheitenFuer } from "@/lib/nutrition";
import type { FoodOption } from "@/components/meal-form";

interface Position {
  food_id: string | null;
  food_name: string;
  amount: number;
  unit: string;
}

/**
 * Menü direkt hinschreiben, statt eines aus der Rezeptliste zu wählen.
 *
 * Mengen gelten für GENAU EINE PORTION — so werden recipe_items ohnehin
 * gespeichert. Wie oft das Menü gekocht wird, entscheidet der Zeitraum im
 * Prep-Planer (eine Portion pro Tag), nicht dieses Formular.
 *
 * Unter der Haube entsteht ein normales Rezept, weil ein Topf eine recipe_id
 * braucht — nur so greifen Einkaufsliste, Kochliste und Nährwerte. Das Menü
 * taucht daher auch unter Rezepte auf und kann dort wiederverwendet werden.
 */
export function MenuWrite({ foods, boxen, onFertig }: {
  foods: FoodOption[];
  /** Anzahl Boxen aus dem Zeitraum — nur als Hinweis und Startwert. */
  boxen: number;
  onFertig: (rezept?: { id: string; name: string; meal_type: string }) => void;
}) {
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState("mittagessen");
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [suche, setSuche] = useState("");
  const [busy, setBusy] = useState(false);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
  }, [foods, suche]);

  const werte = (p: Position) => {
    const f = p.food_id ? foodById.get(p.food_id) : undefined;
    return f ? rechne(f, p.amount, p.unit)
      : { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
  };

  const gesamt = summe(positionen.map(werte));

  function hinzufuegen(f: FoodOption) {
    const einheit = einheitenFuer(f.unit)[0];
    setPositionen((p) => [...p, {
      food_id: f.id, food_name: f.name,
      amount: einheit === "stk" ? 1 : 100, unit: einheit,
    }]);
    setSuche("");
  }

  async function speichern() {
    if (!name.trim() || positionen.length === 0 || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("meal_type", mealType);
    fd.set("portions", String(Math.max(1, boxen)));
    fd.set("items", JSON.stringify(positionen));
    try {
      const id = await createRecipeWithItems(fd);
      if (id) onFertig({ id, name: name.trim(), meal_type: mealType });
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <Card className="border-accent p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label htmlFor="menu-name" className="mb-1.5 block text-xs text-ink-muted">
            Name des Menüs
          </label>
          <Input id="menu-name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Poulet mit Reis und Broccoli" className="text-base" />
        </div>
        <div className="w-40">
          <label htmlFor="menu-slot" className="mb-1.5 block text-xs text-ink-muted">
            Slot
          </label>
          <Select id="menu-slot" value={mealType}
            onChange={(e) => setMealType(e.target.value)}>
            {MEAL_ORDER.map((s) => (
              <option key={s} value={s}>{MEAL_LABEL[s]}</option>
            ))}
          </Select>
        </div>
      </div>

      <p className="mb-3 rounded-xl bg-sand/60 px-3 py-2 text-xs text-ink-soft">
        Mengen für <span className="font-medium text-ink">eine Portion</span> eintragen.
        Der Zeitraum ergibt <span className="font-medium text-ink">{boxen} Boxen</span> —
        so oft wird gekocht.
      </p>

      {/* Zutatensuche */}
      <div className="relative mb-3">
        <Input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder="Lebensmittel suchen …" aria-label="Lebensmittel suchen"
          className="text-base" />
        {treffer.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
            {treffer.map((f) => (
              <li key={f.id}>
                <button onClick={() => hinzufuegen(f)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-sand">
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

      {positionen.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Noch keine Zutat. Suchen und antippen.
        </p>
      ) : (
        <ul className="divide-y divide-line/70">
          {positionen.map((p, i) => {
            const f = p.food_id ? foodById.get(p.food_id) : undefined;
            const w = werte(p);
            return (
              <li key={i} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {p.food_name}
                </span>
                <Input type="number" min={0} step="any" value={p.amount}
                  onChange={(e) => {
                    const wert = Number(e.target.value);
                    setPositionen((list) => list.map((x, j) =>
                      j === i ? { ...x, amount: Number.isFinite(wert) ? wert : 0 } : x));
                  }}
                  className="w-24 text-base" aria-label={`Menge ${p.food_name}`} />
                <Select value={p.unit}
                  onChange={(e) => setPositionen((list) => list.map((x, j) =>
                    j === i ? { ...x, unit: e.target.value } : x))}
                  className="w-20" aria-label={`Einheit ${p.food_name}`}>
                  {einheitenFuer(f?.unit ?? "g").map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
                <span className="tabular w-24 shrink-0 text-right text-xs text-ink-muted">
                  {Math.round(w.kcal)} kcal
                </span>
                <button onClick={() => setPositionen((list) => list.filter((_, j) => j !== i))}
                  aria-label={`${p.food_name} entfernen`}
                  className="px-1 text-sm text-ink-faint transition hover:text-bad">✕</button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className="tabular text-sm text-ink-soft">
          {Math.round(gesamt.kcal)} kcal · {Math.round(gesamt.protein)} g Protein
          {gesamt.cost > 0 && ` · CHF ${gesamt.cost.toFixed(2)}`}
          <span className="text-ink-faint"> je Portion</span>
        </span>
        <span className="flex items-center gap-2">
          <button onClick={() => onFertig()}
            className="text-xs text-ink-muted transition hover:text-ink-soft">
            Abbrechen
          </button>
          <Button onClick={speichern}
            disabled={busy || !name.trim() || positionen.length === 0}>
            {busy ? "…" : `Als Topf übernehmen (${Math.max(1, boxen)} Boxen)`}
          </Button>
        </span>
      </div>
    </Card>
  );
}
