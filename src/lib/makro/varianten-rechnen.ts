/**
 * Varianten-Vergleich des Makro-Modells (02.10.2026) — reine Logik.
 *
 * Anlass: die Rückrechnung des Live-Modells (Niveaus: PMI über 50, Zinsen
 * hoch …) traf ab 2024 nur 44–51 %. Kerims Vermutung aus dem Makro-Lernen:
 * Niveaus sind eingepreist, bewegen tut die VERÄNDERUNG. Hier werden
 * mehrere Varianten gleich behandelt und nebeneinander gemessen.
 *
 * Damit die Varianten vergleichbar sind, bilden alle ihre Ideen gleich:
 * Rangfolge der 8 Währungen nach dem Varianten-Score, dann die 2 stärksten
 * gegen die 2 schwächsten (4 Ideen je Woche). „Extrem" = Platz 1 gegen
 * Platz 8. Die Skala des Scores spielt so keine Rolle.
 */
import type { Tageskerze } from "./wochenideen-rechnen";

export interface KompWoche {
  gesamt: number | null;
  zentralbank: number | null;
  wirtschaft: number | null;
  ueberraschung: number | null;
  zweiJahr: number | null;
  pmiRichtung: number | null;
  /** Mittel aus PMI Industrie und Dienste minus 50 — das Niveau, ohne revidierbare Daten. */
  pmiNiveau: number | null;
}

export interface VariantenDef {
  key: string;
  label: string;
  text: string;
}

export const VARIANTEN: VariantenDef[] = [
  { key: "modell", label: "Live-Modell (Niveau)", text: "Das heutige Urteil: Zentralbank 40 %, Wirtschaft 35 %, Überraschung 25 %." },
  { key: "kontra", label: "Live-Modell umgekehrt", text: "Gegenprobe: Ist das Modell systematisch zu spät, müsste das Umgekehrte treffen." },
  { key: "modell_d4", label: "Modell · Veränderung 4 W", text: "Urteil heute minus Urteil vor 4 Wochen: wer wird stärker, nicht wer ist stark." },
  { key: "zentralbank", label: "Nur Zentralbank", text: "Ebene 2 allein (Zins, Zyklus, Realzins, Markterwartung)." },
  { key: "wirtschaft", label: "Nur Wirtschaft", text: "Ebene 1 allein (PMI über 50, BIP, Arbeitsmarkt)." },
  { key: "ueberraschung", label: "Nur Überraschungsindex", text: "Daten besser oder schlechter als erwartet, gewichtet nach Aktualität." },
  { key: "ueberraschung_d4", label: "Überraschung · Veränderung 4 W", text: "Wird die Überraschungslage besser oder schlechter?" },
  { key: "rendite_d4", label: "2J-Rendite · Veränderung 4 W", text: "Wohin bewegt sich die Zinserwartung des Marktes? Kern der Kette." },
  { key: "ohne_zb", label: "Modell ohne Zentralbank", text: "Wirtschaft 35 % + Überraschung 25 %, die Zentralbank-Ebene weggelassen." },
  { key: "pmi_niveau", label: "PMI Niveau (über/unter 50)", text: "Nur der PMI-Stand — Gegenprobe zu „Nur Wirtschaft“ ohne revidierbare Daten (BIP, Arbeitsmarkt)." },
  { key: "pmi_richtung", label: "PMI nach Richtung", text: "Steigt oder fällt der PMI (Industrie + Dienste) — statt „über 50 = gut“." },
  { key: "kombi", label: "Kombi Veränderung", text: "Mittel der Ränge aus Modell-Veränderung, Überraschung und 2J-Veränderung." },
];

export const MESS_HORIZONTE = [1, 2, 4, 8] as const;
export type MessHorizont = (typeof MESS_HORIZONTE)[number];

const G8 = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"];

/** Rang auf −1 (schwächste) … +1 (stärkste); null bleibt null. */
export function raenge(scores: Record<string, number | null>): Record<string, number | null> {
  const da = Object.entries(scores).filter(([, v]) => v !== null) as [string, number][];
  const out: Record<string, number | null> = {};
  for (const c of Object.keys(scores)) out[c] = null;
  if (da.length < 2) return out;
  da.sort((a, b) => a[1] - b[1]);
  da.forEach(([c], i) => { out[c] = Math.round((-1 + (2 * i) / (da.length - 1)) * 1000) / 1000; });
  return out;
}

function diff(a: number | null | undefined, b: number | null | undefined): number | null {
  return a === null || a === undefined || b === null || b === undefined ? null : a - b;
}

/** Scores je Variante, Woche und Währung. `wochen` aufsteigend. */
export function variantenScores(
  wochen: string[], komp: Map<string, Record<string, KompWoche>>,
): Map<string, Map<string, Record<string, number | null>>> {
  const out = new Map<string, Map<string, Record<string, number | null>>>();
  for (const v of VARIANTEN) out.set(v.key, new Map());
  wochen.forEach((w, i) => {
    const jetzt = komp.get(w) ?? {};
    const vor4 = i >= 4 ? komp.get(wochen[i - 4]) ?? {} : {};
    const je = (f: (c: string) => number | null) => Object.fromEntries(G8.map((c) => [c, f(c)]));
    const s = {
      modell: je((c) => jetzt[c]?.gesamt ?? null),
      kontra: je((c) => (jetzt[c]?.gesamt === null || jetzt[c]?.gesamt === undefined ? null : -jetzt[c]!.gesamt!)),
      modell_d4: je((c) => diff(jetzt[c]?.gesamt, vor4[c]?.gesamt)),
      zentralbank: je((c) => jetzt[c]?.zentralbank ?? null),
      wirtschaft: je((c) => jetzt[c]?.wirtschaft ?? null),
      ueberraschung: je((c) => jetzt[c]?.ueberraschung ?? null),
      ueberraschung_d4: je((c) => diff(jetzt[c]?.ueberraschung, vor4[c]?.ueberraschung)),
      rendite_d4: je((c) => diff(jetzt[c]?.zweiJahr, vor4[c]?.zweiJahr)),
      pmi_richtung: je((c) => jetzt[c]?.pmiRichtung ?? null),
      pmi_niveau: je((c) => jetzt[c]?.pmiNiveau ?? null),
      ohne_zb: je((c) => {
        const wi = jetzt[c]?.wirtschaft ?? null, ue = jetzt[c]?.ueberraschung ?? null;
        if (wi === null && ue === null) return null;
        if (wi === null) return ue;
        if (ue === null) return wi;
        return (0.35 * wi + 0.25 * ue) / 0.6;
      }),
    } as Record<string, Record<string, number | null>>;
    const r1 = raenge(s.modell_d4), r2 = raenge(s.ueberraschung), r3 = raenge(s.rendite_d4);
    s.kombi = je((c) => {
      const xs = [r1[c], r2[c], r3[c]].filter((x): x is number => x !== null);
      return xs.length >= 2 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    });
    for (const v of VARIANTEN) out.get(v.key)!.set(w, s[v.key]);
  });
  return out;
}

export interface VariantenIdee { paar: string; seite: "long" | "short"; stark: string; schwach: string; extrem: boolean }

/**
 * Die 2 stärksten gegen die 2 schwächsten; mindestens 5 Währungen mit Score
 * (die 2J-Rendite fehlt für GBP, NZD und CHF — mit 6 gäbe es dort keine Idee).
 */
export function rangIdeen(scores: Record<string, number | null>, paare: readonly string[]): VariantenIdee[] {
  const da = (Object.entries(scores).filter(([, v]) => v !== null) as [string, number][]).sort((a, b) => b[1] - a[1]);
  if (da.length < 5) return [];
  const oben = da.slice(0, 2).map(([c]) => c);
  const unten = da.slice(-2).map(([c]) => c);
  const out: VariantenIdee[] = [];
  for (const s of oben) {
    for (const w of unten) {
      const extrem = s === oben[0] && w === unten[unten.length - 1];
      if (paare.includes(s + w)) out.push({ paar: s + w, seite: "long", stark: s, schwach: w, extrem });
      else if (paare.includes(w + s)) out.push({ paar: w + s, seite: "short", stark: s, schwach: w, extrem });
    }
  }
  return out;
}

const TAG = 86_400_000;
const VERSATZ = 4 * 3_600_000;
const zeitVon = (k: Tageskerze) => Date.parse(k.zeit.length === 10 ? `${k.zeit}T00:00:00Z` : k.zeit);

/** Wie messe() der Wochenaussicht, aber für 1, 2, 4 und 8 Wochen. Prozent in Richtung der Idee. */
export function messeHorizonte(
  kerzen: Tageskerze[], woche: string, seite: "long" | "short", jetzt: number,
): Partial<Record<MessHorizont, number>> {
  const sortiert = [...kerzen].sort((a, b) => zeitVon(a) - zeitVon(b));
  const start = Date.parse(`${woche}T00:00:00Z`) - VERSATZ;
  const erste = sortiert.find((k) => zeitVon(k) >= start);
  const out: Partial<Record<MessHorizont, number>> = {};
  if (!erste) return out;
  const r = seite === "long" ? 1 : -1;
  for (const n of MESS_HORIZONTE) {
    if (jetzt < Date.parse(`${woche}T00:00:00Z`) + (7 * n - 2) * TAG) continue;
    const grenze = Date.parse(`${woche}T00:00:00Z`) + 7 * n * TAG - VERSATZ;
    const letzte = [...sortiert].reverse().find((k) => zeitVon(k) < grenze && zeitVon(k) >= start);
    if (!letzte) continue;
    out[n] = Math.round(((letzte.close / erste.open - 1) * 100 * r) * 1000) / 1000;
  }
  return out;
}

/** Eine gemessene Idee einer Variante. */
export interface VariantenZeile {
  variante: string;
  woche: string;
  paar: string;
  seite: "long" | "short";
  extrem: boolean;
  p1: number | null; p2: number | null; p4: number | null; p8: number | null;
}

export interface VariantenStat { n: number; treffer: number | null; schnitt: number | null }

export function statistik(werte: (number | null)[]): VariantenStat {
  const da = werte.filter((x): x is number => x !== null);
  if (da.length === 0) return { n: 0, treffer: null, schnitt: null };
  return {
    n: da.length,
    treffer: Math.round((da.filter((x) => x > 0).length / da.length) * 100),
    schnitt: Math.round((da.reduce((a, b) => a + b, 0) / da.length) * 1000) / 1000,
  };
}

/** Kumulierte Kurve mit 1-Wochen-Erträgen (überlappungsfrei): je Woche der Schnitt aller Ideen. */
export function kurve(zeilen: VariantenZeile[], nurExtrem = false): { woche: string; wert: number }[] {
  const jeWoche = new Map<string, number[]>();
  for (const z of zeilen) {
    if (z.p1 === null || (nurExtrem && !z.extrem)) continue;
    const l = jeWoche.get(z.woche) ?? [];
    l.push(z.p1);
    jeWoche.set(z.woche, l);
  }
  let summe = 0;
  return [...jeWoche.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([woche, l]) => {
    summe += l.reduce((a, b) => a + b, 0) / l.length;
    return { woche, wert: Math.round(summe * 100) / 100 };
  });
}

/* ------------------------------------------------------- Zusammenfassen */

export type Filter = "alle" | "extrem";
export const JAHRE = ["alle", "2024", "2025", "2026"] as const;
export type Jahr = (typeof JAHRE)[number];

export interface VariantenBild {
  /** stat[variante][horizont][filter][jahr] */
  stat: Record<string, Record<MessHorizont, Record<Filter, Record<Jahr, VariantenStat>>>>;
  kurven: Record<string, Record<Filter, { woche: string; wert: number }[]>>;
}

/** Alles, was die Seite braucht, kompakt — damit nicht tausende Zeilen in den Browser gehen. */
export function variantenBild(zeilen: VariantenZeile[]): VariantenBild {
  const stat: VariantenBild["stat"] = {};
  const kurven: VariantenBild["kurven"] = {};
  for (const v of VARIANTEN) {
    const eigene = zeilen.filter((z) => z.variante === v.key);
    stat[v.key] = {} as VariantenBild["stat"][string];
    for (const h of MESS_HORIZONTE) {
      stat[v.key][h] = {} as Record<Filter, Record<Jahr, VariantenStat>>;
      for (const f of ["alle", "extrem"] as Filter[]) {
        stat[v.key][h][f] = {} as Record<Jahr, VariantenStat>;
        for (const j of JAHRE) {
          const auswahl = eigene.filter((z) => (f === "alle" || z.extrem) && (j === "alle" || z.woche.startsWith(j)));
          stat[v.key][h][f][j] = statistik(auswahl.map((z) => z[`p${h}` as "p1" | "p2" | "p4" | "p8"]));
        }
      }
    }
    kurven[v.key] = { alle: kurve(eigene), extrem: kurve(eigene, true) };
  }
  return { stat, kurven };
}
