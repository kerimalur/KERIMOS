/**
 * Feste Termine, auf die alles zuläuft. Bewusst hier im Code statt in der
 * Datenbank: sie ändern sich einmal im Jahr, nicht einmal pro Woche.
 * Anpassen heisst: Datum korrigieren, fertig.
 */
export interface Meilenstein {
  label: string;
  /** ISO-Datum. */
  date: string;
}

export const MEILENSTEINE: Meilenstein[] = [
  { label: "Militär", date: "2027-01-25" },
  { label: "Militär vorbei", date: "2027-05-28" },
  { label: "Berufsmatura", date: "2027-08-16" },
];

/** Tage bis zum Datum, negativ wenn vorbei. */
export function tageBis(iso: string, heute: string): number {
  return Math.round(
    (new Date(iso + "T12:00:00").getTime() - new Date(heute + "T12:00:00").getTime())
    / 86400000
  );
}

/** Der nächste noch bevorstehende Meilenstein. */
export function naechsterMeilenstein(heute: string) {
  const kommend = MEILENSTEINE
    .map((m) => ({ ...m, tage: tageBis(m.date, heute) }))
    .filter((m) => m.tage >= 0)
    .sort((a, b) => a.tage - b.tage);
  return kommend[0] ?? null;
}
