/**
 * Kategorien für die aktiven Trades.
 *
 * Die Liste auf /trading ist eine Liste, und das soll sie bleiben. Sobald
 * mehr als eine Handvoll Zeilen darin steht, will man sie aber sortieren
 * können — nach Setup-Art, nach Zeitrahmen, nach „diese Woche" und
 * „irgendwann", je nachdem, wonach Kerim gerade denkt. Deshalb frei
 * benannte Kategorien statt fester Rubriken: welche Einteilung trägt, weiss
 * man erst, wenn man eine Weile damit gearbeitet hat.
 *
 * Reine Rechnung ohne Ladepfad — prüfbar über `tools/checks/kategorien.mts`.
 */

export interface Kategorie {
  id: string;
  name: string;
  /** Schlüssel aus `FARBEN`. Unbekannte Werte fallen auf "neutral" zurück. */
  farbe: string;
  sortOrder: number;
}

export interface FarbWahl {
  key: string;
  label: string;
  /** Tailwind-Klasse für den Punkt. Muss als Literal dastehen, sonst wird
   *  die Klasse beim Bauen wegoptimiert. */
  punkt: string;
}

export const FARBEN: FarbWahl[] = [
  { key: "accent", label: "Bernstein", punkt: "bg-accent" },
  { key: "good", label: "Grün", punkt: "bg-good" },
  { key: "bad", label: "Rot", punkt: "bg-bad" },
  { key: "zeit", label: "Blau", punkt: "bg-zeit" },
  { key: "essen", label: "Oliv", punkt: "bg-essen" },
  { key: "trading", label: "Violett", punkt: "bg-trading" },
  { key: "neutral", label: "Grau", punkt: "bg-ink-faint" },
];

export function farbPunkt(farbe: string | null | undefined): string {
  return FARBEN.find((f) => f.key === farbe)?.punkt ?? "bg-ink-faint";
}

/** Reihenfolge: eigene Sortierung, dann Name. Gleichstand bleibt stabil. */
export function sortiereKategorien(k: Kategorie[]): Kategorie[] {
  return [...k].sort((a, b) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de"));
}

export interface KategorieGruppe<T> {
  /** Null = die Zeilen ohne Kategorie. */
  kategorie: Kategorie | null;
  zeilen: T[];
}

/**
 * Zeilen nach Kategorie gruppieren.
 *
 * Zwei Entscheidungen, die man beim Lesen sonst für Zufall hält:
 *
 * **Leere Kategorien fallen raus.** Eine Überschrift ohne Zeile darunter ist
 * kein Ordnungsangebot, sondern eine Lücke, die man jedes Mal überliest. Wer
 * seine Kategorien verwalten will, tut das in den Einstellungen.
 *
 * **„Ohne Kategorie" steht unten, nicht oben.** Sonst wäre das Unsortierte
 * das Erste, was man sieht — und genau davon soll die Einteilung wegführen.
 * Gibt es gar keine Kategorien, ist es die einzige Gruppe und die Frage
 * stellt sich nicht.
 */
export function gruppiereNachKategorie<T extends { kategorie_id: string | null }>(
  zeilen: T[], kategorien: Kategorie[],
): KategorieGruppe<T>[] {
  const gruppen: KategorieGruppe<T>[] = [];

  for (const k of sortiereKategorien(kategorien)) {
    const treffer = zeilen.filter((z) => z.kategorie_id === k.id);
    if (treffer.length > 0) gruppen.push({ kategorie: k, zeilen: treffer });
  }

  // Auch Zeilen mit einer Kategorie-ID, die es nicht mehr gibt, landen hier —
  // besser sichtbar unter „ohne" als unsichtbar in einer Gruppe, die fehlt.
  const bekannt = new Set(kategorien.map((k) => k.id));
  const ohne = zeilen.filter((z) => !z.kategorie_id || !bekannt.has(z.kategorie_id));
  if (ohne.length > 0) gruppen.push({ kategorie: null, zeilen: ohne });

  return gruppen;
}
