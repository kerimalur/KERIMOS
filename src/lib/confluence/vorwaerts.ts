import { wilson, type Quote } from "./bilanz";
import type { Kurspunkt } from "./saison";

/**
 * Was der Markt NACH einem Signal tat — gegen das, was er sowieso tat.
 *
 * Die Idee ist aus Kerims Pine-Script übernommen und war dort das Beste am
 * ganzen Skript: eine Trefferquote von 62 % sagt nichts, solange man nicht
 * weiss, wie oft der Markt in einer BELIEBIGEN Woche in dieselbe Richtung
 * lief. Deshalb läuft hier zu jedem Signalergebnis eine Basisstichprobe über
 * alle Wochen mit. Das Ergebnis ist der ABSTAND, nicht der Wert.
 *
 * Was hier NICHT gemessen wird, und das gehört dazu: es gibt keinen Stop und
 * kein Ziel. Die Frage lautet „driftet der Kurs nach einem Signal", nicht
 * „gewinnt Kerims Setup". Beides sind sinnvolle Fragen, aber sie sind nicht
 * dieselbe — ein Faktor kann Drift haben und trotzdem jeden 1R-Stop
 * abräumen, bevor die Drift eintritt.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/vorwaerts.mts`.
 */

/** Horizonte in Wochen — wie im Pine. */
export const HORIZONTE = [4, 8, 13, 26] as const;
export type Horizont = (typeof HORIZONTE)[number];

const TAG_MS = 86_400_000;

export interface Signal {
  /** "YYYY-MM-DD" — der Tag, an dem man es GEWUSST hätte. */
  datum: string;
  richtung: -1 | 1;
}

export interface Seite {
  n: number;
  /** Durchschnittliche Rendite in %, in Signalrichtung. */
  schnitt: number | null;
  /** Median — robuster, falls ein einzelner Ausreisser den Schnitt trägt. */
  median: number | null;
  /** Anteil positiver Beobachtungen, mit Intervall. */
  quote: Quote;
}

export interface VorwaertsZeile {
  wochen: Horizont;
  signal: Seite;
  /** Basis, bereits auf die Richtungsmischung der Signale gedreht. */
  basis: Seite;
  /** Schnitt Signal minus Schnitt Basis, in Prozentpunkten. */
  abstand: number | null;
  /** Beobachtungen, deren Horizont noch nicht abgelaufen ist. */
  offen: number;
  satz: string;
}

/** Ab so vielen Signalen lohnt der Vergleich überhaupt. */
export const MIN_SIGNALE = 15;

const median = (w: number[]): number | null => {
  if (w.length === 0) return null;
  const s = [...w].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const seite = (werte: number[]): Seite => ({
  n: werte.length,
  schnitt: werte.length > 0 ? werte.reduce((a, b) => a + b, 0) / werte.length : null,
  median: median(werte),
  quote: wilson(werte.filter((r) => r > 0).length, werte.filter((r) => r !== 0).length),
});

/**
 * Der Schlusskurs am oder nach `datum` — sonst null.
 *
 * Kein Rückwärtssuchen: wer den letzten Kurs DAVOR nimmt, misst einen
 * Horizont, der in Wirklichkeit kürzer war.
 */
function kursAb(kurse: Kurspunkt[], datum: string): number | null {
  for (const k of kurse) if (k.datum >= datum) return k.schluss;
  return null;
}

const plus = (datum: string, tage: number): string => {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
};

/**
 * Signalrenditen gegen die Basisstichprobe.
 *
 * `kurse` müssen aufsteigend sortiert sein. Die Basis nimmt JEDEN siebten
 * Kurspunkt als Einstieg — ungefähr wöchentlich, wie die COT-Termine, damit
 * beide Stichproben denselben Rhythmus haben.
 */
export function vorwaertsVergleich(
  kurse: Kurspunkt[], signale: Signal[], horizonte: readonly Horizont[] = HORIZONTE,
): VorwaertsZeile[] {
  if (kurse.length === 0) {
    return horizonte.map((wochen) => ({
      wochen,
      signal: seite([]), basis: seite([]), abstand: null, offen: 0,
      satz: "Keine Kurse geladen.",
    }));
  }
  const letzter = kurse[kurse.length - 1].datum;

  // Basis: jede Woche, immer long. Für Shorts gilt spiegelbildlich das
  // Negative davon — deshalb wird unten nach der Richtungsmischung gewichtet.
  const basisTage: string[] = [];
  for (let i = 0; i < kurse.length; i += 7) basisTage.push(kurse[i].datum);

  return horizonte.map((wochen) => {
    const tage = wochen * 7;

    const rendite = (von: string, richtung: -1 | 1): number | null => {
      const a = kursAb(kurse, von);
      const b = kursAb(kurse, plus(von, tage));
      if (a === null || b === null || a === 0) return null;
      // Das Ende muss WIRKLICH in der Historie liegen. Ohne diese Prüfung
      // liefert kursAb den letzten vorhandenen Kurs und der Horizont wäre
      // stillschweigend kürzer als behauptet.
      if (plus(von, tage) > letzter) return null;
      return ((b - a) / a) * 100 * richtung;
    };

    const sig: number[] = [];
    let offen = 0;
    let lang = 0, kurz = 0;
    for (const s of signale) {
      const r = rendite(s.datum, s.richtung);
      if (r === null) { offen++; continue; }
      sig.push(r);
      if (s.richtung > 0) lang++; else kurz++;
    }

    const basisLang = basisTage
      .map((d) => rendite(d, 1))
      .filter((r): r is number => r !== null);

    // Die Basis auf die Richtungsmischung der Signale drehen: bei zwei Dritteln
    // Shorts muss der Massstab entsprechend gespiegelt sein, sonst vergleicht
    // man Long-Signale mit einer Long-Basis und Short-Signale ebenfalls damit.
    const anteilLang = lang + kurz > 0 ? lang / (lang + kurz) : 1;
    const basisGedreht = basisLang.map((r) => r * (2 * anteilLang - 1));

    const sS = seite(sig);
    const bS = seite(basisGedreht);
    const abstand = sS.schnitt !== null && bS.schnitt !== null
      ? sS.schnitt - bS.schnitt : null;

    let satz: string;
    if (sS.n < MIN_SIGNALE) {
      satz = `${sS.n} Signale mit abgelaufenem Horizont`
        + (offen > 0 ? `, ${offen} noch offen` : "")
        + `. Unter ${MIN_SIGNALE} sagt der Vergleich nichts.`;
    } else if (abstand === null) {
      satz = "Keine Basis zum Vergleichen.";
    } else {
      const rein = abstand > 0 ? "über" : "unter";
      satz = `${sS.schnitt!.toFixed(2)} % im Schnitt gegen ${bS.schnitt!.toFixed(2)} % `
        + `in einer beliebigen Woche — ${Math.abs(abstand).toFixed(2)} Punkte ${rein} `
        + `der Basis. `
        + (Math.abs(abstand) < 0.2
          ? "Das ist innerhalb dessen, was Rauschen erzeugt."
          : abstand > 0
            ? "Das ist ein Vorsprung — mit einem Stop davor muss er sich erst noch bewähren."
            : "Das Signal lief SCHLECHTER als der Durchschnitt.");
    }

    return { wochen, signal: sS, basis: bS, abstand, offen, satz };
  });
}
