"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDayTemplate, deleteDayTemplate, setTemplateItemTrainingOnly,
} from "@/lib/actions";
import { Button, Card, CardTitle, Empty, Input, Select, cx } from "@/components/ui";
import { MEAL_LABEL, istSnack } from "@/lib/menu-labels";
import type { DayTemplate } from "@/lib/supabase/menu";

interface RezeptOption {
  id: string;
  name: string;
  meal_type: string;
}

interface Zeile {
  meal_type: string;
  recipe_id: string;
  /** Gibt es nur an Trainingstagen - ohne Training nicht im Dialog. */
  training_only: boolean;
}

/** Slots einer Vorlage. Snacks kommen nur dazu, wenn man sie einschaltet. */
const GRUND_SLOTS = ["mittagessen", "abendessen"];
const SNACK_SLOTS = ["snack"];

/**
 * Tagesvorlagen: ein ganzer Tag, einmal zusammengestellt.
 *
 * Gedacht für die Tage, die sich ohnehin wiederholen. Statt jede Mahlzeit
 * neu zusammenzuklicken, lädt man die Vorlage im Plan auf ein Datum.
 *
 * Die Vorlage speichert nur Verweise auf Rezepte — ändert man ein Rezept,
 * ändert sich die Vorlage automatisch mit.
 */
export function DayTemplateList({
  templates, rezepte,
}: { templates: DayTemplate[]; rezepte: RezeptOption[] }) {
  const router = useRouter();
  const [neu, setNeu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [mitSnacks, setMitSnacks] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);

  const hauptRezepte = rezepte.filter((r) => !istSnack(r.meal_type));
  const snackRezepte = rezepte.filter((r) => istSnack(r.meal_type));

  const slots = mitSnacks ? [...GRUND_SLOTS, ...SNACK_SLOTS] : GRUND_SLOTS;

  /** Die Rezepte, die für diesen Slot in Frage kommen. */
  const auswahlFuer = (slot: string) =>
    slot === "snack" ? snackRezepte : hauptRezepte;

  function setzen(slot: string, recipeId: string) {
    setZeilen((list) => {
      const vorher = list.find((z) => z.meal_type === slot);
      const ohne = list.filter((z) => z.meal_type !== slot);
      return recipeId
        ? [...ohne, {
            meal_type: slot, recipe_id: recipeId,
            training_only: vorher?.training_only ?? false,
          }]
        : ohne;
    });
  }

  const gewaehlt = (slot: string) =>
    zeilen.find((z) => z.meal_type === slot)?.recipe_id ?? "";

  async function anlegen() {
    if (!name.trim() || zeilen.length === 0 || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("items", JSON.stringify(zeilen));
    await createDayTemplate(fd);
    setBusy(false);
    setNeu(false);
    setName("");
    setZeilen([]);
    setMitSnacks(false);
    router.refresh();
  }

  /**
   * Eine Zeile ans Training binden oder wieder loesen.
   *
   * Gebundene Zeilen erscheinen beim Einfuegen ohne Training gar nicht
   * erst - typisch das Porridge, das den Trainingstag ausgleicht.
   */
  async function bindungWechseln(itemId: string, neu: boolean) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("id", itemId);
    fd.set("training_only", String(neu));
    await setTemplateItemTrainingOnly(fd);
    setBusy(false);
    router.refresh();
  }

  async function loeschen(id: string) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("id", id);
    await deleteDayTemplate(fd);
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="mb-0">Tagesvorlagen</CardTitle>
        <button onClick={() => setNeu(!neu)}
          className="text-xs font-medium text-accent-soft transition hover:underline">
          {neu ? "Schliessen" : "+ Neue Vorlage"}
        </button>
      </div>

      {neu && (
        <div className="mb-4 space-y-3 rounded-xl bg-sand/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label htmlFor="v-name" className="mb-1.5 block text-xs text-ink-muted">
                Name der Vorlage
              </label>
              <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Normaler Arbeitstag" />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-ink-soft">
              <input type="checkbox" checked={mitSnacks}
                onChange={(e) => {
                  setMitSnacks(e.target.checked);
                  // Snack-Zeilen wieder wegräumen, wenn man den Haken löst
                  if (!e.target.checked) {
                    setZeilen((list) => list.filter((z) => z.meal_type !== "snack"));
                  }
                }} />
              Mit Snacks
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {slots.map((slot) => {
              const auswahl = auswahlFuer(slot);
              return (
                <div key={slot}>
                  <label className="mb-1.5 block text-xs text-ink-muted">
                    {MEAL_LABEL[slot]}
                  </label>
                  <Select value={gewaehlt(slot)}
                    onChange={(e) => setzen(slot, e.target.value)}>
                    <option value="">— leer lassen —</option>
                    {auswahl.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </Select>
                  {auswahl.length === 0 && (
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {slot === "snack"
                        ? "Noch kein Rezept als Snack angelegt."
                        : "Noch kein Rezept als Hauptmahlzeit angelegt."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={anlegen} disabled={busy || !name.trim() || zeilen.length === 0}>
              {busy ? "…" : "Vorlage anlegen"}
            </Button>
            <span className="text-xs text-ink-muted">
              {zeilen.length === 0
                ? "Mindestens eine Mahlzeit wählen."
                : `${zeilen.length} ${zeilen.length === 1 ? "Mahlzeit" : "Mahlzeiten"} gewählt`}
            </span>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <Empty>
          Noch keine Vorlage. Stell einen Tag zusammen, den du oft isst — im
          Plan lädst du ihn dann mit einem Klick.
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {templates.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{v.name}</div>

                {v.items.length === 0 ? (
                  <div className="text-xs text-ink-muted">keine Mahlzeiten</div>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {v.items.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-ink-muted">
                          {MEAL_LABEL[i.meal_type] ?? i.meal_type}:{" "}
                          <span className="text-ink-soft">{i.recipeName}</span>
                        </span>
                        {/* Nur mit Training: die Zeile faellt an trainingsfreien
                            Tagen komplett aus der Auswahl - typisch das Porridge. */}
                        <button onClick={() => bindungWechseln(i.id, !i.training_only)}
                          disabled={busy}
                          title={i.training_only
                            ? "Wird ohne Training nicht angeboten. Klicken, um sie immer anzubieten."
                            : "Wird immer angeboten. Klicken, um sie an Trainingstage zu binden."}
                          className={cx(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium transition",
                            i.training_only
                              ? "bg-accent-tint text-accent-soft"
                              : "bg-sand text-ink-faint hover:text-ink-soft"
                          )}>
                          {i.training_only ? "nur mit Training" : "immer"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className={cx("rounded-lg px-2 py-0.5 text-[11px] font-medium",
                v.with_snacks ? "bg-accent-tint text-accent-soft" : "bg-sand text-ink-soft")}>
                {v.with_snacks ? "mit Snacks" : "ohne Snacks"}
              </span>
              <button onClick={() => loeschen(v.id)} aria-label={`${v.name} löschen`}
                className="px-1 text-sm text-ink-faint transition hover:text-bad">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
