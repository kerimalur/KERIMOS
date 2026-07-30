"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  toggleMealEaten, toggleMealItemEaten, togglePortionConsumed,
  removePortionFromDay, deletePlanMeal, setMenuDayMarker,
} from "@/lib/actions";
import { Card, cx } from "@/components/ui";
import { MEAL_ORDER, MEAL_LABEL } from "@/lib/menu-labels";
import type { DayView } from "@/lib/supabase/menu";

const MENU_APP = "https://men-plan-kerim-alurs-projects.vercel.app";

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
export function PlanDay({ tag }: { tag: DayView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Optimistische Häkchen: id -> Zustand
  const [lokal, setLokal] = useState<Record<string, boolean>>({});

  const state = (id: string, echt: boolean) => lokal[id] ?? echt;

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
    an ? "bg-accent text-white" : "bg-sand text-ink-muted hover:text-ink-soft"
  );

  const offenKcal = Math.max(0, Math.round(tag.kcal - tag.gegessenKcal));

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
          {[
            { label: "Gegessen", wert: `${Math.round(tag.gegessenKcal)} kcal`,
              sub: `von ${Math.round(tag.kcal)}` },
            { label: "Noch offen", wert: `${offenKcal} kcal`, sub: "" },
            { label: "Protein", wert: `${Math.round(tag.gegessenProtein)} g`,
              sub: `von ${Math.round(tag.protein)}` },
            { label: "Ziel", wert: `${tag.ziele.kcal} kcal`,
              sub: `${tag.ziele.protein} g Protein` },
          ].map((k) => (
            <div key={k.label}>
              <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                {k.label}
              </div>
              <div className="tabular mt-0.5 text-lg font-medium text-ink">{k.wert}</div>
              {k.sub && <div className="text-xs text-ink-muted">{k.sub}</div>}
            </div>
          ))}
        </div>
      </Card>

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
              <a href={`${MENU_APP}/plan`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-accent-soft transition hover:underline">
                + Hinzufügen
              </a>
            </div>

            {leer && <p className="text-sm text-ink-faint">—</p>}

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
                        an ? "border-good bg-good text-white"
                          : "border-line bg-white text-transparent hover:border-line-strong"
                      )}>✓</button>
                    <span className={cx("min-w-0 flex-1 truncate text-sm",
                      an ? "text-ink-faint line-through" : "text-ink")}>
                      {p.name}
                    </span>
                    <span className="tabular shrink-0 text-xs text-ink-muted">
                      {Math.round(p.kcal)} kcal
                    </span>
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
              return (
                <div key={m.id} className="mb-2 rounded-xl bg-sand/50 p-3">
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => schalten(m.id, !an, toggleMealEaten, "eaten")}
                      aria-label={an ? "Nicht gegessen" : "Als gegessen markieren"}
                      className={cx(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] transition",
                        an ? "border-good bg-good text-white"
                          : "border-line bg-white text-transparent hover:border-line-strong"
                      )}>✓</button>
                    <span className={cx("min-w-0 flex-1 truncate text-sm font-medium",
                      an ? "text-ink-faint line-through" : "text-ink")}>
                      {m.name}
                    </span>
                    <span className="tabular shrink-0 text-xs text-ink-muted">
                      {Math.round(m.kcal_total)} kcal
                    </span>
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
                                iAn ? "border-good bg-good text-white"
                                  : "border-line bg-white text-transparent"
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
