/**
 * Aktivitätsbonus aufs Kalorienbudget.
 *
 * Der Anlass: nach einem langen Lauf reicht das normale Budget nicht. Wer bei
 * ohnehin grossem Defizit 800 Kalorien verbrennt und nichts nachlegt, hat den
 * Rest des Tages keine Energie — das merkt man am Abend, nicht am Tag danach.
 *
 * Bewusst NICHT die vollen verbrannten Kalorien: Aktivitätstracker schätzen
 * grosszügig, und ein Defizit soll ein Defizit bleiben. Angerechnet wird ein
 * Anteil, standardmässig 75 % — bei 800 verbrannten also 600 obendrauf.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit
 * `tools/checks/essen-bonus.mts`.
 */

export type Aktivitaet = "lauf" | "gym" | "sonstiges";

export const AKTIVITAET_LABEL: Record<Aktivitaet, string> = {
  lauf: "Laufen",
  gym: "Krafttraining",
  sonstiges: "Sonstiges",
};

/**
 * Pauschale je Aktivität, wenn keine Zahl eingetragen wird.
 *
 * Beim Krafttraining lohnt das Eintragen selten — der Verbrauch schwankt
 * kaum und liegt bei einer üblichen Einheit in dieser Gegend. Beim Laufen
 * dagegen macht die Distanz den Unterschied, deshalb steht dort keine
 * brauchbare Pauschale.
 */
export const PAUSCHALE: Record<Aktivitaet, number | null> = {
  lauf: null,
  gym: 300,
  sonstiges: null,
};

/** Standard-Anrechnung in Prozent. */
export const STANDARD_FAKTOR = 75;

export interface BonusEintrag {
  datum: string;
  art: Aktivitaet;
  /** Verbrannte Kalorien laut Uhr. Null = Pauschale der Aktivität gilt. */
  verbrannt: number | null;
  notiz: string | null;
}

/** Was von einem Eintrag tatsächlich aufs Budget kommt. */
export function angerechnet(e: BonusEintrag, faktorProzent = STANDARD_FAKTOR): number {
  const roh = e.verbrannt ?? PAUSCHALE[e.art] ?? 0;
  if (!Number.isFinite(roh) || roh <= 0) return 0;
  const faktor = Number.isFinite(faktorProzent) ? faktorProzent : STANDARD_FAKTOR;
  // Auf 10 gerundet: eine Kalorienangabe auf die Einerstelle täuscht eine
  // Genauigkeit vor, die weder die Uhr noch das Rezept hergibt.
  return Math.round((roh * Math.max(0, Math.min(150, faktor)) / 100) / 10) * 10;
}

export interface Budget {
  /** Das eingestellte Tagesziel. */
  grund: number;
  /** Summe der angerechneten Boni. */
  bonus: number;
  /** grund + bonus. */
  gesamt: number;
  /** Roh verbrannt, für die Anzeige „von X verbrannt". */
  verbrannt: number;
  eintraege: BonusEintrag[];
}

export function baueBudget(
  grundZiel: number, eintraege: BonusEintrag[], faktorProzent = STANDARD_FAKTOR,
): Budget {
  const bonus = eintraege.reduce((s, e) => s + angerechnet(e, faktorProzent), 0);
  const verbrannt = eintraege.reduce(
    (s, e) => s + (e.verbrannt ?? PAUSCHALE[e.art] ?? 0), 0);
  return { grund: grundZiel, bonus, gesamt: grundZiel + bonus, verbrannt, eintraege };
}

/** Ein Satz für die Anzeige. Null, wenn es nichts zu sagen gibt. */
export function bonusSatz(b: Budget, faktorProzent = STANDARD_FAKTOR): string | null {
  if (b.eintraege.length === 0) return null;
  if (b.bonus === 0) return "Aktivität eingetragen, aber ohne anrechenbare Kalorien.";
  const arten = [...new Set(b.eintraege.map((e) => AKTIVITAET_LABEL[e.art]))].join(" + ");
  return `${arten}: ${b.verbrannt} verbrannt, davon ${faktorProzent} % angerechnet `
    + `— heute ${b.gesamt} statt ${b.grund} kcal.`;
}
