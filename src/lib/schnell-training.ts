/**
 * Die Rechenteile hinter „Push oder Pull antippen".
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit
 * `tools/checks/schnell-training.mts`.
 */

/** Wie weit zurück nachgetragen werden darf. */
export const NACHTRAG_TAGE = 7;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const minusTage = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/**
 * Welches Datum der Eintrag bekommt.
 *
 * Alles Unklare fällt auf heute zurück, statt abgelehnt zu werden: der Knopf
 * soll immer etwas eintragen. Aber nicht irgendwohin — ein Datum in der
 * Zukunft oder weiter als eine Woche zurück wäre ein Tippfehler oder ein
 * manipuliertes Formularfeld, und eine Einheit im Jahr 2019 findet nie
 * jemand wieder.
 */
export function erlaubtesDatum(roh: unknown, heute: string): string {
  const s = typeof roh === "string" ? roh.slice(0, 10) : "";
  if (!ISO.test(s)) return heute;
  if (s > heute) return heute;
  if (s < minusTage(heute, NACHTRAG_TAGE)) return heute;
  return s;
}

/**
 * Der Zeitstempel für einen nachgetragenen Tag.
 *
 * Mittags UTC, nicht Mitternacht. Nicht wegen der Schweiz — die liegt VOR
 * UTC, dort würde aus Mitternacht 02:00 desselben Tages. Sondern weil Mittag
 * den grösstmöglichen Abstand zu beiden Tagesgrenzen hält: er bleibt bei
 * jedem Versatz von −11 bis +11 Stunden auf demselben Tag. Mitternacht UTC
 * rutscht dagegen westlich von Greenwich sofort einen Tag zurück.
 */
export function zeitstempel(datum: string, heute: string, jetzt: string): string {
  return datum === heute ? jetzt : `${datum}T12:00:00.000Z`;
}

/** „Push" oder „Pull" — alles andere ist kein gültiger Knopf. */
export function istSplit(v: unknown): v is "push" | "pull" {
  return v === "push" || v === "pull";
}
