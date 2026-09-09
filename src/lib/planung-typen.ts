import type { Dringlichkeit } from "@/lib/planung-kalender";

/**
 * Die Formen der Planung — ohne Datenbank, ohne `server-only`.
 *
 * Warum getrennt von `lib/planung.ts`: dort steht `import "server-only"`, und
 * das ist kein Kommentar, sondern eine Sperre. Sobald eine Client-Komponente
 * etwas von dort zur Laufzeit braucht — und `KATEGORIEN` ist ein Wert, kein
 * Typ — bricht der Build mit „You're importing a component that needs
 * server-only". Der Fehler kommt erst beim Bündeln, nicht beim Typecheck.
 *
 * Typen allein wären kein Problem (sie werden beim Übersetzen entfernt), aber
 * sie hier bei ihrem Wert stehen zu lassen hält beides an einem Ort.
 */

/**
 * "Aufgabe" oder "Habit" — der einzige Unterschied zwischen beiden.
 *
 * Strukturell sind sie dasselbe: eine Zeile mit Namen, Haken und optionalem
 * Tag. Die Kategorie steuert nur, wie sie angezeigt und gefiltert werden.
 * Ein eigenes Modell für Gewohnheiten hätte einen zweiten Kalender, eine
 * zweite Checkbox-Logik und eine zweite Liste bedeutet — für einen
 * Unterschied, der in Wahrheit ein Etikett ist.
 */
export type Kategorie = "Aufgabe" | "Habit";

/**
 * Woche oder Monat.
 *
 * Die Woche ist die Vorgabe: sie beantwortet „was ist jetzt dran", und das
 * ist die Frage, mit der man morgens auf die Seite schaut. Der Monat
 * beantwortet „wann habe ich Zeit" — seltener gebraucht, deshalb hinter
 * einem Umschalter.
 */
export type KalenderAnsicht = "woche" | "monat";

/** Aus der Adresse: alles ausser "monat" heisst Woche. */
export const zuAnsicht = (roh: string | undefined): KalenderAnsicht =>
  roh === "monat" ? "monat" : "woche";

export const KATEGORIEN: Kategorie[] = ["Aufgabe", "Habit"];

/**
 * Eine selbst benannte Etappe eines Projekts.
 *
 * Der Fortschrittsbalken misst diese und NICHT die Aufgaben. „5 von 8
 * Aufgaben erledigt" wäre eine Aussage über Betriebsamkeit: wer während
 * eines Umzugs zwanzig Kleinigkeiten einträgt, fällt im Balken zurück,
 * obwohl er vorangekommen ist. Ein Meilenstein ist das, was man selbst als
 * Etappe benennt — und wer keine setzt, bekommt keinen Balken.
 */
export interface Meilenstein {
  id: string;
  name: string;
  erledigt: boolean;
  sortOrder: number;
}

export interface Projekt {
  id: string;
  name: string;
  farbe: string;
  sortOrder: number;
  /** Wie viele Aufgaben offen sind — die Zahl neben dem Namen. */
  offen: number;
  gesamt: number;
  /** Leer heisst: kein Balken. Das ist die Vorgabe, kein fehlendes Feature. */
  meilensteine: Meilenstein[];
}

export interface Aufgabe {
  id: string;
  name: string;
  erledigt: boolean;
  /** ISO-Datum oder null. Nur Aufgaben mit Datum stehen im Kalender. */
  faellig: string | null;
  kategorie: Kategorie;
  projektId: string | null;
  projektName: string | null;
  projektFarbe: string | null;
  dringend: Dringlichkeit;
}
