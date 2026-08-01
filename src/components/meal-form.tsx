"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPlanMeal } from "@/lib/actions";
import { Button, Card, Input, Select, cx } from "@/components/ui";
import { MEAL_LABEL, MEAL_ORDER, istSnack } from "@/lib/menu-labels";
import { rechne, summe, einheitenFuer, type FoodValues } from "@/lib/nutrition";

export interface FoodOption extends FoodValues {
  id: string;
  name: string;
  unit: string;
}

export interface RezeptOption {
  id: string;
  name: string;
  meal_type: string;
  items: { food_id: string | null; food_name: string; amount_per_portion: number; unit: string }[];
}

interface Position {
  food_id: string | null;
  food_name: string;
  amount: number;
  unit: string;
}

/**
 * Mahlzeit anlegen — mit Lebensmittelsuche, Rezept als Startpunkt und
 * laufender Nährwertsumme. Ersetzt den Sprung in die alte Menü-App.
 */
export function MealForm({
  date, slot, foods, rezepte, onFertig,
}: {
  date: string;
  slot: string;
  foods: FoodOption[];
  rezepte: RezeptOption[];
  onFertig: () => void;
}) {
  const router = useRouter();
  const [mealType, setMealType] = useState(slot);
  const [name, setName] = useState("");
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [suche, setSuche] = useState("");
  const [busy, setBusy] = useState(false);
  const [rezeptSuche, setRezeptSuche] = useState("");
  // Standard: nur Rezepte, die zum Slot passen. Auf Wunsch auch die anderen.
  const [andereSorte, setAndereSorte] = useState(false);

  const nurSnacks = slot === "snack";

  const passendeRezepte = useMemo(
    () => (andereSorte
      ? rezepte
      : rezepte.filter((r) => istSnack(r.meal_type) === nurSnacks)),
    [rezepte, andereSorte, nurSnacks]
  );

  const sichtbareRezepte = useMemo(() => {
    const q = rezeptSuche.trim().toLowerCase();
    const liste = q
      ? passendeRezepte.filter((r) => r.name.toLowerCase().includes(q))
      : passendeRezepte;
    return liste.slice(0, 24);
  }, [passendeRezepte, rezeptSuche]);

  const foodById = useMemo(
    () => new Map(foods.map((f) => [f.id, f])), [foods]
  );

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
  }, [foods, suche]);

  /** Nährwerte einer Position - Lebensmittel ohne Bezug tragen 0 bei. */
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

  function rezeptUebernehmen(r: RezeptOption) {
    // Mengen im Rezept gelten pro Portion - eine freie Mahlzeit ist genau eine
    setPositionen(r.items.map((i) => ({
      food_id: i.food_id, food_name: i.food_name,
      amount: Number(i.amount_per_portion), unit: i.unit,
    })));
    if (!name) setName(r.name);
    setMealType(r.meal_type);
  }

  async function speichern() {
    if (!name.trim() || positionen.length === 0 || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("date", date);
    fd.set("meal_type", mealType);
    fd.set("name", name.trim());
    fd.set("items", JSON.stringify(
      positionen.map((p) => ({ ...p, ...werte(p) }))
    ));
    await createPlanMeal(fd);
    setBusy(false);
    onFertig();
    router.refresh();
  }

  return (
    <Card className="border-accent p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label htmlFor="mahlzeit-name" className="mb-1.5 block text-xs text-ink-muted">
            Name der Mahlzeit
          </label>
          <Input id="mahlzeit-name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Quark mit Beeren" />
        </div>
        <div className="w-40">
          <label htmlFor="mahlzeit-slot" className="mb-1.5 block text-xs text-ink-muted">
            Slot
          </label>
          <Select id="mahlzeit-slot" value={mealType}
            onChange={(e) => setMealType(e.target.value)}>
            {MEAL_ORDER.map((s) => (
              <option key={s} value={s}>{MEAL_LABEL[s]}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Rezept als Startpunkt */}
      {/* Rezepte passend zum Slot: im Snack-Slot Snacks, sonst Hauptmahlzeiten.
          Der Umschalter darunter holt die jeweils andere Sorte dazu, falls man
          doch etwas anderes einfuegen will. */}
      {rezepte.length > 0 && positionen.length === 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-muted">
              {nurSnacks ? "Snack einfügen" : "Hauptmahlzeit einfügen"}
            </span>
            <button onClick={() => setAndereSorte(!andereSorte)}
              className="text-xs text-accent-soft transition hover:underline">
              {andereSorte
                ? "nur passende zeigen"
                : nurSnacks ? "Hauptmahlzeiten zeigen" : "Snacks zeigen"}
            </button>
          </div>

          {passendeRezepte.length > 6 && (
            <Input value={rezeptSuche} onChange={(e) => setRezeptSuche(e.target.value)}
              placeholder="Rezept suchen …" aria-label="Rezept suchen"
              className="mb-2 text-base" />
          )}

          {sichtbareRezepte.length === 0 ? (
            <p className="text-xs text-ink-faint">
              Kein passendes Rezept. Leg unter Mehr → Rezepte eines an.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sichtbareRezepte.map((r) => (
                <button key={r.id} onClick={() => rezeptUebernehmen(r)}
                  className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs
                             text-ink-soft transition duration-150 ease-tactile
                             hover:border-line-strong hover:text-ink active:scale-95">
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lebensmittelsuche */}
      <div className="relative mb-3">
        <Input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder="Lebensmittel suchen …" aria-label="Lebensmittel suchen" />
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

      {/* Positionen */}
      {positionen.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Noch keine Zutat. Suchen und antippen — oder ein Rezept übernehmen.
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
                  className="w-20" aria-label={`Menge ${p.food_name}`} />
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
        </span>
        <span className="flex items-center gap-2">
          <button onClick={onFertig}
            className="text-xs text-ink-muted transition hover:text-ink-soft">
            Abbrechen
          </button>
          <Button onClick={speichern}
            disabled={busy || !name.trim() || positionen.length === 0}>
            {busy ? "…" : "Mahlzeit speichern"}
          </Button>
        </span>
      </div>

      <p className={cx("mt-2 text-xs text-ink-faint", positionen.length === 0 && "hidden")}>
        Mengen gelten für diese eine Mahlzeit. Als Vorlage für mehrere Portionen
        gehört sie unter Rezepte.
      </p>
    </Card>
  );
}
