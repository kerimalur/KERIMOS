/**
 * Aus COT-Rohzeilen die fünf Gruppenreihen bauen — reine Rechnung, kein Laden.
 *
 * Warum das ein eigenes Modul ist: die Zuordnung lag früher mitten in der
 * Ladeschleife von `daten.ts`, hinter einem `continue`. Dort war sie nicht
 * prüfbar, und genau dort ist am 20.08.2026 der Fehler entstanden, der Monty
 * wochenlang leer aussehen ließ (siehe `MIN_TFF_WOCHEN` unten). Was man nicht
 * prüfen kann, bricht unbemerkt.
 */
import { nettoReihe } from "./rechnen";
import type { Punkt } from "./reihen";

export interface TffZeile {
  contract_code: string; report_date: string;
  lev_money_long: number | null; lev_money_short: number | null;
  dealer_long: number | null; dealer_short: number | null;
  asset_mgr_long: number | null; asset_mgr_short: number | null;
  open_interest: number | null;
}

export interface LegacyZeile {
  contract_code: string; report_date: string;
  noncomm_long: number | null; noncomm_short: number | null;
  comm_long: number | null; comm_short: number | null;
  nonrept_long: number | null; nonrept_short: number | null;
  open_interest: number | null;
}

/**
 * Ab so vielen Wochen gilt der TFF-Bericht als tragfähig für das
 * Fonds-Perzentil. Ein halbes Jahr — darunter ist ein Perzentil über ein
 * 3-Jahres-Fenster nur ein Rang unter zu wenigen Werten.
 */
export const MIN_TFF_WOCHEN = 26;

export interface CotGruppen {
  /** Dealer — nur im TFF-Bericht. */
  banken: Punkt[];
  /** Asset Manager — nur im TFF-Bericht. */
  realMoney: Punkt[];
  /** Commercials — nur im Legacy-Bericht. */
  komm: Punkt[];
  /** Nicht-Meldepflichtige („Retail") — nur im Legacy-Bericht. */
  retail: Punkt[];
  /** Die Fondsreihe, aus der das Perzentil kommt. */
  fonds: Punkt[];
  quelle: "tff" | "legacy" | "keine";
}

/**
 * Die Zeilen sind bereits auf einen Contract gefiltert.
 *
 * Zwei Berichte, zwei Definitionen — und sie werden nie gemischt: Leveraged
 * Money (TFF) und Non-Commercials (Legacy) sind nicht dieselbe Gruppe. Beide
 * in eine Perzentil-Reihe zu werfen ergäbe einen Rang, den es nie gab.
 *
 * Commercials und Nicht-Meldepflichtige kommen dagegen IMMER aus Legacy,
 * unabhängig davon, welche Quelle das Fondsperzentil gewinnt — der
 * TFF-Bericht kennt diese beiden Gruppen überhaupt nicht.
 */
export function cotGruppenFuer(
  tffZeilen: TffZeile[], legacyZeilen: LegacyZeile[],
): CotGruppen {
  const banken = nettoReihe(tffZeilen.map((z) => ({
    datum: z.report_date, lang: z.dealer_long, kurz: z.dealer_short, oi: z.open_interest,
  })));
  const realMoney = nettoReihe(tffZeilen.map((z) => ({
    datum: z.report_date, lang: z.asset_mgr_long, kurz: z.asset_mgr_short, oi: z.open_interest,
  })));
  const komm = nettoReihe(legacyZeilen.map((z) => ({
    datum: z.report_date, lang: z.comm_long, kurz: z.comm_short, oi: z.open_interest,
  })));
  const retail = nettoReihe(legacyZeilen.map((z) => ({
    datum: z.report_date, lang: z.nonrept_long, kurz: z.nonrept_short, oi: z.open_interest,
  })));

  const ausTff = nettoReihe(tffZeilen.map((z) => ({
    datum: z.report_date, lang: z.lev_money_long, kurz: z.lev_money_short, oi: z.open_interest,
  })));
  if (ausTff.length >= MIN_TFF_WOCHEN) {
    return { banken, realMoney, komm, retail, fonds: ausTff, quelle: "tff" };
  }

  const ausLegacy = nettoReihe(legacyZeilen.map((z) => ({
    datum: z.report_date, lang: z.noncomm_long, kurz: z.noncomm_short, oi: z.open_interest,
  })));
  return {
    banken, realMoney, komm, retail, fonds: ausLegacy,
    quelle: ausLegacy.length >= MIN_TFF_WOCHEN ? "legacy" : "keine",
  };
}
