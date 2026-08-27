/**
 * Steht dieser Trade schon im Journal?
 *
 * Der Grund: die MT5-Brücke trägt Trades selbst ein, und Kerim trägt sie
 * manchmal von Hand nach — bevor die Brücke lief, oder weil er nicht sicher
 * war, ob sie es getan hat. Zwei Zeilen für denselben Trade verdoppeln die
 * Stichprobe und verfälschen jede Kennzahl, ohne dass man es der Zahl ansieht.
 *
 * **Gewarnt wird, nicht blockiert.** Eine Sperre, die man nicht übergehen
 * kann, kostet irgendwann einen echten zweiten Trade — zwei Einstiege am
 * selben Tag im selben Paar sind selten, aber nicht unmöglich. Deshalb sagt
 * die Prüfung „schau nochmal hin" und nicht „nein".
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit `tools/checks/duplikat.mts`.
 */

/** Pip-Grösse: JPY-Paare rechnen mit 0.01, alles andere mit 0.0001. */
export function pipGroesse(paar: string): number {
  return paar.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
}

/**
 * Wie nah zwei Einstiege liegen dürfen, um als derselbe Trade zu gelten.
 *
 * 15 Pips: Kerims Einstiege liegen an einer Linie, und zwischen Brücke
 * (volumengewichteter Mittelwert zweier Positionen) und Handeintrag (was er
 * im Chart abgelesen hat) liegen leicht ein paar Pips. Enger wäre der Sinn
 * verfehlt, weiter würde zwei echte Einstiege am selben Level zusammenwerfen.
 */
export const PIP_TOLERANZ = 15;

/** Wie viele Tage Unterschied noch als derselbe Trade durchgehen. */
export const TAG_TOLERANZ = 1;

export interface Kandidat {
  id: string;
  pair: string;
  direction: string;
  date: string;
  entryPrice: number | null;
  rMultiple: number;
  status: string;
}

export interface Neuling {
  pair: string;
  direction: string;
  date: string;
  entryPrice: number | null;
}

const tageAuseinander = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000;

/**
 * Der erste Treffer, der wie derselbe Trade aussieht — oder null.
 *
 * Vier Bedingungen, alle nötig: gleiches Paar, gleiche Richtung, Datum
 * höchstens einen Tag auseinander, Einstieg innerhalb der Toleranz.
 *
 * **Ohne Einstiegspreis gilt es NICHT als Duplikat.** Paar, Richtung und Tag
 * allein treffen auf jeden zweiten Einstieg zu, den Kerim an einer Linie
 * nimmt — eine Warnung, die ständig kommt, wird weggeklickt und schützt
 * dann vor gar nichts.
 */
export function findeDuplikat(neu: Neuling, bestand: readonly Kandidat[]): Kandidat | null {
  if (neu.entryPrice === null || !Number.isFinite(neu.entryPrice)) return null;

  const paar = neu.pair.toUpperCase();
  const grenze = PIP_TOLERANZ * pipGroesse(paar);

  return bestand.find((k) =>
    k.pair.toUpperCase() === paar
    && k.direction === neu.direction
    && tageAuseinander(k.date, neu.date) <= TAG_TOLERANZ
    && k.entryPrice !== null
    && Math.abs(k.entryPrice - (neu.entryPrice as number)) <= grenze) ?? null;
}

/** Der Satz, der im Formular steht. Nennt Zahlen, nicht nur „schon da". */
export function duplikatText(t: Kandidat): string {
  const preis = t.entryPrice === null ? "ohne Einstieg" : `Einstieg ${t.entryPrice}`;
  const stand = t.status === "open" ? "läuft noch" : `${t.rMultiple.toFixed(1)} R`;
  return `${t.pair} ${t.direction === "long" ? "Long" : "Short"} vom ${t.date}, `
    + `${preis}, ${stand}`;
}
