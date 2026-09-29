/**
 * Rückrechnung des Urteils ab 2024 — rein, ohne Datenbank (29.09.2026).
 *
 * Frage: Wären die Paar-Ideen „stark gegen schwach" in der Vergangenheit
 * aufgegangen? Dafür wird für jeden Montag das Urteil so gerechnet, wie es
 * an diesem Tag möglich gewesen wäre — nur mit Veröffentlichungen, die VOR
 * dem Montag lagen (Zeitstempel aus MT5/Forex Factory). Kein Wert von
 * danach, keine revidierten Zahlen aus OECD-Reihen.
 *
 * Deshalb ist es eine vereinfachte Fassung des Live-Urteils:
 *   Zentralbank (40 %)   Zyklus aus den Zinsentscheiden (wie zyklusAus im
 *                        Live-Modell: Schritt in den letzten 182 Tagen =
 *                        Straffung/Lockerung ±1, sonst Pause ±0.3), dazu ein
 *                        in 7 Tagen erwarteter Schritt ±0.3. Ohne
 *                        Markterwartung (2J-Rendite) und Realzins.
 *   Wirtschaft (35 %)    PMI Industrie und Dienste, (PMI − 50) / 5 wie live.
 *                        Ohne BIP und Arbeitslosenquote.
 *   Überraschung (25 %)  genau wie live (indexBis).
 * Vor dem 28.06.2026 ist die Erwartung die Prognose von MetaQuotes, nicht der
 * Forex-Factory-Konsens — die Auswertung trennt beide Zeiträume.
 */
import { indexBis, type Release } from "./releases";
import { kernWert, paarKlasse, URTEIL_GEWICHT, type PaarKlasse } from "./urteil";

const TAG = 86_400_000;
const klemme = (x: number) => Math.max(-1, Math.min(1, x));
const rund = (x: number) => Math.round(x * 1000) / 1000;

export interface UrteilAm {
  score: number | null;
  zentralbank: number | null;
  wirtschaft: number | null;
  ueberraschung: number | null;
}

export function zentralbankAm(releases: Release[], t: number): number | null {
  const entscheide = releases
    .filter((r) => r.kategorie === "notenbank" && r.ist !== null && Date.parse(r.event_time) < t)
    .sort((a, b) => a.event_time.localeCompare(b.event_time));
  if (entscheide.length === 0) return null;
  let zyklus = 0;
  // Den letzten Schritt suchen: Ist gegen den Wert davor.
  for (let i = entscheide.length - 1; i >= 0; i--) {
    const r = entscheide[i];
    const davor = r.vorwert ?? entscheide[i - 1]?.ist ?? null;
    if (davor === null || Math.abs(r.ist! - davor) < 1e-6) continue;
    const alter = (t - Date.parse(r.event_time)) / TAG;
    const hoch = r.ist! > davor;
    zyklus = alter <= 182 ? (hoch ? 1 : -1) : (hoch ? 0.3 : -0.3);
    break;
  }
  // Ein Schritt, den der Kalender für die nächsten 7 Tage erwartet.
  const naechster = releases.find((r) => r.kategorie === "notenbank" && r.erwartung !== null && r.vorwert !== null
    && Date.parse(r.event_time) >= t && Date.parse(r.event_time) <= t + 7 * TAG);
  const erwartet = !naechster ? 0 : naechster.erwartung! > naechster.vorwert! ? 0.3 : naechster.erwartung! < naechster.vorwert! ? -0.3 : 0;
  return rund(klemme(zyklus + erwartet));
}

export function wirtschaftAm(releases: Release[], t: number): number | null {
  const werte = ["pmi_industrie", "pmi_dienste"]
    .map((k) => kernWert(k, releases, t - 1))
    // Nur, was höchstens 75 Tage alt ist — sonst zählt ein Wert, den es
    // damals schon nicht mehr als aktuell gab.
    .filter((r): r is Release => r !== null && t - Date.parse(r.event_time) <= 75 * TAG)
    .map((r) => klemme((r.ist! - 50) / 5));
  return werte.length ? rund(werte.reduce((a, b) => a + b, 0) / werte.length) : null;
}

export function urteilAm(releases: Release[], t: number): UrteilAm {
  const vorher = releases.filter((r) => Date.parse(r.event_time) < t || r.kategorie === "notenbank");
  const zb = zentralbankAm(vorher, t);
  const wi = wirtschaftAm(vorher.filter((r) => Date.parse(r.event_time) < t), t);
  const idx = indexBis(vorher.filter((r) => Date.parse(r.event_time) < t), new Date(t)).wert;
  const ue = idx === null ? null : rund(klemme(idx / 1.5));
  const teile: [number | null, number][] = [
    [zb, URTEIL_GEWICHT.zentralbank], [wi, URTEIL_GEWICHT.wirtschaft], [ue, URTEIL_GEWICHT.ueberraschung],
  ];
  const da = teile.filter(([x]) => x !== null) as [number, number][];
  const g = da.reduce((s, [, w]) => s + w, 0);
  return {
    score: da.length ? rund(da.reduce((s, [x, w]) => s + x * w, 0) / g) : null,
    zentralbank: zb, wirtschaft: wi, ueberraschung: ue,
  };
}

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
