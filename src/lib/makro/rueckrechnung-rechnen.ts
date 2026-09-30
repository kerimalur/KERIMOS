/**
 * Rückrechnung des Urteils ab 2024 — reine Helfer (29.09.2026).
 *
 * Das Urteil selbst rechnet der Server-Teil (rueckrechnung.ts) mit dem
 * vollen Live-Modell für jeden Montag. Hier: Ideen aus den Scores bilden,
 * Montage aufzählen, das Zufallsband.
 */
import { paarKlasse, type PaarKlasse } from "./urteil";

const rund = (x: number) => Math.round(x * 1000) / 1000;

export interface RueckIdee {
  woche: string;
  paar: string;
  seite: "long" | "short";
  klasse: PaarKlasse;
  stark: string;
  schwach: string;
  score_stark: number;
  score_schwach: number;
  abstand: number;
}

/** Dieselbe Regel wie paarIdeen im Live-Modell: Abstand ≥ 0.40, höchstens 8 Ideen. */
export function ideenAm(woche: string, scores: Record<string, number | null>, paare: readonly string[]): RueckIdee[] {
  const ideen: RueckIdee[] = [];
  const ccys = Object.keys(scores).filter((c) => scores[c] !== null);
  for (const s of ccys) {
    for (const w of ccys) {
      if (s === w) continue;
      const klasse = paarKlasse(scores[s], scores[w]);
      if (!klasse) continue;
      const abstand = rund(scores[s]! - scores[w]!);
      const basis = { woche, klasse, stark: s, schwach: w, score_stark: scores[s]!, score_schwach: scores[w]!, abstand };
      if (paare.includes(s + w)) ideen.push({ ...basis, paar: s + w, seite: "long" });
      else if (paare.includes(w + s)) ideen.push({ ...basis, paar: w + s, seite: "short" });
    }
  }
  return ideen.sort((a, b) => b.abstand - a.abstand).slice(0, 8);
}

/** Alle Montage ab `ab` bis `bis` (beide inklusive, UTC-Daten). */
export function montage(ab: string, bis: string): string[] {
  const out: string[] = [];
  const d = new Date(`${ab}T00:00:00Z`);
  while ((d.getUTCDay() + 6) % 7 !== 0) d.setUTCDate(d.getUTCDate() + 1);
  for (; d.toISOString().slice(0, 10) <= bis; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/**
 * Wie breit der Zufall wäre: bei n Ideen streut eine Trefferquote von 50 %
 * um etwa ±2·√(0.25/n). Überlappende Horizonte machen die echte Streuung
 * eher grösser — die Grenze ist also eher zu eng als zu weit.
 */
export function zufallsBand(n: number): number | null {
  return n > 0 ? Math.round(200 * Math.sqrt(0.25 / n) * 10) / 10 : null;
}
