"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  toggleMealEaten, toggleMealItemEaten, togglePortionConsumed,
  removePortionFromDay, deletePlanMeal, setMenuDayMarker, convertPortionToMeal,
} from "@/lib/actions";
import { Button, Card, Select, cx } from "@/components/ui";
import { MEAL_ORDER, MEAL_LABEL } from "@/lib/menu-labels";
import { MealForm, type FoodOption, type RezeptOption } from "@/components/meal-form";
import { MealEdit } from "@/components/meal-edit";
import { TemplateApplyDialog } from "@/components/template-apply-dialog";
import type { DayView, DayTemplate } from "@/lib/supabase/menu";

/** "300 g Reis" — Menge weggelassen, wenn sie fehlt. */
function menge(amount: number, unit: string): string {
  if (!amount) return "";
  const wert = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
  return `${wert} ${unit}`.trim();
}

/**
 * Der Tag im Essen-Bereich: Slots mit vorgekochten Boxen und frei geplanten
 * Mahlzeiten, alles abhakbar. Die Summen kommen aus der Datenbank, das
 * Abgehakte wird lokal sofort gespiegelt, damit das Antippen nicht wartet.
 */
export function PlanDay({ tag, foods, rezepte, vorlagen = [], prepBestand = {} }: {
  tag: DayView;
  foods: FoodOption[];
  rezepte: RezeptOption[];
  /** Tagesvorlagen, die sich auf diesen Tag laden lassen. */
  vorlagen?: DayTemplate[];
  /** recipe_id -> vorgekochte Portionen, die noch offen sind. */
  prepBestand?: Record<string, number>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Optimistische Häkchen: id -> Zustand
  const [lokal, setLokal] = useState<Record<string, boolean>>({});
  // Slot, für den gerade eine Mahlzeit angelegt wird
  const [neuFuer, setNeuFuer] = useState<string | null>(null);
  // Mahlzeit, die gerade bearbeitet wird
  const [editId, setEditId] = useState<string | null>(null);
  // Gewaehlte Tagesvorlage, noch nicht geladen
  const [vorlageId, setVorlageId] = useState("");
  // Vorlage, fuer die der Auswahl-Dialog offen ist
  const [dialogFuer, setDialogFuer] = useState<DayTemplate | null>(null);

  const state = (id: string, echt: boolean) => lokal[id] ?? echt;

  /**
   * Box bearbeiten: erst aus dem Zyklus lösen, dann den Editor öffnen.
   *
   * Eine Box hängt am Rezept ihres Topfs und ist deshalb nicht direkt
   * änderbar. convertPortionToMeal legt sie als freie Mahlzeit dieses Tages an
   * — Name, Mengen und Zutaten sind ab dann frei. Der Prep-Zyklus bleibt
   * unverändert: gekocht ist gekocht.
   */
  async function boxBearbeiten(portionId: string) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("id", portionId);
    const mealId = await convertPortionToMeal(fd);
    setBusy(false);
    if (mealId) setEditId(mealId);
    router.refresh();
  }

  async function schalten(
    id: string, wert: boolean, action: (fd: FormData) => Promise<void>, feld: string
  ) {
    setLokal((s) => ({ ...s, [id]: wert }));
    const fd = new FormData();
    fd.set("id", id);
    fd.set(feld, String(wert));
    await action(fd);
    router.refresh();
  }

  async function marker(feld: string, wert: boolean) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("date", tag.date);
    fd.set("feld", feld);
    fd.set("wert", String(wert));
    await setMenuDayMarker(fd);
    setBusy(false);
    router.refresh();
  }

  async function entfernen(id: string, action: (fd: FormData) => Promise<void>) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("id", id);
    await action(fd);
    setBusy(false);
    router.refresh();
  }

  const pille = (an: boolean) => cx(
    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
    an ? "bg-accent text-ink-on" : "bg-sand text-ink-muted hover:text-ink-soft"
  );

  /**
   * Was noch ins Budget passt — gerechnet auf den PLAN, nicht auf das
   * Abgehakte.
   *
   * Das Häkchen beantwortet „habe ich das schon gegessen", nicht „wie viel
   * Spielraum habe ich heute noch". Wer 2256 kcal eingeplant hat, ist bei
   * einem Ziel von 2100 um 156 drüber — ob null oder alle Haken gesetzt sind,
   * ändert daran nichts. Vorher lief „Noch offen" gegen das Gegessene und
   * stand deshalb am Abend immer auf 0, egal wie der Tag wirklich aussah.
   */
  const offenKcal = Math.round(tag.ziele.kcal - tag.kcal);
  const offenProtein = Math.round(tag.ziele.protein - tag.protein);

  const kacheln: { label: string; wert: string; sub: string; warn?: boolean }[] = [
    { label: "Geplant", wert: `${Math.round(tag.kcal)} kcal`,
      sub: `Ziel ${tag.ziele.kcal}` },
    { label: "Noch offen", wert: `${Math.abs(offenKcal)} kcal`,
      sub: offenKcal >= 0 ? "bis zum Ziel" : "über dem Ziel",
      warn: offenKcal < 0 },
    { label: "Protein geplant", wert: `${Math.round(tag.protein)} g`,
      sub: `Ziel ${tag.ziele.protein}` },
    { label: "Protein offen", wert: `${Math.abs(offenProtein)} g`,
      // Mehr Protein als geplant ist kein Problem, deshalb keine Warnfarbe.
      sub: offenProtein >= 0 ? "bis zum Ziel" : "darüber" },
  ];

  return (
    <div className="space-y-4">
      {/* Marker */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => marker("training", !tag.marker?.training)}
          className={pille(Boolean(tag.marker?.training))}>Training</button>
        <button onClick={() => marker("eingeladen", !tag.marker?.eingeladen)}
          className={pille(Boolean(tag.marker?.eingeladen))}>Eingeladen</button>
        <button onClick={() => marker("is_free", !tag.marker?.is_free)}
          className={pille(Boolean(tag.marker?.is_free))}>Freier Tag</button>
      </div>

      {/* Summen */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {kacheln.map((k) => (
            <div key={k.label}>
              <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                {k.label}
              </div>
              <div className={cx("tabular mt-0.5 text-lg font-medium",
                k.warn ? "text-warn" : "text-ink")}>
                {k.wert}
              </div>
              {k.sub && <div className="text-xs text-ink-muted">{k.sub}</div>}
            </div>
          ))}
        </div>
        {/* Das Abgehakte steht bewusst klein und getrennt: es beantwortet eine
            andere Frage als die vier Zahlen darüber. */}
        <p className="mt-3 border-t border-line/70 pt-2.5 text-xs text-ink-faint">
          davon gegessen: {Math.round(tag.gegessenKcal)} kcal ·{" "}
          {Math.round(tag.gegessenProtein)} g Protein
        </p>
      </Card>

      {/* Ganzen Tag auf einmal setzen. Steht bewusst ueber den Slots: wer
          einen Standardtag isst, will gar nicht erst Slot fuer Slot klicken. */}
      {vorlagen.length > 0 && (
        dialogFuer ? (
          <TemplateApplyDialog
            vorlage={dialogFuer}
            date={tag.date}
            foods={foods}
            rezepte={rezepte}
            bestand={prepBestand}
            // Ein freier Tag hat kein 17:00-Limit; an allen anderen Tagen
            // gilt die Besenval-Schicht.
            arbeitstag={!tag.marker?.is_free}
            // Ist der Tag schon als Trainingstag markiert, steht der
            // Umschalter passend - umstellen geht trotzdem jederzeit.
            trainingVorgabe={Boolean(tag.marker?.training)}
            onFertig={() => { setDialogFuer(null); setVorlageId(""); }}
          />
        ) : (
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <label htmlFor="vorlage" className="mb-1.5 block text-[11px] font-medium
                                                   uppercase tracking-[0.12em] text-ink-muted">
                  Tagesvorlage laden
                </label>
                <Select id="vorlage" value={vorlageId}
                  onChange={(e) => setVorlageId(e.target.value)}>
                  <option value="">— Vorlage wählen —</option>
                  {vorlagen.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.with_snacks ? " (mit Snacks)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                onClick={() => setDialogFuer(
                  vorlagen.find((v) => v.id === vorlageId) ?? null)}
                disabled={busy || !vorlageId}>
                Auswählen
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Du kannst einzelne Mahlzeiten abwählen, die Portion ändern oder
              gegen etwas anderes tauschen, bevor die Vorlage geladen wird.
            </p>
          </Card>
        )
      )}

      {/* Slots */}
      {MEAL_ORDER.map((slot) => {
        const boxen = tag.portions.filter((p) => p.meal_type === slot);
        const mahlzeiten = tag.meals.filter((m) => m.meal_type === slot);
        const leer = boxen.length === 0 && mahlzeiten.length === 0;

        return (
          <Card key={slot} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                {MEAL_LABEL[slot]}
              </span>
              <button
                onClick={() => setNeuFuer(neuFuer === slot ? null : slot)}
                className="text-xs font-medium text-accent-soft transition hover:underline">
                {neuFuer === slot ? "Schliessen" : "+ Hinzufügen"}
              </button>
            </div>

            {neuFuer === slot && (
              <div className="mb-3">
                <MealForm date={tag.date} slot={slot} foods={foods} rezepte={rezepte}
                  onFertig={() => setNeuFuer(null)} />
              </div>
            )}

            {leer && neuFuer !== slot && <p className="text-sm text-ink-faint">—</p>}

            {/* Vorgekochte Boxen */}
            {boxen.map((p) => {
              const an = state(p.id, p.consumed);
              return (
                <div key={p.id}
                  className="mb-2 rounded-xl bg-good-tint/60 p-3">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => schalten(p.id, !an, togglePortionConsumed, "consumed")}
                      aria-label={an ? "Nicht gegessen" : "Als gegessen markieren"}
                      className={cx(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] transition",
                        an ? "border-good bg-good text-ink-on"
                          : "border-line bg-field text-transparent hover:border-line-strong"
                      )}>✓</button>
                    <span className={cx("min-w-0 flex-1 truncate text-sm",
                      an ? "text-ink-faint line-through" : "text-ink")}>
                      {p.name}
                    </span>
                    <span className="tabular shrink-0 text-xs text-ink-muted">
                      {Math.round(p.kcal)} kcal
                    </span>
                    <button onClick={() => boxBearbeiten(p.id)} disabled={busy}
                      aria-label="Box bearbeiten: Name, Mengen und Zutaten"
                      title="Bearbeiten — löst die Box aus dem Zyklus"
                      className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-accent-soft disabled:opacity-40">
                      ✎
                    </button>
                    <button onClick={() => entfernen(p.id, removePortionFromDay)}
                      aria-label="Box aus dem Tag nehmen"
                      className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad">
                      ✕
                    </button>
                  </div>
                  <p className="mt-0.5 pl-8 text-[11px] text-ink-muted">
                    Box aus dem Kühlschrank · {Math.round(p.protein)} g Protein
                  </p>
                </div>
              );
            })}

            {/* Frei geplante Mahlzeiten */}
            {mahlzeiten.map((m) => {
              const an = state(m.id, m.eaten);
              const fertig = m.items.filter((i) => state(i.id, i.eaten)).length;

              if (editId === m.id) {
                return (
                  <MealEdit key={m.id} meal={m} foods={foods}
                    onFertig={() => setEditId(null)} />
                );
              }

              return (
                <div key={m.id} className="mb-2 rounded-xl bg-sand/50 p-3">
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => schalten(m.id, !an, toggleMealEaten, "eaten")}
                      aria-label={an ? "Nicht gegessen" : "Als gegessen markieren"}
                      className={cx(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] transition",
                        an ? "border-good bg-good text-ink-on"
                          : "border-line bg-field text-transparent hover:border-line-strong"
                      )}>✓</button>
                    <span className={cx("min-w-0 flex-1 truncate text-sm font-medium",
                      an ? "text-ink-faint line-through" : "text-ink")}>
                      {m.name}
                    </span>
                    <span className="tabular shrink-0 text-xs text-ink-muted">
                      {Math.round(m.kcal_total)} kcal
                    </span>
                    <button onClick={() => setEditId(m.id)}
                      aria-label="Mahlzeit bearbeiten: Name, Mengen und Zutaten"
                      title="Bearbeiten"
                      className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-accent-soft">
                      ✎
                    </button>
                    <button onClick={() => entfernen(m.id, deletePlanMeal)}
                      aria-label="Mahlzeit löschen"
                      className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad">
                      ✕
                    </button>
                  </div>

                  {m.items.length > 0 && (
                    <ul className="mt-1.5 space-y-1 pl-8">
                      {m.items.map((i) => {
                        const iAn = state(i.id, i.eaten) || an;
                        return (
                          <li key={i.id} className="flex items-center gap-2">
                            <button
                              onClick={() => schalten(i.id, !iAn, toggleMealItemEaten, "eaten")}
                              aria-label={`${i.food_name} abhaken`}
                              className={cx(
                                "grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] transition",
                                iAn ? "border-good bg-good text-ink-on"
                                  : "border-line bg-field text-transparent"
                              )}>✓</button>
                            <span className={cx("min-w-0 flex-1 truncate text-xs",
                              iAn ? "text-ink-faint line-through" : "text-ink-soft")}>
                              {i.food_name}
                            </span>
                            <span className="tabular shrink-0 text-[11px] text-ink-muted">
                              {menge(i.amount, i.unit)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {m.items.length > 0 && (
                    <p className="mt-1.5 pl-8 text-[11px] text-ink-muted">
                      {fertig} von {m.items.length} gegessen ·{" "}
                      {Math.round(m.protein_total)} g Protein
                    </p>
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}
