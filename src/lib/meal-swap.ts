/**
 * Rechenkern für den Vorlagen-Dialog: Restbudget, Nährwert-Nähe,
 * Protein-Lücke.
 *
 * Bewusst ohne Datenbank- und ohne React-Bezug, damit die Logik einzeln
 * prüfbar bleibt und sowohl im Server-Code als auch im Browser läuft.
 * Alles, was hier drin steht, ist reine Rechnung auf übergebenen Daten.
 *
 * Der Gedanke hinter dem Ganzen: Ein Tausch ist selten ein echter 1:1-
 * Tausch. Meistens fällt etwas weg (kein Training, also kein Porridge) und
 * die Frage ist nicht "was ist ähnlich", sondern "was passt noch in den
 * Rest des Tages". Deshalb ist das Restbudget die Hauptrechnung und die
 * Ähnlichkeit nur die Sortierung darin.
 */

import { rechne, summe, type FoodValues, type Nutrition } from "@/lib/nutrition";

/* ------------------------------------------------------------- Typen */

/** Ein Lebensmittel, so wie es der Dialog kennt. */
export interface FoodLike extends FoodValues {
  id: string;
  name: string;
}

/** Ein Rezept mit seinen Zutaten pro Portion. */
export interface RezeptLike {
  id: string;
  name: string;
  meal_type: string;
  items: {
    food_id: string | null;
    food_name: string;
    amount_per_portion: number;
    unit: string;
  }[];
}

/** Eine Zeile im Vorlagen-Dialog. */
export interface Komponente {
  /** Zeilen-Schlüssel, stabil über Tausch hinweg. */
  key: string;
  /** Slot des Tages: fruehstueck | mittagessen | abendessen | snack. */
  meal_type: string;
  recipe_id: string;
  /** 0.5 | 1 | 1.5 — Portionsgrösse. */
  faktor: number;
  /** Angehakt = wird eingefügt. */
  aktiv: boolean;
  /** Gibt es nur an Trainingstagen — ohne Training nicht wählbar. */
  training_only: boolean;
}

/**
 * Die Zeilen, die für den gewählten Tag-Typ überhaupt zur Auswahl stehen.
 *
 * Ohne Training verschwinden die trainingsgebundenen Zeilen komplett —
 * nicht nur abgehakt, sondern gar nicht erst angeboten. Sonst hakt man sie
 * jedes Mal von Hand ab, und genau das war der Punkt.
 */
export function sichtbareKomponenten(
  alle: Komponente[], mitTraining: boolean
): Komponente[] {
  return mitTraining ? alle : alle.filter((k) => !k.training_only);
}

export interface Ziel {
  kcal: number;
  protein: number;
}

/* --------------------------------------------------------- Konstanten */

/** Auswahlbare Portionsgrössen. Kein Freitextfeld — bewusst grob. */
export const FAKTOREN = [0.5, 1, 1.5] as const;

/**
 * Tagesziele nach Tag-Typ.
 *
 * Jede Vorlage gibt es in beiden Ausführungen — entschieden wird beim
 * Einfügen, nicht beim Anlegen. Ohne Training fallen rund 300 kcal weg
 * (typisch das Porridge); das Proteinziel bleibt in beiden Fällen gleich,
 * weil gespart wird an Kalorien, nie am Eiweiss.
 */
export const TAGESZIEL = {
  training: { kcal: 2100, protein: 190 },
  ohne: { kcal: 1800, protein: 190 },
} as const;

export const zielFuer = (mitTraining: boolean): Ziel =>
  mitTraining ? { ...TAGESZIEL.training } : { ...TAGESZIEL.ohne };

/** Bis zu wie vielen Zutaten ein Rezept als "einfach" gilt. */
export const EINFACH_MAX_ZUTATEN = 5;

/**
 * Wie weit eine Alternative über das Restbudget hinausgehen darf.
 * 10 % Luft, weil ein Tagesziel keine harte Grenze ist und ein Rezept
 * sonst schon an 30 kcal scheitert.
 */
export const KCAL_TOLERANZ = 1.1;

/** Ab dieser Abweichung gilt ein Wert als "im grünen Bereich". */
export const AMPEL_TOLERANZ = 0.1;

/**
 * Letzte Mahlzeit an Arbeitstagen. Vorschläge, die zeitlich danach
 * lägen, werden im Tausch-Dialog ausgeblendet (aufhebbar).
 */
export const LETZTE_MAHLZEIT_STUNDE = 17;

/**
 * Womit sich eine Protein-Lücke schliessen lässt, ohne zu kochen.
 * Werte pro 100 g bzw. pro Scoop — bewusst hier und nicht in der
 * Datenbank, damit die Vorschläge auch ohne Treffer in `foods` kommen.
 */
export const PROTEIN_FUELLER = [
  { name: "Magerquark", einheit: "g", schritt: 50, kcalPro100: 67, proteinPro100: 10 },
  { name: "Casein", einheit: "g", schritt: 15, kcalPro100: 365, proteinPro100: 85 },
  { name: "PB2", einheit: "g", schritt: 10, kcalPro100: 462, proteinPro100: 46 },
] as const;

/* ------------------------------------------------------- Grundrechnung */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nährwerte eines Rezepts pro Portion. Zutaten ohne Bezug tragen 0 bei. */
export function rezeptWerte(
  rezept: RezeptLike, foodById: Map<string, FoodLike>
): Nutrition {
  return summe(rezept.items.map((i) => {
    const f = i.food_id ? foodById.get(i.food_id) : undefined;
    return f ? rechne(f, i.amount_per_portion, i.unit)
      : { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
  }));
}

/** Nährwerte mal Portionsfaktor. */
export function skaliert(n: Nutrition, faktor: number): Nutrition {
  return {
    kcal: r1(n.kcal * faktor),
    protein: r1(n.protein * faktor),
    carbs: r1(n.carbs * faktor),
    fat: r1(n.fat * faktor),
    cost: Math.round(n.cost * faktor * 1000) / 1000,
  };
}

/**
 * Summe aller aktiven Komponenten — optional ohne eine bestimmte Zeile.
 * Das `ohneKey` braucht der Tausch-Dialog: für das Restbudget zählt alles
 * ausser der Zeile, die gerade ersetzt werden soll.
 */
export function summeAktiv(
  komponenten: Komponente[],
  werteFuer: (recipeId: string) => Nutrition | undefined,
  ohneKey?: string
): Nutrition {
  return summe(
    komponenten
      .filter((k) => k.aktiv && k.key !== ohneKey)
      .map((k) => {
        const w = werteFuer(k.recipe_id);
        return w ? skaliert(w, k.faktor) : { kcal: 0, protein: 0 };
      })
  );
}

/**
 * Was vom Tagesziel übrig bleibt, wenn alle behaltenen Komponenten
 * abgezogen sind. Kann negativ werden — dann ist der Tag schon voll.
 */
export function restBudget(ziel: Ziel, behalten: Nutrition): Ziel {
  return {
    kcal: r1(ziel.kcal - behalten.kcal),
    protein: r1(ziel.protein - behalten.protein),
  };
}

/**
 * Abstand zweier Nährwertprofile.
 *
 * Kalorien werden in 50er-Schritten gewichtet, Protein in 5er-Schritten
 * und zusätzlich doppelt — bei gleichem Kalorienabstand gewinnt das
 * Rezept, das beim Eiweiss näher liegt. Das entspricht der Priorität:
 * Kalorien sind verhandelbar, Protein nicht.
 */
export function distanz(a: Nutrition | Ziel, b: Nutrition | Ziel): number {
  const dKcal = Math.abs((a.kcal ?? 0) - (b.kcal ?? 0)) / 50;
  const dProtein = Math.abs((a.protein ?? 0) - (b.protein ?? 0)) / 5;
  return r1(dKcal + dProtein * 2);
}

/* ---------------------------------------------------------- Alternativen */

export interface Alternative {
  rezept: RezeptLike;
  /** Nährwerte bei Faktor 1. */
  werte: Nutrition;
  /** Differenz zur ursprünglichen Komponente. */
  delta: { kcal: number; protein: number };
  /** Passt es ins Restbudget? */
  passt: boolean;
  /** Vorbereitete, noch nicht gegessene Portionen dieses Rezepts. */
  bestand: number;
  /** Höchstens EINFACH_MAX_ZUTATEN Zutaten. */
  einfach: boolean;
  /** Sortierwert, kleiner ist näher. */
  score: number;
}

export interface AlternativenOptionen {
  /** Alle Rezepte, aus denen gewählt werden darf. */
  rezepte: RezeptLike[];
  foodById: Map<string, FoodLike>;
  /** Was vom Tagesziel übrig ist, ohne die zu ersetzende Zeile. */
  rest: Ziel;
  /** Die Komponente, die ersetzt werden soll (für das Delta). */
  original?: Nutrition;
  /** recipe_id -> vorbereitete Portionen. */
  bestand?: Map<string, number>;
  /** Nur Rezepte, die zum Slot passen (Snack vs. Hauptmahlzeit). */
  slot?: string;
  /** Nur Rezepte mit höchstens fünf Zutaten. */
  nurEinfach?: boolean;
  /** Auch Rezepte zeigen, die nicht ins Restbudget passen. */
  auchUnpassende?: boolean;
  /** Das aktuell gewählte Rezept nicht noch einmal anbieten. */
  ausserRecipeId?: string;
}

const istSnackSlot = (s: string) => s === "snack";

/**
 * Passende Alternativen, sortiert.
 *
 * Reihenfolge der Kriterien:
 *   1. Passt ins Restbudget (unpassende ganz nach hinten)
 *   2. Vorbereitete Portionen vorhanden — was im Kühlschrank steht,
 *      gewinnt gegen etwas, das erst noch gekocht werden müsste
 *   3. Nährwert-Nähe zum Restbudget
 */
export function alternativen(o: AlternativenOptionen): Alternative[] {
  const bestand = o.bestand ?? new Map<string, number>();

  const liste = o.rezepte
    .filter((r) => r.id !== o.ausserRecipeId)
    .filter((r) => (o.slot ? istSnackSlot(r.meal_type) === istSnackSlot(o.slot) : true))
    .filter((r) => (o.nurEinfach ? r.items.length <= EINFACH_MAX_ZUTATEN : true))
    .map<Alternative>((r) => {
      const werte = rezeptWerte(r, o.foodById);
      const passt =
        werte.kcal <= Math.max(0, o.rest.kcal) * KCAL_TOLERANZ &&
        werte.kcal > 0;
      const vorrat = bestand.get(r.id) ?? 0;
      return {
        rezept: r,
        werte,
        delta: {
          kcal: r1(werte.kcal - (o.original?.kcal ?? 0)),
          protein: r1(werte.protein - (o.original?.protein ?? 0)),
        },
        passt,
        bestand: vorrat,
        einfach: r.items.length <= EINFACH_MAX_ZUTATEN,
        score: distanz(werte, o.rest),
      };
    });

  const gefiltert = o.auchUnpassende ? liste : liste.filter((a) => a.passt);

  return gefiltert.sort((a, b) => {
    if (a.passt !== b.passt) return a.passt ? -1 : 1;
    const aVorrat = a.bestand > 0 ? 1 : 0;
    const bVorrat = b.bestand > 0 ? 1 : 0;
    if (aVorrat !== bVorrat) return bVorrat - aVorrat;
    return a.score - b.score;
  });
}

/* -------------------------------------------------------- Protein-Lücke */

export interface FuellerVorschlag {
  name: string;
  menge: number;
  einheit: string;
  kcal: number;
  protein: number;
}

/**
 * Vorschläge, um eine Protein-Lücke zu schliessen.
 *
 * Gerundet wird immer auf den nächsten sinnvollen Schritt nach oben
 * (50 g Quark, 15 g Pulver) — krumme Mengen wiegt niemand ab. Wenn keine
 * Lücke da ist, kommt eine leere Liste zurück.
 */
export function proteinLuecke(
  ziel: Ziel, aktuell: Nutrition, max = 2
): FuellerVorschlag[] {
  const fehlt = r1(ziel.protein - aktuell.protein);
  if (fehlt <= 0) return [];

  return PROTEIN_FUELLER
    .map((f) => {
      const roh = (fehlt / f.proteinPro100) * 100;
      const menge = Math.ceil(roh / f.schritt) * f.schritt;
      return {
        name: f.name,
        menge,
        einheit: f.einheit,
        kcal: Math.round((f.kcalPro100 * menge) / 100),
        protein: r1((f.proteinPro100 * menge) / 100),
      };
    })
    // Was mehr als das doppelte Kalorienbudget der Lücke kostet, ist
    // kein Vorschlag, sondern eine zweite Mahlzeit.
    .sort((a, b) => a.kcal - b.kcal)
    .slice(0, max);
}

/* ------------------------------------------------------------- Ampel */

export type AmpelStand = "gut" | "unter" | "ueber";

/**
 * Ampel für die Live-Summe im Dialog.
 *
 * Protein unter Ziel ist rot — das ist die Zahl, die nicht gerissen
 * werden darf. Kalorien sind erst über +10 % rot; darunter ist die
 * Abweichung Alltag.
 */
export function ampelProtein(ziel: number, ist: number): AmpelStand {
  return ist + 0.5 < ziel ? "unter" : "gut";
}

export function ampelKcal(ziel: number, ist: number): AmpelStand {
  if (ist > ziel * (1 + AMPEL_TOLERANZ)) return "ueber";
  if (ist < ziel * (1 - AMPEL_TOLERANZ)) return "unter";
  return "gut";
}

/* ------------------------------------------------------------ Zeitfenster */

/**
 * Übliche Uhrzeit eines Slots. Nur für den Zeitfenster-Filter an
 * Arbeitstagen — der Plan selbst kennt keine festen Uhrzeiten.
 */
export const SLOT_STUNDE: Record<string, number> = {
  fruehstueck: 7,
  mittagessen: 11,
  abendessen: 18,
  snack: 15,
};

/**
 * Liegt der Slot an einem Arbeitstag hinter der letzten Mahlzeit?
 * Dann werden im Tausch-Dialog Vorschläge dafür ausgeblendet, solange
 * der Filter nicht von Hand aufgehoben wird.
 */
export function ausserhalbZeitfenster(slot: string, arbeitstag: boolean): boolean {
  if (!arbeitstag) return false;
  return (SLOT_STUNDE[slot] ?? 0) > LETZTE_MAHLZEIT_STUNDE;
}
