/**
 * Welche Nährwert-Ringe der Tag zeigt.
 *
 * Kalorien und Protein stehen immer da — das sind die zwei Zahlen, an denen
 * Kerim seinen Cut misst. Kohlenhydrate und Fett erscheinen nur, wenn in den
 * Einstellungen ein Ziel dafür steht. Das ist Absicht: ein Ring ohne Ziel
 * kann nur „0 von 0" anzeigen, und vier Ringe, von denen zwei nichts sagen,
 * lehren einen, alle vier zu überblättern.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit `tools/checks/naehrwerte.mts`.
 */

export type NaehrKey = "kcal" | "protein" | "kh" | "fett";

export interface Naehrziel {
  key: NaehrKey;
  label: string;
  einheit: string;
  ziel: number;
}

/** Ohne Eintrag in den Einstellungen gelten diese. */
export const GRUNDZIEL = { kcal: 2100, protein: 150 } as const;

/** Eine Zahl aus den Einstellungen — ungültig oder ≤ 0 heisst „nicht gesetzt". */
export function zahl(wert: string | undefined): number | null {
  const n = Number.parseFloat(String(wert ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Die Ringe für einen Tag, in fester Reihenfolge.
 *
 * @param settings Rohwerte aus `settings` (Menü-Datenbank).
 * @param kcalZiel Tagesziel inklusive Aktivitätsbonus. Ohne Angabe gilt der
 *   Wert aus den Einstellungen. Der Bonus MUSS von aussen kommen — sonst
 *   gäbe es zwei Stellen, die das Tagesziel bestimmen, und genau das war
 *   schon einmal der Fehler („Heute" zeigte 2480, der Plan 2100).
 */
export function zieleAus(
  settings: Record<string, string>, kcalZiel?: number,
): Naehrziel[] {
  const liste: Naehrziel[] = [
    {
      key: "kcal", label: "Kalorien", einheit: "kcal",
      ziel: kcalZiel ?? zahl(settings.kcal_ziel) ?? GRUNDZIEL.kcal,
    },
    {
      key: "protein", label: "Protein", einheit: "g",
      ziel: zahl(settings.protein_ziel) ?? GRUNDZIEL.protein,
    },
  ];

  // Nur was angelegt ist. Kein Standardwert als Rückfall: ein erfundenes
  // KH-Ziel wäre schlimmer als keins — man würde sich daran messen.
  const kh = zahl(settings.kh_ziel);
  if (kh !== null) liste.push({ key: "kh", label: "Kohlenhydrate", einheit: "g", ziel: kh });

  const fett = zahl(settings.fett_ziel);
  if (fett !== null) liste.push({ key: "fett", label: "Fett", einheit: "g", ziel: fett });

  return liste;
}

/**
 * Wie voll der Ring ist — 0 bis 1.
 *
 * Über dem Ziel bleibt der Ring voll und läuft nicht weiter. Was darüber
 * hinausgeht, sagt `darueber()` in Zahlen; ein Ring, der sich ein zweites Mal
 * füllt, sähe bei 4200 kcal aus wie bei 2100.
 */
export function anteil(wert: number, ziel: number): number {
  if (!(ziel > 0)) return 0;
  return Math.max(0, Math.min(1, wert / ziel));
}

/** Wie viel über dem Ziel — 0, wenn nichts drüber ist. */
export function darueber(wert: number, ziel: number): number {
  if (!(ziel > 0)) return 0;
  return Math.max(0, Math.round(wert - ziel));
}

/** Wie viel noch übrig ist — 0, wenn das Ziel erreicht ist. */
export function uebrig(wert: number, ziel: number): number {
  if (!(ziel > 0)) return 0;
  return Math.max(0, Math.round(ziel - wert));
}

export type Lage = "offen" | "gut" | "drueber";

/**
 * Wie der Ring eingefärbt wird.
 *
 * Bei Kalorien ist „drüber" ein Problem, bei Protein nicht — mehr Protein als
 * geplant ist im Cut kein Fehler. Deshalb entscheidet der Schlüssel mit,
 * nicht nur die Zahl.
 */
export function lage(key: NaehrKey, wert: number, ziel: number): Lage {
  if (!(ziel > 0)) return "offen";
  if (wert > ziel) return key === "protein" ? "gut" : "drueber";
  // 90 % gilt als erreicht: auf 2100 kcal genau zu treffen ist nicht das Ziel,
  // in der Nähe zu landen schon.
  return wert >= ziel * 0.9 ? "gut" : "offen";
}
