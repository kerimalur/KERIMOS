/**
 * Welche Woche gerade dran ist — Rückblick und Ziele als Paar.
 *
 * Bis zum 24.08.2026 liess sich im Rückblick durch alle Wochen blättern, und
 * die Wochenziele galten immer für die laufende Woche. Beides zusammen ergab
 * ein Formular, das schon Text enthielt, wenn man es öffnete, und Ziele, die
 * man frühestens montags setzen konnte. Kerim plant aber am Wochenende.
 *
 * Die Regel jetzt:
 *
 *   Sa + So   Rückblick auf die Woche, die gerade endet · Ziele für die kommende
 *   Mo - Fr   Rückblick auf die Woche davor (nachgeholt) · Ziele für die laufende
 *
 * Die Zielwoche ist also immer Rückblickwoche + 1. Damit ist das Wochenende
 * der reguläre Weg und Montag bis Freitag das Nachholfenster — vorher war es
 * genau umgekehrt.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit `tools/checks/wochenrueckblick.mts`.
 */
import { weekStart, addDays } from "@/lib/time";

export interface Wochenpaar {
  /** Woche, auf die zurückgeblickt wird (Montag, ISO). */
  rueckblick: string;
  /** Woche, für die Ziele gesetzt werden (Montag, ISO). */
  ziele: string;
  /** True am Samstag und Sonntag — dann ist es der reguläre Termin. */
  amWochenende: boolean;
}

export function wochenpaar(heute: string): Wochenpaar {
  // getDay(): 0 = Sonntag, 6 = Samstag. Mittags gerechnet, damit die
  // Sommerzeit-Umstellung den Tag nicht kippt.
  const tag = new Date(`${heute}T12:00:00`).getDay();
  const amWochenende = tag === 0 || tag === 6;

  const laufende = weekStart(heute);
  const rueckblick = amWochenende ? laufende : addDays(laufende, -7);

  return { rueckblick, ziele: addDays(rueckblick, 7), amWochenende };
}

/**
 * Aus dem Zielfeld werden Wochenziele — eine Zeile, ein Ziel.
 *
 * Getrennt wird nur an Zeilenumbrüchen und Aufzählungszeichen, nicht an
 * Kommas: „Backtest durchziehen, auch wenn es zieht" ist ein Vorsatz und
 * nicht zwei. Gleiche Regel wie bei den Tagesvorsätzen — zwei verschiedene
 * Trennregeln im selben Kopf sind eine zu viel.
 *
 * Mehr als fünf Zeilen werden abgeschnitten. Wer zehn Ziele aufschreibt, hat
 * keine Ziele, sondern eine Aufgabenliste — und die gibt es schon.
 */
export const MAX_ZIELE = 5;

export function zuZielen(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((z) => z.replace(/^\s*[-–—*•]\s*/, "").replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((z) => z.length > 0)
    .filter((z, i, alle) => alle.indexOf(z) === i)
    .slice(0, MAX_ZIELE);
}
