import type { Punkt } from "./reihen";

/**
 * Umrechnungen zwischen Datenbankzeilen und Zeitreihen.
 *
 * Getrennt von `daten.ts`, weil dort der Supabase-Zugriff liegt
 * (`server-only`) und diese Rechnungen genau die Stelle sind, an der stille
 * Fehler entstehen: eine Zeile ohne Open Interest, ein Datum als Zeitstempel,
 * eine unsortierte Reihe. Ohne Datenbank prüfbar.
 */

export interface CotZeile {
  datum: string;
  lang: number | null;
  kurz: number | null;
  oi: number | null;
}

/**
 * Netto-Position als Anteil des Open Interest.
 *
 * Anteil statt Kontraktzahl: Der Markt ist über zwanzig Jahre gewachsen,
 * 100 000 Kontrakte netto bedeuten 2005 und 2026 nicht dasselbe. Ein
 * Perzentil über absolute Zahlen würde deshalb vor allem das Wachstum des
 * Marktes messen, nicht die Positionierung.
 */
export function nettoReihe(zeilen: CotZeile[]): Punkt[] {
  return zeilen
    .filter((z) => z.lang !== null && z.kurz !== null && z.oi !== null && Number(z.oi) > 0)
    .map((z) => ({
      datum: z.datum.slice(0, 10),
      wert: (Number(z.lang) - Number(z.kurz)) / Number(z.oi),
    }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Datenbankzeilen mit `date`/`value` zu einer sauberen Reihe. */
export function zuReihe(zeilen: { date: string; value: number | null }[]): Punkt[] {
  return zeilen
    .filter((z) => z.value !== null && Number.isFinite(Number(z.value)))
    .map((z) => ({ datum: z.date.slice(0, 10), wert: Number(z.value) }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/** "EURUSD" → "EUR_USD" (Oanda-Notation, wie in der Datenbank). */
export function alsInstrument(paar: string): string {
  const p = paar.toUpperCase().replace(/[^A-Z]/g, "");
  return `${p.slice(0, 3)}_${p.slice(3, 6)}`;
}

/** "EUR_USD" → "EURUSD". */
export function alsPaar(instrument: string): string {
  return instrument.toUpperCase().replace(/[^A-Z]/g, "");
}
