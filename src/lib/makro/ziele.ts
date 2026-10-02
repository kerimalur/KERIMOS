/**
 * Inflationsziele der 8 Notenbanken und die Einstellungen für die
 * Einordnung von Kalenderzahlen (01.10.2026, Makro-Lernen Modul 0).
 *
 * Bewusst ohne Imports: releases.ts (Index) und einordnung.ts (Texte)
 * lesen beide von hier, ohne sich gegenseitig zu brauchen.
 *
 * Kerims Regel dazu: Eine Inflationszahl allein sagt nichts. Erst der
 * Abstand zum Ziel zeigt, ob die Notenbank reagieren muss. Liegt die Zahl
 * im Zielband, muss sie nicht — dann bewegt auch eine Überraschung wenig
 * (Schweiz August 2026: 0,8 % statt 0,5 %, trotzdem fiel der Franken).
 */

export interface Zielband {
  /** Untere Grenze in %. Bei einem Punktziel = Ziel. */
  min: number;
  /** Obere Grenze in %. Bei einem Punktziel = Ziel. */
  max: number;
  /** So, wie die Notenbank es selbst formuliert. */
  text: string;
}

export const INFLATIONSZIELE: Record<string, Zielband> = {
  CHF: { min: 0, max: 2, text: "SNB: 0–2 %" },
  EUR: { min: 2, max: 2, text: "EZB: 2 %" },
  USD: { min: 2, max: 2, text: "Fed: 2 % (PCE)" },
  GBP: { min: 2, max: 2, text: "BoE: 2 %" },
  JPY: { min: 2, max: 2, text: "BoJ: 2 %" },
  CAD: { min: 1, max: 3, text: "BoC: 2 % (Band 1–3 %)" },
  AUD: { min: 2, max: 3, text: "RBA: 2–3 %" },
  NZD: { min: 1, max: 3, text: "RBNZ: 1–3 %, Mitte 2 %" },
};

/**
 * Wie nah am Punktziel noch als „am Ziel" gilt (nur bei Punktzielen). Ohne Toleranz läge eine
 * EZB-Inflation von 2,1 % schon „über dem Ziel" — das ist für die Notenbank
 * kein Grund zu handeln.
 */
export const ZIEL_TOLERANZ = 0.3;

/**
 * Gewicht einer Inflationszahl im Überraschungsindex, wenn ihr Ist im
 * Zielband liegt. 0,5 = halb so viel wie sonst. Startwert, kein gelerntes
 * Wissen — nach Modul 1/2 und dem Markt-Check anpassen.
 */
export const ZIELBAND_DAEMPFUNG = 0.5;

/** Grenzen der Einstufung einer Überraschung (|z|). Startwerte. */
export const Z_IM_RAHMEN = 0.5;
export const Z_STARK = 1.5;

export type ZielLage = "unter" | "im_band" | "ueber";

/** Nur Jahresraten lassen sich mit dem Ziel vergleichen, nie m/m oder q/q. */
export function istJahresrate(serie: string): boolean {
  return /(y\/y|yoy|annual|Jahresrate|zum Vorjahr|Vorjahr)/i.test(serie)
    || /^CPI$/i.test(serie.trim());
}

/** Wo eine Inflations-Jahresrate zum Ziel steht. null = nicht vergleichbar. */
export function zielLage(ccy: string, serie: string, wert: number | null): ZielLage | null {
  const z = INFLATIONSZIELE[ccy];
  if (!z || wert === null || !istJahresrate(serie)) return null;
  // Toleranz nur bei Punktzielen; ein Band hat seine Grenzen schon.
  const tol = z.min === z.max ? ZIEL_TOLERANZ : 0;
  if (wert < z.min - tol) return "unter";
  if (wert > z.max + tol) return "ueber";
  return "im_band";
}

/** Faktor fürs Indexgewicht: Inflation im Zielband zählt weniger. */
export function zielbandFaktor(ccy: string, serie: string, kategorie: string, ist: number | null): number {
  if (kategorie !== "inflation") return 1;
  return zielLage(ccy, serie, ist) === "im_band" ? ZIELBAND_DAEMPFUNG : 1;
}
