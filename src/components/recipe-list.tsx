"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateRecipe, deleteRecipe,
  addRecipeItem, updateRecipeItemAmount, deleteRecipeItem,
} from "@/lib/actions";
import { MenuWrite } from "@/components/menu-write";
import { Button, Card, CardTitle, Empty, Input, Select, cx } from "@/components/ui";
import { RECIPE_KINDS, istSnack, recipeKindLabel } from "@/lib/menu-labels";
import { rechne, summe, einheitenFuer, type FoodValues } from "@/lib/nutrition";

interface Food extends FoodValues { id: string; name: string; unit: string }
interface Item {
  id: string; food_id: string | null; food_name: string;
  amount_per_portion: number; unit: string; sort_order: number;
}
interface Recipe {
  id: string; name: string; meal_type: string; category_id: string | null; status: string;
  freetext: string; default_portions: number; is_favorite: boolean; items: Item[];
}
interface Category { id: string; name: string }

/**
 * Rezepte: Mengen pro Portion, alles direkt bearbeitbar.
 * Ein Rezept ist die Vorlage - was daraus wird, entscheidet der Prep-Zyklus
 * (mal drei Portionen) oder eine einzelne Mahlzeit (genau eine).
 */
export function RecipeList({
  recipes, foods, categories,
}: { recipes: Recipe[]; foods: Food[]; categories: Category[] }) {
  const router = useRouter();
  const [offen, setOffen] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const [suche, setSuche] = useState("");
  const [filter, setFilter] = useState("");
  const [kategorieFilter, setKategorieFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const kategorieName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])), [categories]
  );

  const sichtbar = useMemo(() => recipes.filter((r) => {
    // "haupt" fasst alles zusammen, was kein Snack ist - auch Altbestand,
    // der noch als Fruehstueck oder Abendessen abgelegt wurde.
    if (filter === "snack" && !istSnack(r.meal_type)) return false;
    if (filter === "haupt" && istSnack(r.meal_type)) return false;
    if (kategorieFilter && r.category_id !== kategorieFilter) return false;
    if (!suche.trim()) return true;
    const q = suche.trim().toLowerCase();
    return r.name.toLowerCase().includes(q)
      || r.items.some((i) => i.food_name.toLowerCase().includes(q));
  }), [recipes, filter, kategorieFilter, suche]);

  const naehrwerte = (r: Recipe) => summe(r.items.map((i) => {
    const f = i.food_id ? foodById.get(i.food_id) : undefined;
    return f ? rechne(f, i.amount_per_portion, i.unit) : {};
  }));

  async function lauf(action: (fd: FormData) => Promise<void>, fd: FormData) {
    if (busy) return;
    setBusy(true);
    await action(fd);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="mb-0">Rezepte</CardTitle>
          <button onClick={() => setNeu(!neu)}
            className="text-xs font-medium text-accent-soft transition hover:underline">
            {neu ? "Schliessen" : "+ Neues Rezept"}
          </button>
        </div>

        {/* Neues Rezept: Name und Zutaten in einem Schritt. Vorher musste man
            erst anlegen und die Zutaten danach einzeln nachtragen - das war
            der haeufigste Grund fuer leere Rezepte. */}
        {neu && (
          <div className="mb-4">
            <MenuWrite
              foods={foods}
              categories={categories}
              onFertig={() => { setNeu(false); router.refresh(); }}
            />
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input value={suche} onChange={(e) => setSuche(e.target.value)}
            placeholder="Rezept oder Zutat suchen …" className="min-w-48 flex-1" />
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">
            <option value="">Hauptmahlzeit und Snack</option>
            <option value="haupt">Nur Hauptmahlzeiten</option>
            <option value="snack">Nur Snacks</option>
          </Select>
          {categories.length > 0 && (
            <Select value={kategorieFilter} onChange={(e) => setKategorieFilter(e.target.value)}
              className="w-40">
              <option value="">Alle Vorlagen</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </div>

        {sichtbar.length === 0 ? (
          <Empty>Kein Rezept gefunden.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {sichtbar.map((r) => {
              const n = naehrwerte(r);
              const auf = offen === r.id;
              return (
                <li key={r.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => lauf(updateRecipe, formOf({
                      id: r.id, favorite: String(!r.is_favorite),
                    }))}
                      aria-label={r.is_favorite ? "Kein Favorit" : "Favorit"}
                      className={cx("shrink-0 text-sm transition",
                        r.is_favorite ? "text-warn" : "text-ink-faint hover:text-ink-muted")}>
                      ★
                    </button>
                    <button onClick={() => setOffen(auf ? null : r.id)}
                      className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium text-ink">
                        {r.name}
                      </span>
                      <span className="tabular block text-xs text-ink-muted">
                        {recipeKindLabel(r.meal_type)} ·{" "}
                        {Math.round(n.kcal)} kcal · {Math.round(n.protein)} g P je Portion
                        {r.items.length > 0 && ` · ${r.items.length} Zutaten`}
                        {r.category_id && kategorieName.get(r.category_id) &&
                          ` · ${kategorieName.get(r.category_id)}`}
                      </span>
                    </button>
                    <button onClick={() => lauf(deleteRecipe, formOf({ id: r.id }))}
                      aria-label="Rezept löschen"
                      className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad">
                      ✕
                    </button>
                  </div>

                  {auf && (
                    <div className="mt-3 rounded-xl bg-sand/50 p-3">
                      {r.items.length === 0 ? (
                        <p className="text-sm text-ink-muted">Noch keine Zutat.</p>
                      ) : (
                        <ul className="divide-y divide-line/70">
                          {r.items.map((i) => (
                            <li key={i.id} className="flex flex-wrap items-center gap-2 py-1.5">
                              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                                {i.food_name}
                              </span>
                              <form action={(fd) => lauf(updateRecipeItemAmount, fd)}
                                className="flex items-center gap-1.5">
                                <input type="hidden" name="id" value={i.id} />
                                <Input name="amount" type="number" min={0} step="any"
                                  defaultValue={i.amount_per_portion} className="w-20"
                                  aria-label={`Menge ${i.food_name}`} />
                                <span className="text-xs text-ink-muted">{i.unit}</span>
                                <button className="text-xs text-accent-soft hover:underline">
                                  Speichern
                                </button>
                              </form>
                              <button
                                onClick={() => lauf(deleteRecipeItem, formOf({ id: i.id }))}
                                aria-label={`${i.food_name} entfernen`}
                                className="px-1 text-sm text-ink-faint transition hover:text-bad">
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <ZutatHinzufuegen recipeId={r.id} foods={foods}
                        sortStart={r.items.length}
                        onFertig={() => router.refresh()} />

                      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line/70 pt-3">
                        <form action={(fd) => lauf(updateRecipe, fd)}
                          className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={r.id} />
                          <div className="w-36">
                            <label className="mb-1 block text-xs text-ink-muted">Name</label>
                            <Input name="name" defaultValue={r.name} />
                          </div>
                          <div className="w-40">
                            <label className="mb-1 block text-xs text-ink-muted">Sorte</label>
                            <Select name="meal_type"
                              defaultValue={istSnack(r.meal_type) ? "snack" : "mittagessen"}>
                              {RECIPE_KINDS.map((k) => (
                                <option key={k.value} value={k.value}>{k.label}</option>
                              ))}
                            </Select>
                          </div>
                          {categories.length > 0 && (
                            <div className="w-40">
                              <label className="mb-1 block text-xs text-ink-muted">Vorlage</label>
                              <Select name="category_id" defaultValue={r.category_id ?? ""}>
                                <option value="">Keine</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </Select>
                            </div>
                          )}
                          <Button variant="ghost" type="submit">Speichern</Button>
                        </form>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

/** FormData aus einem einfachen Objekt - spart wiederholten Aufbau. */
function formOf(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}

/** Zutatensuche innerhalb eines Rezepts. */
function ZutatHinzufuegen({
  recipeId, foods, sortStart, onFertig,
}: {
  recipeId: string;
  foods: Food[];
  sortStart: number;
  onFertig: () => void;
}) {
  const [suche, setSuche] = useState("");
  const [busy, setBusy] = useState(false);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  }, [foods, suche]);

  async function hinzu(f: Food) {
    if (busy) return;
    setBusy(true);
    const einheit = einheitenFuer(f.unit)[0];
    const fd = new FormData();
    fd.set("recipe_id", recipeId);
    fd.set("food_id", f.id);
    fd.set("food_name", f.name);
    fd.set("amount", einheit === "stk" ? "1" : "100");
    fd.set("unit", einheit);
    fd.set("sort_order", String(sortStart));
    await addRecipeItem(fd);
    setSuche("");
    setBusy(false);
    onFertig();
  }

  return (
    <div className="relative mt-3">
      <Input value={suche} onChange={(e) => setSuche(e.target.value)}
        placeholder="Zutat suchen und antippen …" aria-label="Zutat suchen" />
      {treffer.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          {treffer.map((f) => (
            <li key={f.id}>
              <button onClick={() => hinzu(f)}
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
  );
}
