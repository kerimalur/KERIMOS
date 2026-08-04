"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { applyDayTemplate } from "@/lib/actions";
import { Button, Card, cx } from "@/components/ui";
import { MEAL_LABEL } from "@/lib/menu-labels";
import type { DayTemplate } from "@/lib/supabase/menu";
import type { FoodOption, RezeptOption } from "@/components/meal-form";
import {
  FAKTOREN, alternativen, ampelKcal, ampelProtein, ausserhalbZeitfenster,
  proteinLuecke, restBudget, rezeptWerte, skaliert, summeAktiv,
  type Komponente,
} from "@/lib/meal-swap";

/** "0,5×" statt "0.5x" — der Rest der Oberfläche schreibt auch deutsch. */
const faktorLabel = (f: number) => `${String(f).replace(".", ",")}×`;

const ampelKlasse = (stand: "gut" | "unter" | "ueber") =>
  stand === "gut" ? "text-ink" : "text-rose-500";

/**
 * Vorlage auf einen Tag laden — aber nicht blind.
 *
 * Statt die ganze Vorlage einzufügen, öffnet sich diese Auswahl: jede
 * Komponente lässt sich abwählen, in der Portionsgrösse ändern oder gegen
 * ein anderes Rezept tauschen. Oben läuft die Summe gegen die Zielwerte
 * der Vorlage mit.
 *
 * Der eigentliche Nutzen steckt im Tausch: die Alternativen werden nicht
 * nach "ist ähnlich" gesucht, sondern nach "passt in das, was vom Tag noch
 * übrig ist". Damit funktioniert sowohl "Porridge weglassen und Kalorien
 * sparen" als auch "Porridge weglassen und dafür abends mehr essen".
 */
export function TemplateApplyDialog({
  vorlage, date, foods, rezepte, bestand = {}, arbeitstag = false, onFertig,
}: {
  vorlage: DayTemplate;
  date: string;
  foods: FoodOption[];
  rezepte: RezeptOption[];
  /** recipe_id -> vorgekochte Portionen, die noch im Kühlschrank stehen. */
  bestand?: Record<string, number>;
  /** Arbeitstag im Besenval: letzte Mahlzeit 17:00. */
  arbeitstag?: boolean;
  onFertig: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const [komponenten, setKomponenten] = useState<Komponente[]>(() =>
    vorlage.items.map((i) => ({
      key: i.id,
      meal_type: i.meal_type,
      recipe_id: i.recipe_id,
      faktor: 1,
      aktiv: true,
    }))
  );

  /** Zeile, für die gerade der Tausch-Dialog offen ist. */
  const [tauschKey, setTauschKey] = useState<string | null>(null);
  const [nurEinfach, setNurEinfach] = useState(false);
  const [zeitfensterEgal, setZeitfensterEgal] = useState(false);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const rezeptById = useMemo(() => new Map(rezepte.map((r) => [r.id, r])), [rezepte]);
  const bestandMap = useMemo(() => new Map(Object.entries(bestand)), [bestand]);

  /** Nährwerte je Rezept, einmal gerechnet. */
  const werteById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof rezeptWerte>>();
    for (const r of rezepte) m.set(r.id, rezeptWerte(r, foodById));
    return m;
  }, [rezepte, foodById]);

  const werteFuer = (recipeId: string) => werteById.get(recipeId);

  const ziel = { kcal: vorlage.kcal_target, protein: vorlage.protein_target };
  const gesamt = useMemo(
    () => summeAktiv(komponenten, werteFuer, undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [komponenten, werteById]
  );

  const luecke = useMemo(() => proteinLuecke(ziel, gesamt), [ziel, gesamt]);

  const standKcal = ampelKcal(ziel.kcal, gesamt.kcal);
  const standProtein = ampelProtein(ziel.protein, gesamt.protein);

  /* ------------------------------------------------------ Bedienung */

  const setzen = (key: string, teil: Partial<Komponente>) =>
    setKomponenten((list) =>
      list.map((k) => (k.key === key ? { ...k, ...teil } : k)));

  function tauschen(key: string, recipeId: string) {
    setzen(key, { recipe_id: recipeId, aktiv: true });
    setTauschKey(null);
  }

  async function laden() {
    const gewaehlt = komponenten.filter((k) => k.aktiv);
    if (gewaehlt.length === 0 || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("date", date);
    fd.set("template_id", vorlage.id);
    fd.set("auswahl", JSON.stringify(gewaehlt.map((k) => ({
      meal_type: k.meal_type,
      recipe_id: k.recipe_id,
      faktor: k.faktor,
    }))));
    await applyDayTemplate(fd);
    setBusy(false);
    onFertig();
    router.refresh();
  }

  /* -------------------------------------------------- Tausch-Auswahl */

  const tauschZeile = komponenten.find((k) => k.key === tauschKey) ?? null;

  const tauschVorschlaege = useMemo(() => {
    if (!tauschZeile) return [];
    const behalten = summeAktiv(komponenten, werteFuer, tauschZeile.key);
    const rest = restBudget(ziel, behalten);
    const versteckt =
      ausserhalbZeitfenster(tauschZeile.meal_type, arbeitstag) && !zeitfensterEgal;
    if (versteckt) return [];
    return alternativen({
      rezepte,
      foodById,
      rest,
      original: werteFuer(tauschZeile.recipe_id),
      bestand: bestandMap,
      slot: tauschZeile.meal_type,
      nurEinfach,
      ausserRecipeId: tauschZeile.recipe_id,
    }).slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tauschZeile, komponenten, werteById, rezepte, foodById, bestandMap,
      nurEinfach, arbeitstag, zeitfensterEgal, ziel.kcal, ziel.protein]);

  const zeitfensterAktiv =
    tauschZeile != null &&
    ausserhalbZeitfenster(tauschZeile.meal_type, arbeitstag) &&
    !zeitfensterEgal;

  /* ------------------------------------------------------------ View */

  return (
    <Card className="space-y-4 p-4">
      {/* Kopf: Vorlage, Tag-Typ, Live-Summe */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{vorlage.name}</span>
          <span className={cx(
            "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]",
            vorlage.is_training_day
              ? "bg-accent/15 text-accent-soft"
              : "bg-sand text-ink-muted"
          )}>
            {vorlage.is_training_day ? "Trainingstag" : "Kein Training"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">
              Kalorien
            </div>
            <div className={cx("tabular mt-0.5 text-lg font-medium",
              ampelKlasse(standKcal))}>
              {Math.round(gesamt.kcal)}
            </div>
            <div className="text-xs text-ink-muted">von {ziel.kcal} kcal</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">
              Protein
            </div>
            <div className={cx("tabular mt-0.5 text-lg font-medium",
              ampelKlasse(standProtein))}>
              {Math.round(gesamt.protein)} g
            </div>
            <div className="text-xs text-ink-muted">von {ziel.protein} g</div>
          </div>
        </div>

        {/* Protein-Lückenfüller — nur wenn wirklich etwas fehlt */}
        {luecke.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
            <div className="text-xs font-medium text-rose-500">
              Es fehlen {Math.round(ziel.protein - gesamt.protein)} g Protein
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {luecke.map((f) => (
                <span key={f.name}
                  className="rounded-md bg-sand px-2 py-1 text-xs text-ink-soft">
                  + {f.menge} {f.einheit} {f.name}
                  <span className="text-ink-muted">
                    {" "}= +{f.protein} g P, +{f.kcal} kcal
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Komponenten */}
      <div className="space-y-2">
        {komponenten.map((k) => {
          const rezept = rezeptById.get(k.recipe_id);
          const roh = werteFuer(k.recipe_id);
          const w = roh ? skaliert(roh, k.faktor)
            : { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
          const vorrat = bestandMap.get(k.recipe_id) ?? 0;

          return (
            <div key={k.key}
              className={cx("rounded-lg border p-3 transition",
                k.aktiv ? "border-line" : "border-line/50 opacity-50")}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={k.aktiv} aria-label="Komponente übernehmen"
                  onChange={(e) => setzen(k.key, { aktiv: e.target.checked })}
                  className="mt-1 h-4 w-4 shrink-0 accent-current" />

                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                    {MEAL_LABEL[k.meal_type] ?? k.meal_type}
                  </div>
                  <div className="truncate text-sm text-ink">
                    {rezept?.name ?? "Gelöschtes Rezept"}
                  </div>
                  <div className="tabular mt-0.5 text-xs text-ink-muted">
                    {Math.round(w.kcal)} kcal · {Math.round(w.protein)} g P
                    {vorrat > 0 && (
                      <span className="text-accent-soft">
                        {" "}· {vorrat} vorbereitet
                      </span>
                    )}
                  </div>
                </div>

                <button type="button" onClick={() => setTauschKey(
                  tauschKey === k.key ? null : k.key)}
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs
                             text-ink-soft transition hover:border-line-strong">
                  {tauschKey === k.key ? "Schliessen" : "Tauschen"}
                </button>
              </div>

              {/* Portionsgrösse */}
              <div className="mt-2 flex gap-1.5 pl-7">
                {FAKTOREN.map((f) => (
                  <button key={f} type="button" onClick={() => setzen(k.key, { faktor: f })}
                    className={cx(
                      "rounded-md px-2 py-0.5 text-xs transition",
                      k.faktor === f
                        ? "bg-accent text-ink-on"
                        : "bg-sand text-ink-muted hover:text-ink-soft"
                    )}>
                    {faktorLabel(f)}
                  </button>
                ))}
              </div>

              {/* Tausch-Auswahl */}
              {tauschKey === k.key && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <input type="checkbox" checked={nurEinfach}
                        onChange={(e) => setNurEinfach(e.target.checked)}
                        className="h-3.5 w-3.5 accent-current" />
                      nur einfache Rezepte
                    </label>
                    {ausserhalbZeitfenster(k.meal_type, arbeitstag) && (
                      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                        <input type="checkbox" checked={zeitfensterEgal}
                          onChange={(e) => setZeitfensterEgal(e.target.checked)}
                          className="h-3.5 w-3.5 accent-current" />
                        Zeitfenster ignorieren
                      </label>
                    )}
                  </div>

                  {zeitfensterAktiv ? (
                    <p className="text-xs text-ink-muted">
                      An Arbeitstagen ist die letzte Mahlzeit um 17:00 — dieser Slot
                      liegt danach. Zum Anzeigen das Zeitfenster ignorieren.
                    </p>
                  ) : tauschVorschlaege.length === 0 ? (
                    <p className="text-xs text-ink-muted">
                      Kein Rezept passt ins verbleibende Budget. Portionsgrösse
                      verkleinern oder eine andere Komponente abwählen.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {tauschVorschlaege.map((a) => (
                        <li key={a.rezept.id}>
                          <button type="button"
                            onClick={() => tauschen(k.key, a.rezept.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5
                                       text-left transition hover:bg-sand">
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">
                              {a.rezept.name}
                            </span>
                            {a.bestand > 0 && (
                              <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5
                                               text-[10px] text-accent-soft">
                                {a.bestand} da
                              </span>
                            )}
                            {a.einfach && (
                              <span className="shrink-0 rounded bg-sand px-1.5 py-0.5
                                               text-[10px] text-ink-muted">
                                Einfach
                              </span>
                            )}
                            <span className="tabular shrink-0 text-xs text-ink-muted">
                              {a.delta.kcal >= 0 ? "+" : ""}{Math.round(a.delta.kcal)} kcal,{" "}
                              {a.delta.protein >= 0 ? "+" : ""}{Math.round(a.delta.protein)} g P
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={laden}
          disabled={busy || komponenten.every((k) => !k.aktiv)}>
          {busy ? "…" : `${komponenten.filter((k) => k.aktiv).length} übernehmen`}
        </Button>
        <button type="button" onClick={onFertig}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft
                     transition hover:border-line-strong">
          Abbrechen
        </button>
      </div>

      <p className="text-xs text-ink-muted">
        Die Vorlage ergänzt den Tag — schon Geplantes bleibt stehen.
      </p>
    </Card>
  );
}
