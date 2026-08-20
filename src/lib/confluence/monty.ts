import "server-only";
import { ladeFuerStichtag, ladeKurse } from "./daten";
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
