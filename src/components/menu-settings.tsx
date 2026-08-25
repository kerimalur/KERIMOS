"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveMenuSetting, createFoodCategory, deleteFoodCategory,
  createRecipeCategory, deleteRecipeCategory, addEventRule, deleteEventRule,
} from "@/lib/actions";
import { Button, Card, CardTitle, Empty, Input, Select } from "@/components/ui";
import { MEAL_LABEL, MEAL_ORDER } from "@/lib/menu-labels";

interface RecipeOption { id: string; name: string; meal_type: string }
interface Category { id: string; name: string }
interface EventRule {
  id: string; event_type: string; meal_type: string;
  recipe_id: string; recipeName: string;
}

/**
 * Einstellungen des Essen-Bereichs: Tagesziele, Standard-Mahlzeiten,
 * Event-Regeln sowie Kategorien für Lebensmittel und Rezept-Vorlagen.
 * Jede Karte speichert unabhängig - ein Feld verlieren geht nicht, wenn ein
 * anderes gerade fehlschlägt.
 */
export function MenuSettings({
  settings, recipes, foodCategories, recipeCategories, eventRules,
}: {
  settings: Record<string, string>;
  recipes: RecipeOption[];
  foodCategories: Category[];
  recipeCategories: Category[];
  eventRules: EventRule[];
}) {
  const router = useRouter();

  return (
    <>
      <Tagesziele settings={settings} onSaved={() => router.refresh()} />
      <StandardMahlzeiten settings={settings} recipes={recipes}
        onSaved={() => router.refresh()} />
      <EventRegeln rules={eventRules} recipes={recipes}
        onSaved={() => router.refresh()} />
      <KategorienKarte
        titel="Lebensmittel-Kategorien"
        hinweis="Zum Sortieren und Filtern in der Lebensmittel-Liste."
        kategorien={foodCategories}
        onAnlegen={createFoodCategory}
        onLoeschen={deleteFoodCategory}
        onSaved={() => router.refresh()}
      />
      <KategorienKarte
        titel="Rezept-Vorlagen"
        hinweis="Gruppiert Rezepte, z.B. „Wochenmenü“ oder „Meal-Prep-Klassiker“."
        kategorien={recipeCategories}
        onAnlegen={createRecipeCategory}
        onLoeschen={deleteRecipeCategory}
        onSaved={() => router.refresh()}
      />
    </>
  );
}

function Feld({
  label, name, value, unit, onSave,
}: {
  label: string; name: string; value: string; unit: string;
  onSave: (name: string, value: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="flex items-center gap-2">
        <Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)}
          onBlur={() => onSave(name, v)} className="w-24 text-right" />
        <span className="w-10 text-xs text-ink-muted">{unit}</span>
      </span>
    </label>
  );
}

function Tagesziele({
  settings, onSaved,
}: { settings: Record<string, string>; onSaved: () => void }) {
  async function speichern(name: string, value: string) {
    const fd = new FormData();
    fd.set("key", name);
    fd.set("value", value);
    await saveMenuSetting(fd);
    onSaved();
  }
  return (
    <Card>
      <CardTitle>Tagesziele</CardTitle>
      <div className="flex flex-col gap-3">
        <Feld label="Kalorien" name="kcal_ziel" unit="kcal"
          value={settings.kcal_ziel} onSave={speichern} />
        <Feld label="Protein" name="protein_ziel" unit="g"
          value={settings.protein_ziel} onSave={speichern} />
        <Feld label="Kosten" name="kosten_ziel" unit="CHF"
          value={settings.kosten_ziel} onSave={speichern} />
      </div>

      {/* Optional, seit dem 24.08.2026. Leer heisst: kein Ring auf der
          Essen-Seite. Absicht — ein Ring ohne Ziel kann nur „0 von 0" zeigen,
          und vier Ringe, von denen zwei nichts sagen, bringen einem bei, alle
          vier zu überblättern. */}
      <div className="mt-4 flex flex-col gap-3 border-t border-line/70 pt-4">
        <p className="text-xs text-ink-muted">
          Kohlenhydrate und Fett sind freiwillig. Steht hier eine Zahl, bekommt
          der Wert einen eigenen Ring auf der Essen-Seite; bleibt das Feld
          leer, gibt es keinen.
        </p>
        <Feld label="Kohlenhydrate" name="kh_ziel" unit="g"
          value={settings.kh_ziel ?? ""} onSave={speichern} />
        <Feld label="Fett" name="fett_ziel" unit="g"
          value={settings.fett_ziel ?? ""} onSave={speichern} />
      </div>
    </Card>
  );
}

function StandardMahlzeiten({
  settings, recipes, onSaved,
}: { settings: Record<string, string>; recipes: RecipeOption[]; onSaved: () => void }) {
  const fruehstueck = recipes.filter((r) => r.meal_type === "fruehstueck");
  const snacks = recipes.filter((r) => r.meal_type === "snack");

  async function speichern(name: string, value: string) {
    const fd = new FormData();
    fd.set("key", name);
    fd.set("value", value);
    await saveMenuSetting(fd);
    onSaved();
  }

  return (
    <Card>
      <CardTitle>Standard-Mahlzeiten</CardTitle>
      <p className="mb-3 text-xs text-ink-muted">
        Wird beim Anlegen eines Zyklus bzw. für einen leeren Tag vorgeschlagen -
        bleibt pro Tag überschreib- und löschbar.
      </p>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-soft">Frühstück</span>
          <Select defaultValue={settings.default_breakfast_recipe_id}
            onChange={(e) => speichern("default_breakfast_recipe_id", e.target.value)}>
            <option value="">Keins</option>
            {fruehstueck.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-soft">Snack (optional)</span>
          <Select defaultValue={settings.default_snack_recipe_id}
            onChange={(e) => speichern("default_snack_recipe_id", e.target.value)}>
            <option value="">Keiner</option>
            {snacks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </label>
      </div>
    </Card>
  );
}

function EventRegeln({
  rules, recipes, onSaved,
}: { rules: EventRule[]; recipes: RecipeOption[]; onSaved: () => void }) {
  const [eventType, setEventType] = useState<"training" | "eingeladen">("training");
  const [mealType, setMealType] = useState(MEAL_ORDER[1]);
  const [recipeId, setRecipeId] = useState("");
  const [busy, setBusy] = useState(false);

  async function anlegen() {
    if (!recipeId || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("event_type", eventType);
    fd.set("meal_type", mealType);
    fd.set("recipe_id", recipeId);
    await addEventRule(fd);
    setRecipeId("");
    setBusy(false);
    onSaved();
  }

  async function loeschen(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    await deleteEventRule(fd);
    onSaved();
  }

  return (
    <Card>
      <CardTitle>Event-Regeln</CardTitle>
      <p className="mb-3 text-xs text-ink-muted">
        An Tagen mit diesem Marker wird das Rezept als Vorschlag angeboten.
      </p>

      {rules.length === 0 ? (
        <p className="mb-3 text-sm text-ink-faint">Noch keine Regeln.</p>
      ) : (
        <ul className="mb-3 divide-y divide-line">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <span className="rounded-md bg-sand px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                {r.event_type === "training" ? "Training" : "Eingeladen"}
              </span>
              <span className="text-xs text-ink-muted">{MEAL_LABEL[r.meal_type] ?? r.meal_type}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.recipeName}</span>
              <button onClick={() => loeschen(r.id)} aria-label="Regel löschen"
                className="px-1 text-sm text-ink-faint transition hover:text-bad">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Select value={eventType}
            onChange={(e) => setEventType(e.target.value as "training" | "eingeladen")}
            className="flex-1">
            <option value="training">Training</option>
            <option value="eingeladen">Eingeladen</option>
          </Select>
          <Select value={mealType} onChange={(e) => setMealType(e.target.value)} className="flex-1">
            {MEAL_ORDER.map((s) => <option key={s} value={s}>{MEAL_LABEL[s]}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className="flex-1">
            <option value="">Rezept wählen …</option>
            {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Button disabled={!recipeId || busy} onClick={anlegen}>+</Button>
        </div>
      </div>
    </Card>
  );
}

function KategorienKarte({
  titel, hinweis, kategorien, onAnlegen, onLoeschen, onSaved,
}: {
  titel: string;
  hinweis: string;
  kategorien: Category[];
  onAnlegen: (fd: FormData) => Promise<void>;
  onLoeschen: (fd: FormData) => Promise<void>;
  onSaved: () => void;
}) {
  const [neu, setNeu] = useState("");
  const [busy, setBusy] = useState(false);

  async function anlegen() {
    if (!neu.trim() || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("name", neu.trim());
    await onAnlegen(fd);
    setNeu("");
    setBusy(false);
    onSaved();
  }

  async function loeschen(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    await onLoeschen(fd);
    onSaved();
  }

  return (
    <Card>
      <CardTitle>{titel}</CardTitle>
      <p className="mb-3 text-xs text-ink-muted">{hinweis}</p>

      {kategorien.length === 0 ? (
        <Empty>Noch keine Kategorien.</Empty>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {kategorien.map((k) => (
            <span key={k.id}
              className="inline-flex items-center gap-1 rounded-full bg-sand px-3 py-1.5">
              <span className="text-xs font-medium text-ink-soft">{k.name}</span>
              <button onClick={() => loeschen(k.id)} aria-label={`${k.name} löschen`}
                className="text-ink-faint transition hover:text-bad">✕</button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void anlegen(); }} className="flex gap-2">
        <Input value={neu} onChange={(e) => setNeu(e.target.value)}
          placeholder="Neue Kategorie" className="flex-1" />
        <Button type="submit" disabled={busy}>+</Button>
      </form>
    </Card>
  );
}
