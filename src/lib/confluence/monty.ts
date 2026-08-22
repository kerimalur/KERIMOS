import "server-only";
import { ladeCotLang, ladeFuerStichtag, ladeKurse, KALIBRIER_JAHRE } from "./daten";
import {
  gesamtbild, kalibriere, raengeReihe, type Gesamtbild, type Kalibrierung,
} from "./kalibrierung";
import { G8, PAARE } from "./faktoren";
import { cotStatistik, type CotStatistik } from "./monty-cot";
import { saisonBild, type Fenster, type SaisonBild } from "./saison";

/**
 * Monty — die Seite, auf der nur steht, was Kerim wirklich benutzt.
 *
 * Kein Zins, keine Inflation, kein Risiko-Regime. Zwei Dinge:
 * Commercials gegen Retail, und Saisonalität. Beides über Jahre, beides mit
 * der Angabe, wie belastbar es ist.
 *
 * Warum getrennt geladen wird: die COT-Reihen kommen in EINEM Zug aus
 * `ladeFuerStichtag`, die Kurse dagegen je Paar einzeln — 28 Paare mal rund
 * 5000 Tageskerzen sind 140 000 Zeilen und damit weit über dem, was ein
 * einzelner Seitenaufruf holen darf. Die Saison-Matrix baut ihre Zeilen
 * deshalb Paar für Paar auf, jede hinter ihrer eigenen Suspense-Grenze.
 */

export interface MontyCot {
  stichtag: string;
  waehrungen: CotStatistik[];
  /** Wie viele der acht Währungen gerade gestreckt sind. */
  gestreckt: number;
  /**
   * Wochenwerte je Währung, direkt aus dem Ladebericht. Steht hier überall 0,
   * ist eine leere Tabelle keine Anzeigefrage, sondern eine Datenlücke — und
   * genau das soll man sehen können, ohne im Code zu suchen.
   */
  gruppen: Record<string, { komm: number; retail: number }>;
}

export async function baueMontyCot(stichtag: string): Promise<MontyCot> {
  const { daten, bericht } = await ladeFuerStichtag(stichtag);
  const waehrungen = G8.map((c) => cotStatistik(daten, c, stichtag))
    // Gestreckte zuerst — das ist das, wonach man auf dieser Seite sucht.
    .sort((a, b) => Math.abs(b.jetzt.divergenz) - Math.abs(a.jetzt.divergenz)
      || a.ccy.localeCompare(b.ccy));

  return {
    stichtag,
    waehrungen,
    gestreckt: waehrungen.filter((w) => w.jetzt.divergenz !== 0).length,
    gruppen: bericht.cotGruppen ?? {},
  };
}

/** Alle 28 Paare, in der Reihenfolge der Confluence-Seite. */
export const MONTY_PAARE: readonly string[] = PAARE;

/** Das Saisonbild eines einzelnen Paares — je Paar aufgerufen, damit es streamt. */
export async function baueSaisonZeile(
  paar: string, fenster: Fenster, heute: string,
): Promise<SaisonBild> {
  const kurse = await ladeKurse(paar);
  return saisonBild(paar, kurse, fenster, heute);
}


/**
 * Die Schwellen-Kalibrierung eines Paares.
 *
 * Getrennt vom Rest der Seite geladen und hinter einer eigenen Suspense-Grenze
 * gerendert: sie rechnet über zwanzig Jahre COT-Historie und braucht die
 * Kursreihe des Paares dazu. Das dauert, und solange es dauert, soll der Rest
 * von Monty schon dastehen.
 *
 * Die Ränge werden je Währung EINMAL gerechnet — nicht je Schwelle. Der Rang
 * einer Woche hängt nur von der eigenen Historie ab, nicht davon, wo die
 * Grenze liegt.
 */
export async function baueKalibrierung(
  paar: string, stichtag: string,
): Promise<Kalibrierung> {
  const [cot, kurse] = await Promise.all([ladeCotLang(stichtag), ladeKurse(paar)]);
  const basis = paar.slice(0, 3);
  const quote = paar.slice(3, 6);
  return kalibriere(
    paar, kurse,
    raengeReihe(cot, basis),
    raengeReihe(cot, quote),
  );
}

export { KALIBRIER_JAHRE };


/** Welche Paare durchgerechnet werden — decken alle acht Währungen ab. */
export const KALIBRIER_PAARE = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
] as const;

/**
 * Alle Paare auf einmal — das Urteil, auf das es ankommt.
 *
 * Ein einzelnes Paar sagt fast nichts: bei fünf Schwellen mal vier Horizonten
 * findet sich immer irgendwo eine gute Zahl. Erst über sieben Paare zeigt
 * sich, ob eine Schwelle wirklich vorne liegt oder ob man nur lange genug
 * gesucht hat.
 *
 * Die COT-Ränge werden je Währung EINMAL gerechnet und dann über alle Paare
 * wiederverwendet — sonst wäre dieselbe Arbeit siebenmal fällig.
 */
export async function baueGesamtbild(stichtag: string): Promise<Gesamtbild> {
  const cot = await ladeCotLang(stichtag);

  const waehrungen = [...new Set(
    KALIBRIER_PAARE.flatMap((p) => [p.slice(0, 3), p.slice(3, 6)]),
  )];
  const raenge = new Map(waehrungen.map((c) => [c, raengeReihe(cot, c)]));

  const alle: Kalibrierung[] = [];
  for (const paar of KALIBRIER_PAARE) {
    const kurse = await ladeKurse(paar);
    alle.push(kalibriere(
      paar, kurse,
      raenge.get(paar.slice(0, 3)) ?? [],
      raenge.get(paar.slice(3, 6)) ?? [],
    ));
  }
  return gesamtbild(alle);
}
