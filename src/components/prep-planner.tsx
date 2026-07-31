"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCycle, updateBatchPortions, setCycleStatus, deleteCycle,
} from "@/lib/actions";
import { Button, Card, CardTitle, Empty, Input, Select, cx } from "@/components/ui";
import { MEAL_LABEL, MEAL_ORDER } from "@/lib/menu-labels";
import { MenuWrite } from "@/components/menu-write";
import type { FoodOption } from "@/components/meal-form";
import type { PrepCycle } from "@/lib/supabase/menu";

interface RezeptOption {
  id: string;
  name: string;
  meal_type: string;
  default_portions: number;
}

/** Ganze Tage zwischen zwei ISO-Daten, beide inklusive. Mittags gerechnet,
 *  damit die Sommerzeit-Umstellung keine krummen Werte erzeugt. */
function tageZwischen(von: string, bis: string): number {
  if (!von || !bis || bis < von) return 0;
  const a = new Date(`${von}T12:00:00`).getTime();
  const b = new Date(`${bis}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

interface Zeile {
  recipe_id: string;
  meal_type: string;
  portions: number;
}

const STATUS_FARBE: Record<string, string> = {
  geplant: "bg-sand text-ink-soft",
  eingekauft: "bg-warn-tint text-warn",
  gekocht: "bg-good-tint text-good",
  erledigt: "bg-sand text-ink-faint",
};

const kurz = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("de-CH", {
    day: "numeric", month: "short",
  });

/**
 * Prep-Planer: ein Kochtag deckt mehrere Tage.
 *
 * Die Rechnung, die man sonst im Kopf macht: 300 g pro Portion mal drei
 * Portionen sind 900 g im Topf und danach drei Boxen à 300 g. Genau das steht
 * in der Kochliste.
 */
export function PrepPlanner({
  cycles, rezepte, foods, heute,
}: {
  cycles: PrepCycle[];
  rezepte: RezeptOption[];
  foods: FoodOption[];
  heute: string;
}) {
  const router = useRouter();
  const [neu, setNeu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [kochtag, setKochtag] = useState(heute);
  const [von, setVon] = useState(heute);
  const [bis, setBis] = useState(heute);
  const [name, setName] = useState("");
  const [offen, setOffen] = useState<string | null>(cycles[0]?.id ?? null);
  const [schreiben, setSchreiben] = useState(false);

  /**
   * Boxen je Menü: eine Portion pro Tag. Genau die Rechnung hinter
   * "1. bis 2. August = 2 Boxen". Freie Tage zieht die Verteilung serverseitig
   * ab, die Zahl hier ist die Obergrenze.
   */
  const tage = tageZwischen(von, bis);

  async function lauf(action: (fd: FormData) => Promise<void>, fd: FormData) {
    if (busy) return;
    setBusy(true);
    await action(fd);
    setBusy(false);
    router.refresh();
  }

  /** Topf setzen. Die Boxenzahl folgt dem Zeitraum, nicht default_portions
   *  des Rezepts — der Zeitraum ist die konkretere Angabe. Von Hand lässt sie
   *  sich danach weiterhin überschreiben. */
  function zeileHinzu(rezept?: RezeptOption) {
    const r = rezept ?? rezepte[0];
    if (!r) return;
    setZeilen((z) => [...z, {
      recipe_id: r.id, meal_type: r.meal_type,
      portions: Math.max(1, tage || r.default_portions || 3),
    }]);
  }

  async function anlegen() {
    if (zeilen.length === 0 || bis < von || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("cook_date", kochtag);
    fd.set("start_date", von);
    fd.set("end_date", bis);
    fd.set("batches", JSON.stringify(zeilen));
    await createCycle(fd);
    setBusy(false);
    setNeu(false);
    setZeilen([]);
    setName("");
    router.refresh();
  }

  const form = (werte: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(werte)) fd.set(k, v);
    return fd;
  };

  return (
    <>
      {/* Neuer Zyklus */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="mb-0">Kochzyklus</CardTitle>
          <button onClick={() => setNeu(!neu)}
            className="text-xs font-medium text-accent-soft transition hover:underline">
            {neu ? "Schliessen" : "+ Neuer Zyklus"}
          </button>
        </div>

        {!neu ? (
          <p className="text-sm text-ink-muted">
            Ein Kochtag, mehrere Tage gedeckt. Rezepte wählen, Portionen setzen —
            die Boxen verteilt KerimOS auf die Tage und überspringt freie.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-ink-muted">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="optional" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-muted">Kochtag</label>
                <Input type="date" value={kochtag}
                  onChange={(e) => setKochtag(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-muted">Deckt ab</label>
                <Input type="date" value={von} onChange={(e) => setVon(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-muted">bis</label>
                <Input type="date" value={bis} min={von}
                  onChange={(e) => setBis(e.target.value)} />
              </div>
            </div>

            {/* Was der Zeitraum bedeutet — hier fällt die Boxenzahl. */}
            {bis < von ? (
              <p className="text-xs text-bad">Das Enddatum liegt vor dem Startdatum.</p>
            ) : (
              <p className="text-xs text-ink-soft">
                <span className="font-medium text-ink">{tage} Tage</span> → 1 Portion pro Tag
                → <span className="font-medium text-ink">{tage} Boxen</span> je Menü.
                Freie Tage überspringt die Verteilung.
              </p>
            )}

            {zeilen.length > 0 && (
              <ul className="space-y-2">
                {zeilen.map((z, i) => (
                  <li key={i} className="flex flex-wrap items-end gap-2 rounded-xl bg-sand/60 p-2.5">
                    <div className="min-w-40 flex-1">
                      <label className="mb-1 block text-xs text-ink-muted">Rezept</label>
                      <Select value={z.recipe_id}
                        onChange={(e) => setZeilen((list) => list.map((x, j) => {
                          if (j !== i) return x;
                          const r = rezepte.find((o) => o.id === e.target.value);
                          return {
                            ...x, recipe_id: e.target.value,
                            meal_type: r?.meal_type ?? x.meal_type,
                            portions: r?.default_portions || x.portions,
                          };
                        }))}>
                        {rezepte.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-32">
                      <label className="mb-1 block text-xs text-ink-muted">Slot</label>
                      <Select value={z.meal_type}
                        onChange={(e) => setZeilen((list) => list.map((x, j) =>
                          j === i ? { ...x, meal_type: e.target.value } : x))}>
                        {MEAL_ORDER.map((s) => (
                          <option key={s} value={s}>{MEAL_LABEL[s]}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-24">
                      <label className="mb-1 block text-xs text-ink-muted">Portionen</label>
                      <Input type="number" min={1} max={14} value={z.portions}
                        onChange={(e) => setZeilen((list) => list.map((x, j) =>
                          j === i ? { ...x, portions: Number(e.target.value) || 1 } : x))} />
                    </div>
                    {/* Woher die Zahl kommt — und zurück, falls der Zeitraum
                        sich nach dem Setzen geändert hat. */}
                    <div className="pb-2 text-xs">
                      {z.portions === tage ? (
                        <span className="text-ink-faint">= 1 × {tage} Tage</span>
                      ) : (
                        <button
                          onClick={() => setZeilen((list) => list.map((x, j) =>
                            j === i ? { ...x, portions: Math.max(1, tage) } : x))}
                          className="text-accent-soft hover:underline">
                          Zeitraum sagt {tage}
                        </button>
                      )}
                    </div>
                    <button onClick={() => setZeilen((list) => list.filter((_, j) => j !== i))}
                      aria-label="Topf entfernen"
                      className="px-1 pb-2 text-sm text-ink-faint transition hover:text-bad">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Menü direkt schreiben, ohne Umweg über die Rezeptliste. */}
            {schreiben && (
              <MenuWrite
                foods={foods}
                boxen={Math.max(1, tage)}
                onFertig={(rezept) => {
                  setSchreiben(false);
                  if (rezept) {
                    zeileHinzu({ ...rezept, default_portions: Math.max(1, tage) });
                    router.refresh();
                  }
                }}
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" onClick={() => zeileHinzu()}
                disabled={rezepte.length === 0}>
                + Topf aus Rezept
              </Button>
              <Button variant="ghost" onClick={() => setSchreiben(!schreiben)}>
                {schreiben ? "Schliessen" : "✎ Menü schreiben"}
              </Button>
              <Button onClick={anlegen}
                disabled={busy || zeilen.length === 0 || bis < von}>
                {busy ? "…" : "Zyklus anlegen"}
              </Button>
              {rezepte.length === 0 && (
                <span className="text-xs text-ink-muted">
                  Noch kein Rezept — schreib einfach ein Menü.
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Bestehende Zyklen */}
      {cycles.length === 0 ? (
        <Empty>Noch kein Zyklus angelegt.</Empty>
      ) : (
        cycles.map((c) => {
          const auf = offen === c.id;
          const boxen = c.batches.reduce((s, b) => s + b.boxen.length, 0);
          const portionen = c.batches.reduce((s, b) => s + b.portions, 0);
          const kosten = c.batches.reduce((s, b) => s + b.cost * b.portions, 0);

          return (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setOffen(auf ? null : c.id)}
                  className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                      {c.name || `Kochtag ${kurz(c.cook_date)}`}
                    </span>
                    <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-medium",
                      STATUS_FARBE[c.status] ?? "bg-sand text-ink-soft")}>
                      {c.status}
                    </span>
                  </span>
                  <span className="tabular mt-0.5 block text-xs text-ink-muted">
                    {kurz(c.start_date)} – {kurz(c.end_date)} · {c.batches.length} Töpfe ·{" "}
                    {boxen} von {portionen} Boxen verteilt
                    {kosten > 0 && ` · CHF ${kosten.toFixed(2)}`}
                  </span>
                </button>

                <Select value={c.status}
                  onChange={(e) => lauf(setCycleStatus,
                    form({ id: c.id, status: e.target.value }))}
                  className="w-36" aria-label="Status">
                  {["geplant", "eingekauft", "gekocht", "erledigt"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>

                <button onClick={() => lauf(deleteCycle, form({ id: c.id }))}
                  aria-label="Zyklus löschen"
                  className="px-1 text-sm text-ink-faint transition hover:text-bad">
                  ✕
                </button>
              </div>

              {auf && (
                <div className="mt-4 space-y-3">
                  {c.batches.map((b) => (
                    <div key={b.id} className="rounded-xl bg-sand/50 p-3">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-ink">{b.recipeName}</div>
                          <div className="tabular text-xs text-ink-muted">
                            {MEAL_LABEL[b.meal_type] ?? b.meal_type} ·{" "}
                            {Math.round(b.kcal)} kcal · {Math.round(b.protein)} g P je Box
                            {b.cost > 0 && ` · CHF ${b.cost.toFixed(2)}`}
                          </div>
                        </div>
                        <form action={(fd) => lauf(updateBatchPortions, fd)}
                          className="flex items-end gap-2">
                          <input type="hidden" name="id" value={b.id} />
                          <div className="w-24">
                            <label className="mb-1 block text-xs text-ink-muted">
                              Portionen
                            </label>
                            <Input name="portions" type="number" min={1} max={14}
                              defaultValue={b.portions} />
                          </div>
                          <button className="pb-2 text-xs text-accent-soft hover:underline">
                            Speichern
                          </button>
                        </form>
                      </div>

                      {/* Kochliste: Menge pro Box und für den ganzen Topf */}
                      {b.zutaten.length > 0 && (
                        <ul className="mt-2.5 divide-y divide-line/60">
                          {b.zutaten.map((z, i) => (
                            <li key={i} className="flex items-baseline gap-2 py-1 text-xs">
                              <span className="min-w-0 flex-1 truncate text-ink-soft">
                                {z.name}
                              </span>
                              <span className="tabular shrink-0 text-ink">
                                {z.total} {z.unit}
                              </span>
                              <span className="tabular w-24 shrink-0 text-right text-ink-faint">
                                {z.proPortion} {z.unit} / Box
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Verteilung */}
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {b.boxen.map((p) => (
                          <span key={p.id}
                            className={cx("rounded-md px-2 py-0.5 text-[11px]",
                              p.consumed
                                ? "bg-good-tint text-good line-through"
                                : "bg-card text-ink-soft")}>
                            {kurz(p.date)}
                          </span>
                        ))}
                        {b.boxen.length < b.portions && (
                          <span className="rounded-md bg-warn-tint px-2 py-0.5 text-[11px] text-warn">
                            {b.portions - b.boxen.length} unverteilt
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}
    </>
  );
}
