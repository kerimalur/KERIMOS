/**
 * Wochenziele — gemeinsame Typen und reine Rechnungen (26.09.2026).
 *
 * Kerims Ansage: bewusst Wochenziele, keine Aufgabenliste. Ein Ziel ist ein
 * Titel mit optionalen Details und steht in einem von drei Zuständen. Mehr
 * nicht — es soll effizient sein, nicht kompliziert.
 */

export type ZielStatus = "offen" | "angefangen" | "fertig";

export const STATI: { key: ZielStatus; label: string }[] = [
  { key: "offen", label: "Noch nicht angefangen" },
  { key: "angefangen", label: "Angefangen" },
  { key: "fertig", label: "Fertig" },
];

export interface Wochenziel {
  id: string;
  woche: string;
  titel: string;
  details: string;
  status: ZielStatus;
  dringend: boolean;
  /** Woche, in der das Ziel ursprünglich stand — gesetzt, sobald es übernommen wurde. */
  seit: string | null;
  reihenfolge: number;
  erstellt: string;
}

/** Klick auf den Kreis: offen → angefangen → fertig → offen. */
export function naechsterStatus(s: ZielStatus): ZielStatus {
  return s === "offen" ? "angefangen" : s === "angefangen" ? "fertig" : "offen";
}

/** ISO-Kalenderwoche eines Datums (YYYY-MM-DD). */
export function kalenderwoche(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  const tag = (d.getUTCDay() + 6) % 7;          // Montag = 0
  d.setUTCDate(d.getUTCDate() - tag + 3);        // Donnerstag derselben Woche
  const ersterDo = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const tagErsterDo = (ersterDo.getUTCDay() + 6) % 7;
  ersterDo.setUTCDate(ersterDo.getUTCDate() - tagErsterDo + 3);
  return 1 + Math.round((d.getTime() - ersterDo.getTime()) / (7 * 86_400_000));
}

/** Dringende zuerst, dann in der Reihenfolge, in der sie angelegt wurden. */
export function sortiere(ziele: Wochenziel[]): Wochenziel[] {
  return [...ziele].sort((a, b) =>
    Number(b.dringend) - Number(a.dringend)
    || a.reihenfolge - b.reihenfolge
    || a.erstellt.localeCompare(b.erstellt));
}
