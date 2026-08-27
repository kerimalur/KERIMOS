/**
 * Datumseingabe fürs Backtesten — tippen statt suchen.
 *
 * Der Grund für diese Datei ist eine Zeitmessung, keine Ästhetik: beim
 * Backtesten werden Dutzende Trades hintereinander erfasst, und das
 * Datum-Feld des Browsers zwingt dabei jedes Mal durch einen Kalender, der
 * beim heutigen Tag aufmacht und nach jeder Auswahl wieder zuklappt. Bei
 * fünfzig Trades in einem Abend ist das die grösste einzelne Zeitausgabe im
 * ganzen Ablauf — und sie produziert nichts.
 *
 * Deshalb hier: ein lockerer Parser, der alles frisst, was man beim schnellen
 * Tippen produziert. `12.3.22`, `12.03.2022`, `120322`, `2022-03-12` und
 * `12.3.` (Jahr aus dem Bezug) ergeben alle denselben Wert.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/datum-eingabe.mts`.
 */

export const MONATE_KURZ = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
] as const;

export const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

/** Tage im Monat. `monat` ist 1…12. */
export function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

/**
 * Auf welche Spalte der Erste fällt — 0 = Montag … 6 = Sonntag.
 *
 * Montag zuerst, weil die Woche hier bei Montag anfängt und nicht bei
 * Sonntag: an einem Wochenende wird nicht gehandelt, und die zwei Spalten
 * gehören ans Ende, wo man sie überliest.
 */
export function ersterWochentag(jahr: number, monat: number): number {
  return (new Date(Date.UTC(jahr, monat - 1, 1)).getUTCDay() + 6) % 7;
}

/** Samstag oder Sonntag — am Devisenmarkt gibt es dort keinen Trade. */
export function istWochenende(iso: string): boolean {
  const tag = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return tag === 0 || tag === 6;
}

/** "2022-03-12" plus n Tage. */
export function verschiebeTage(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const alsIso = (jahr: number, monat: number, tag: number): string =>
  `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;

/** "2022-03-12" → "12.03.2022". Leerer Wert bleibt leer. */
export const alsDeutsch = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
    : "";

/** Zweistellige Jahre: 00–79 sind 2000er, 80–99 sind 1900er. */
function volljahr(roh: number): number {
  if (roh >= 1000) return roh;
  return roh < 80 ? 2000 + roh : 1900 + roh;
}

function baue(tag: number, monat: number, jahr: number): string | null {
  if (monat < 1 || monat > 12) return null;
  if (jahr < 1900 || jahr > 2199) return null;
  if (tag < 1 || tag > tageImMonat(jahr, monat)) return null;
  return alsIso(jahr, monat, tag);
}

/**
 * Alles, was beim schnellen Tippen herauskommt, zu einem ISO-Datum.
 *
 * `bezugsJahr` springt ein, wenn im Text kein Jahr steht — beim Backtesten
 * ist das der Regelfall, weil man einen Monat am Stück durcharbeitet.
 * Gibt null zurück, wenn sich nichts Gültiges lesen lässt; das Feld zeigt
 * dann einen Hinweis, statt still ein falsches Datum zu speichern.
 */
export function parseDatum(roh: string, bezugsJahr: number): string | null {
  const text = roh.trim();
  if (text === "") return null;

  // ISO, so wie es aus der Datenbank kommt.
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return baue(Number(iso[3]), Number(iso[2]), Number(iso[1]));

  // Mit Trennzeichen: Punkt, Schrägstrich, Bindestrich, Leerzeichen.
  const getrennt = text.match(/^(\d{1,2})[.\/\-\s](\d{1,2})(?:[.\/\-\s](\d{2,4}))?\.?$/);
  if (getrennt) {
    const jahr = getrennt[3] ? volljahr(Number(getrennt[3])) : bezugsJahr;
    return baue(Number(getrennt[1]), Number(getrennt[2]), jahr);
  }

  // Reine Ziffernfolge vom Zehnerblock: ddmm, ddmmyy, ddmmyyyy.
  const ziffern = text.match(/^(\d{2})(\d{2})(\d{2}|\d{4})?$/);
  if (ziffern) {
    const jahr = ziffern[3] ? volljahr(Number(ziffern[3])) : bezugsJahr;
    return baue(Number(ziffern[1]), Number(ziffern[2]), jahr);
  }

  return null;
}
