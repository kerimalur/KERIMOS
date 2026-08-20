import { cotBildFuer, type CotBild, type CotRohdaten } from "./cot-divergenz";
import { plusTage, type Punkt } from "./reihen";

/**
 * COT-Statistik für Monty: nicht nur wie es JETZT steht, sondern wie oft es je
 * so stand.
 *
 * Der Grund für diese Datei ist eine Frage, die man sich beim ersten Blick auf
 * ein Perzentil nicht stellt: ist eine Streckung selten oder normal? Ein
 * Signal, das in jeder dritten Woche auftritt, ist kein Extrem, sondern der
 * Normalzustand — und dann sagt „Commercials im 80. Perzentil" wenig.
 *
 * Gerechnet wird rückwärts über die echten Berichtstermine, jeder mit
 * demselben `cotBildFuer` wie die Live-Anzeige. Kein zweiter Rechenweg, der
 * irgendwann abweichen könnte.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/monty.mts`.
 */

/** Wie weit zurück die Statistik schaut. Drei Jahre, wie das Perzentilfenster. */
export const STAT_WOCHEN = 156;

/**
 * Ab diesem Anteil gestreckter Termine ist die Streckung kein Extrem mehr.
 *
 * 0.25 und nicht etwa 0.5 — es gibt eine rechnerische Obergrenze, die man
 * uebersieht, wenn man die Schwelle nach Gefuehl setzt: steht ein Wert in
 * einem Anteil f des Fensters ganz oben, ist sein eigener Perzentilrang nur
 * noch 1 − f/2. Fuer den 75. Rang heisst das f ≤ 0.5 — mehr als die Haelfte
 * der Termine KANN eine Seite gar nicht gestreckt sein, und beide Seiten
 * gleichzeitig entsprechend viel weniger. Eine Schwelle bei 0.4 waere nie
 * erreicht worden und die Warnung damit toter Code.
 */
export const HAEUFIG_AB = 0.25;

export interface CotStatistik {
  ccy: string;
  /** Der aktuelle Stand — dieselbe Rechnung wie überall. */
  jetzt: CotBild;
  /** Berichtstermine, die überhaupt ausgewertet werden konnten. */
  termine: number;
  /** Davon mit einer Streckung in irgendeine Richtung. */
  gestreckt: number;
  dafuer: number;
  dagegen: number;
  /** Längste ununterbrochene Streckung, in Berichten. */
  laengste: number;
  /** Anteil gestreckter Termine, 0…1. Null ohne Termine. */
  anteil: number | null;
  satz: string;
}

/**
 * Wie oft war diese Währung in den letzten drei Jahren gestreckt?
 *
 * Die Berichtstermine kommen aus der Commercials-Reihe — sie und die
 * Retail-Reihe stammen aus demselben wöchentlichen Bericht und tragen deshalb
 * dieselben Daten.
 */
export function cotStatistik(
  daten: CotRohdaten, ccy: string, stichtag: string, wochen = STAT_WOCHEN,
): CotStatistik {
  const jetzt = cotBildFuer(daten, ccy, stichtag);
  const reihe: Punkt[] = daten.cotKomm?.[ccy] ?? [];
  const termine = reihe.map((p) => p.datum).filter((d) => d <= stichtag).slice(-wochen);

  if (termine.length === 0) {
    return {
      ccy, jetzt, termine: 0, gestreckt: 0, dafuer: 0, dagegen: 0,
      laengste: 0, anteil: null,
      satz: "Zu wenig COT-Historie für eine Statistik.",
    };
  }

  let gestreckt = 0, dafuer = 0, dagegen = 0, laengste = 0, laufend = 0;
  for (const d of termine) {
    // Der Bericht ist erst Tage später bekannt, und `cotBildFuer` zieht diesen
    // Verzug ab. Gefragt wird deshalb eine Woche später — sonst fiele jeder
    // Termin auf seinen eigenen Vorgänger zurück und die Statistik wäre um
    // einen Bericht verschoben.
    const b = cotBildFuer(daten, ccy, plusTage(d, 7));
    if (b.divergenz === 0) { laufend = 0; continue; }
    gestreckt++;
    if (b.divergenz > 0) dafuer++; else dagegen++;
    laufend++;
    laengste = Math.max(laengste, laufend);
  }

  const anteil = gestreckt / termine.length;
  const p = (v: number) => `${(v * 100).toFixed(0)} %`;

  return {
    ccy, jetzt, termine: termine.length, gestreckt, dafuer, dagegen,
    laengste, anteil,
    satz: gestreckt === 0
      ? `In ${termine.length} Berichten kam keine Streckung vor — für diese Währung `
        + "ist der Faktor bisher ohne Aussage."
      : `${gestreckt} von ${termine.length} Berichten gestreckt (${p(anteil)}), `
        + `längste Phase ${laengste} Berichte. `
        + (anteil > HAEUFIG_AB
          ? "Das ist kein Extrem mehr, sondern der Normalzustand — entsprechend "
            + "wenig sagt ein einzelner Stand."
          : "Selten genug, dass ein Stand tatsächlich etwas heisst."),
  };
}
