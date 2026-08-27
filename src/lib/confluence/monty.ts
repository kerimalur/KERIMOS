import "server-only";
import {
  ladeCotLang, ladeFuerStichtag, ladeKurse, KALIBRIER_JAHRE, type CotLang,
} from "./daten";
import {
  gesamtbild, kalibriere, raengeReihe,
  type Gesamtbild, type Kalibrierung, type RangWoche, type Variante,
} from "./kalibrierung";
import { G8, PAARE } from "./faktoren";
import { cotStatistik, type CotStatistik } from "./monty-cot";
import { synthBild, synthRaengeReihe, type SynthBild } from "./cot-synth";
import { cotBildFuer } from "./cot-divergenz";
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

  // Die Währungsbilder EINMAL rechnen und für alle 28 Paare wiederverwenden.
  // Je Paar neu zu rechnen wäre dieselbe Arbeit 56-mal — und schlimmer: ein
  // zweiter Rechenweg, der irgendwann von der Tabelle darüber abweicht.
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
  paar: string, stichtag: string, variante: Variante = "synth",
): Promise<Kalibrierung> {
  const [cot, kurse] = await Promise.all([ladeCotLang(stichtag), ladeKurse(paar)]);
  const [b, q] = raengeFuer(cot, paar, variante);
  return kalibriere(paar, kurse, b, q, undefined, variante);
}

/**
 * Welche Rangreihen die gewählte Fassung braucht.
 *
 * Bei „synth" ist es EINE Reihe — die des Paares, bei der die Differenz vor
 * dem Rang gebildet wurde. Bei den anderen drei sind es zwei, je Währung.
 * Diese Verzweigung steht hier und nicht in `kalibriere`, damit dort nichts
 * von Datenquellen weiss.
 */
function raengeFuer(
  cot: CotLang, paar: string, variante: Variante,
): [RangWoche[], RangWoche[]] {
  const basis = paar.slice(0, 3), quote = paar.slice(3, 6);
  if (variante === "synth") {
    return [synthRaengeReihe(
      cot.cotKomm[basis] ?? [], cot.cotKomm[quote] ?? [],
      cot.cotRetail[basis] ?? [], cot.cotRetail[quote] ?? [],
    ), []];
  }
  return [raengeReihe(cot, basis), raengeReihe(cot, quote)];
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
export async function baueGesamtbild(
  stichtag: string, variante: Variante = "synth",
): Promise<Gesamtbild> {
  const cot = await ladeCotLang(stichtag);

  const alle: Kalibrierung[] = [];
  for (const paar of KALIBRIER_PAARE) {
    const kurse = await ladeKurse(paar);
    const [b, q] = raengeFuer(cot, paar, variante);
    alle.push(kalibriere(paar, kurse, b, q, undefined, variante));
  }
  return gesamtbild(alle);
}

/**
 * Alle 28 Paare synthetisch — die Rechnung, nach der Kerim handelt.
 *
 * Seit dem 26.08.2026 die Hauptansicht auf Monty. Sie ersetzt die alte
 * Rang-Differenz nicht aus Geschmack: sein Pine-Skript begründet selbst,
 * warum Ränge nicht subtrahiert werden dürfen, und die Messung gibt ihm
 * recht. Zwei Währungen im Mittelfeld können als Differenz an einem Extrem
 * stehen — das sah die alte Rechnung nie.
 *
 * Geladen wird über `ladeCotLang`: dieselbe zwanzigjährige, 24 h gecachte
 * Abfrage, die auch die Kalibrierung benutzt. Ein eigener Ladeweg für drei
 * Jahre wäre ein zweiter Cache-Eintrag für dieselben Zeilen.
 */
export async function baueMontySynth(stichtag: string): Promise<SynthBild[]> {
  const cot = await ladeCotLang(stichtag);

  return (PAARE as readonly string[]).map((paar) => synthBild(
    paar, stichtag,
    cot.cotKomm[paar.slice(0, 3)] ?? [],
    cot.cotKomm[paar.slice(3, 6)] ?? [],
    cot.cotRetail[paar.slice(0, 3)] ?? [],
    cot.cotRetail[paar.slice(3, 6)] ?? [],
  )).sort((a, b) =>
    // Nach dem Betrag des Bias, stärkste zuerst: man sucht, wo etwas los ist.
    // Paare ohne genug Historie fallen ans Ende statt in die Mitte.
    Math.abs(b.bias ?? 0) - Math.abs(a.bias ?? 0)
    || a.paar.localeCompare(b.paar));
}
