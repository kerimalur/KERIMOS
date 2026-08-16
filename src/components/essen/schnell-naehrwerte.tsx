"use client";
import { useId, useState } from "react";
import { Button, Input } from "@/components/ui";
import type { FoodValues } from "@/lib/nutrition";

/**
 * Schnelle Nährwerte — für alles, was nicht in der Lebensmittel-Datenbank steht.
 *
 * Der Alltagsfall: auswärts gegessen, ein Fertigprodukt mit Etikett, etwas bei
 * jemandem zu Hause. Dafür erst ein Lebensmittel anzulegen dauert länger als
 * das Essen, und die Liste füllt sich mit Einträgen, die nie wieder vorkommen.
 * Darum dieser dritte Weg neben Lebensmittel und Rezept: Name, Kalorien, fertig.
 *
 * Die Werte gelten für EINE Portion. Gespeichert wird die Position als ein
 * Stück (unit "stk", amount 1) — bei "stk" halten die *_per_100-Felder in
 * nutrition.ts ohnehin den Wert je Stück, also rechnet die bestehende Formel
 * ohne Sonderfall weiter. Wer die Menge später auf 2 stellt, bekommt korrekt
 * das Doppelte, auch serverseitig in updatePlanMealItemAmount.
 */

export const SCHNELL_EINHEIT = "stk";

export interface SchnellWerte {
  name: string;
  /** Nährwerte je Portion. Passt als FoodValues, weil die Einheit "stk" ist. */
  werte: FoodValues;
  /** Zusätzlich dauerhaft als Lebensmittel ablegen. */
  merken: boolean;
}

/**
 * "12,5" und "12.5" sind beide gemeint. Auf dem Handy tippt man das Komma,
 * und ein input type="number" verwirft es je nach Tastatur kommentarlos —
 * darum Textfeld mit Zifferntastatur und eigenem Parser. Negatives und
 * Unsinn werden zu 0, nicht zu NaN: eine leere Zeile soll nichts kaputt
 * machen, sondern schlicht nichts beitragen.
 */
function zahl(roh: string): number {
  const n = Number(roh.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function Feld({
  id, label, wert, setzen,
}: {
  id: string; label: string; wert: string; setzen: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] text-ink-muted">
        {label}
      </label>
      <Input id={id} value={wert} onChange={(e) => setzen(e.target.value)}
        inputMode="decimal" autoComplete="off" placeholder="0"
        className="text-base" />
    </div>
  );
}

export function SchnellNaehrwerte({
  startName = "", onUebernehmen, onAbbrechen, busy = false, knopf = "Hinzufügen",
}: {
  /** Vorbelegter Name — z.B. das, wonach gerade erfolglos gesucht wurde. */
  startName?: string;
  onUebernehmen: (eingabe: SchnellWerte) => void;
  onAbbrechen: () => void;
  busy?: boolean;
  knopf?: string;
}) {
  const [name, setName] = useState(startName);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [kh, setKh] = useState("");
  const [fett, setFett] = useState("");
  const [preis, setPreis] = useState("");
  const [merken, setMerken] = useState(false);
  // Der Block kann zweimal gleichzeitig im Baum stehen — einmal in einer neuen
  // Mahlzeit, einmal in einer bearbeiteten. Feste ids würden dann doppelt
  // vergeben und die Labels zeigten auf das falsche Feld.
  const uid = useId();

  // Ohne Namen und ohne Kalorien wäre die Position leer — genau dann bringt
  // sie nichts und würde die Tagessumme nur verwässern.
  const bereit = name.trim().length > 0 && zahl(kcal) > 0;

  function uebernehmen() {
    if (!bereit || busy) return;
    onUebernehmen({
      name: name.trim(),
      werte: {
        calories_per_100: zahl(kcal),
        protein_per_100: zahl(protein),
        carbs_per_100: zahl(kh),
        fat_per_100: zahl(fett),
        cost_per_100: zahl(preis),
      },
      merken,
    });
  }

  return (
    <div className="mb-3 rounded-xl border border-line bg-sand/40 p-3"
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); uebernehmen(); }
        if (e.key === "Escape") onAbbrechen();
      }}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Schnelle Nährwerte
        </span>
        <span className="text-[11px] text-ink-faint">gilt für eine Portion</span>
      </div>

      <div className="mb-2">
        <label htmlFor={`${uid}-name`} className="mb-1 block text-[11px] text-ink-muted">
          Was war es?
        </label>
        <Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Döner auswärts" autoComplete="off" className="text-base" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Feld id={`${uid}-kcal`} label="kcal" wert={kcal} setzen={setKcal} />
        <Feld id={`${uid}-protein`} label="Protein g" wert={protein} setzen={setProtein} />
        <Feld id={`${uid}-kh`} label="KH g" wert={kh} setzen={setKh} />
        <Feld id={`${uid}-fett`} label="Fett g" wert={fett} setzen={setFett} />
        <Feld id={`${uid}-preis`} label="CHF" wert={preis} setzen={setPreis} />
      </div>

      <label className="mt-2.5 flex items-start gap-2 text-xs text-ink-soft">
        <input type="checkbox" checked={merken}
          onChange={(e) => setMerken(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line" />
        <span>
          Auch als Lebensmittel merken — dann steht es beim nächsten Mal in der
          Suche, mit diesen Werten pro Stück.
        </span>
      </label>

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-line/70 pt-3">
        <button onClick={onAbbrechen} type="button"
          className="text-xs text-ink-muted transition hover:text-ink-soft">
          Abbrechen
        </button>
        <Button onClick={uebernehmen} disabled={!bereit || busy}>
          {busy ? "…" : knopf}
        </Button>
      </div>

      {!bereit && (
        <p className="mt-2 text-[11px] text-ink-faint">
          Name und Kalorien reichen. Protein, KH, Fett und Preis nur, wenn du sie
          gerade weisst — was leer bleibt, zählt als 0.
        </p>
      )}
    </div>
  );
}
