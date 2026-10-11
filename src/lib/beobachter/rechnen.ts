/**
 * Fundamentaler Beobachter — Rechenkern (11.10.2026), rein und ohne Datenbank.
 *
 * Nach jeder Veröffentlichung (Ist gegen Erwartung, als z-Wert) wird gemessen,
 * wie sich das Messpaar der Währung bewegt hat: 1 und 4 Stunden danach (aus
 * Stundenkerzen) sowie 1, 3 und 5 Handelstage danach (aus Tageskerzen).
 * „Ausgerichtet" heisst: positiv = der Markt ist in die Richtung der
 * Überraschung gelaufen (besser als erwartet → Währung stärker).
 *
 * Damit aus Zahlen Klarheit wird, gilt:
 *  - Bewegungen werden in % UND in Vielfachen der normalen Tagesschwankung (R) geführt.
 *  - Jede Auswertung nennt den Wert nach Kosten (Annahme KOSTEN_PROZENT).
 *  - Statusstufen sind streng (siehe `bewerte`), und über den Prüfstand
 *    (hypothesen.ts) werden nur vorab festgelegte Fragen beurteilt.
 */

export type Horizont = "1h" | "4h" | "1d" | "3d" | "5d";
export const HORIZONTE: Horizont[] = ["1h", "4h", "1d", "3d", "5d"];
export const HORIZONT_NAME: Record<Horizont, string> = {
  "1h": "1 Stunde", "4h": "4 Stunden", "1d": "1 Tag", "3d": "3 Tage", "5d": "5 Tage",
};
export const istHorizont = (x: unknown): x is Horizont => HORIZONTE.includes(x as Horizont);

/** Annahme: Spread + Slippage je Trade in % (≈ 1.2 Pips bei EURUSD). */
export const KOSTEN_PROZENT = 0.012;

/** Messpaar je Währung und Vorzeichen für „Währung stärker". USD wird gegen EUR gemessen (grob). */
export const MESSPAAR: Record<string, { instrument: string; zeichen: 1 | -1 }> = {
  EUR: { instrument: "EUR_USD", zeichen: 1 },
  GBP: { instrument: "GBP_USD", zeichen: 1 },
  AUD: { instrument: "AUD_USD", zeichen: 1 },
  NZD: { instrument: "NZD_USD", zeichen: 1 },
  CAD: { instrument: "USD_CAD", zeichen: -1 },
  CHF: { instrument: "USD_CHF", zeichen: -1 },
  JPY: { instrument: "USD_JPY", zeichen: -1 },
  USD: { instrument: "EUR_USD", zeichen: -1 },
};

export interface Tageskerze { date: string; close: number }
export interface Stundenkerze { t: number; close: number }

const rund = (x: number, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

export interface Bewegung {
  basis: string | null;
  b1: number | null;
  b3: number | null;
  b5: number | null;
  /** Ø absolute Tagesbewegung der 20 Tage davor in % (Normierung). */
  vola: number | null;
  /** Bewegung der Währung in den 5 Tagen vor dem Ereignis (Vorlauf), in %. */
  vorlauf5: number | null;
}

/**
 * Bewegung der Währung in % nach einem Ereignis: Schluss des letzten Tages VOR
 * dem Ereignistag gegen den Schluss 1, 3 und 5 Handelstage danach.
 * `kerzen` aufsteigend nach Datum, nur abgeschlossene Tage.
 */
export function messeBewegung(kerzen: Tageskerze[], ereignisTag: string, zeichen: 1 | -1): Bewegung {
  let i0 = -1;
  for (let i = 0; i < kerzen.length; i++) {
    if (kerzen[i].date < ereignisTag) i0 = i; else break;
  }
  if (i0 < 0) return { basis: null, b1: null, b3: null, b5: null, vola: null, vorlauf5: null };
  const basis = kerzen[i0].close;
  const bei = (n: number) => {
    const k = kerzen[i0 + n];
    return k ? rund(zeichen * (k.close / basis - 1) * 100, 4) : null;
  };
  let summe = 0, anzahl = 0;
  for (let i = Math.max(1, i0 - 19); i <= i0; i++) {
    summe += Math.abs(kerzen[i].close / kerzen[i - 1].close - 1) * 100;
    anzahl++;
  }
  const vor = kerzen[i0 - 5];
  return {
    basis: kerzen[i0].date, b1: bei(1), b3: bei(3), b5: bei(5),
    vola: anzahl >= 10 ? rund(summe / anzahl, 4) : null,
    vorlauf5: vor ? rund(zeichen * (basis / vor.close - 1) * 100, 4) : null,
  };
}

const STUNDE = 3_600_000;

/**
 * Reaktion 1 und 4 Stunden nach der Veröffentlichung aus Stundenkerzen (t = Beginn
 * der Kerze, UTC). Basis = Schluss der letzten Kerze, die vor dem Ereignis endet
 * (bei Meldungen zur halben Stunde liegt sie bis zu 30 Minuten davor — das ist
 * eine bekannte Ungenauigkeit, die die Richtung nicht verzerrt). Lücken (Wochenende,
 * fehlende Kerzen) ergeben null statt einer falschen Zahl.
 */
export function messeStunden(kerzen: Stundenkerze[], ereignisMs: number, zeichen: 1 | -1): { b1h: number | null; b4h: number | null } {
  let i0 = -1;
  for (let i = 0; i < kerzen.length; i++) {
    if (kerzen[i].t + STUNDE <= ereignisMs) i0 = i; else break;
  }
  if (i0 < 0 || ereignisMs - (kerzen[i0].t + STUNDE) > STUNDE) return { b1h: null, b4h: null };
  const basis = kerzen[i0].close;
  const nach = (stunden: number) => {
    const ziel = ereignisMs + stunden * STUNDE;
    for (let i = i0 + 1; i < kerzen.length; i++) {
      const ende = kerzen[i].t + STUNDE;
      if (ende >= ziel) return ende - ziel <= STUNDE ? rund(zeichen * (kerzen[i].close / basis - 1) * 100, 4) : null;
    }
    return null;
  };
  return { b1h: nach(1), b4h: nach(4) };
}

export interface Ereignis {
  release_id: string;
  ccy: string;
  kategorie: string;
  serie: string | null;
  titel: string | null;
  impact: string | null;
  event_time: string;
  z: number;
  paar: string;
  basis_datum: string | null;
  bewegung_1h: number | null;
  bewegung_4h: number | null;
  bewegung_1: number | null;
  bewegung_3: number | null;
  bewegung_5: number | null;
  vola: number | null;
  vorlauf_5: number | null;
}

export const bewegungVon = (e: Ereignis, h: Horizont): number | null =>
  h === "1h" ? e.bewegung_1h : h === "4h" ? e.bewegung_4h : h === "1d" ? e.bewegung_1 : h === "3d" ? e.bewegung_3 : e.bewegung_5;

/** In Richtung der Überraschung ausgerichtete Bewegung in % (positiv = Markt folgt der Überraschung). */
export const ausgerichtet = (e: Ereignis, h: Horizont): number | null => {
  const b = bewegungVon(e, h);
  if (b === null || e.z === 0) return null;
  return e.z > 0 ? b : -b;
};

export type Status = "stabil" | "hinweis" | "zufall" | "zuwenig";

export const STATUS_TEXT: Record<Status, string> = {
  stabil: "stabil",
  hinweis: "Hinweis",
  zufall: "Zufall",
  zuwenig: "zu wenig Fälle",
};

export interface GruppeErgebnis {
  schluessel: string;
  titel: string;
  n: number;
  /** Ø ausgerichtete Bewegung in %. */
  mittel: number;
  /** Ø in Vielfachen der normalen Tagesschwankung. */
  mittelR: number | null;
  /** Ø-Betrag der Bewegung abzüglich Kosten, in % (positiv = nach Kosten handelbar, in die passende Richtung). */
  netto: number;
  /** Anteil der Fälle, in denen der Markt der Überraschung folgte. */
  treffer: number | null;
  t: number | null;
  haelfteA: number | null;
  haelfteB: number | null;
  status: Status;
}

export interface Probe { zeit: string; a: number; r: number | null }

/**
 * Statusstufen — bewusst streng, weil viele Gruppen gleichzeitig geprüft werden
 * und etwa jede zwanzigste allein durch Zufall „auffällig" aussieht:
 *  - stabil:  ≥ 50 Fälle, |t| ≥ 3, beide Hälften der Zeit mit gleichem Vorzeichen
 *  - Hinweis: ≥ 30 Fälle, |t| ≥ 2, beide Hälften gleiches Vorzeichen
 *  - Zufall:  genug Fälle, aber nichts davon
 *  - zu wenig Fälle: unter 30
 */
export function bewerte(proben: Probe[]): Omit<GruppeErgebnis, "schluessel" | "titel"> {
  const n = proben.length;
  if (n === 0) {
    return { n: 0, mittel: 0, mittelR: null, netto: 0, treffer: null, t: null, haelfteA: null, haelfteB: null, status: "zuwenig" };
  }
  const sortiert = [...proben].sort((x, y) => x.zeit.localeCompare(y.zeit));
  const mittelwert = (l: { a: number }[]) => (l.length ? l.reduce((s, p) => s + p.a, 0) / l.length : null);
  const mittel = mittelwert(sortiert) ?? 0;
  const sd = n > 1 ? Math.sqrt(sortiert.reduce((s, p) => s + (p.a - mittel) ** 2, 0) / (n - 1)) : null;
  const t = sd && sd > 0 ? mittel / (sd / Math.sqrt(n)) : null;
  const nichtNull = sortiert.filter((p) => p.a !== 0);
  const treffer = nichtNull.length ? nichtNull.filter((p) => p.a > 0).length / nichtNull.length : null;
  const mitte = Math.floor(n / 2);
  const a = mittelwert(sortiert.slice(0, mitte));
  const b = mittelwert(sortiert.slice(mitte));
  const gleich = a !== null && b !== null && Math.sign(a) === Math.sign(b) && Math.sign(a) === Math.sign(mittel);
  const mitR = sortiert.filter((p) => p.r !== null);
  const mittelR = mitR.length >= Math.max(5, n * 0.5) ? mitR.reduce((s, p) => s + (p.r as number), 0) / mitR.length : null;

  let status: Status = "zuwenig";
  if (n >= 30) {
    status = "zufall";
    if (t !== null && gleich && Math.abs(t) >= 2) status = "hinweis";
    if (n >= 50 && t !== null && gleich && Math.abs(t) >= 3) status = "stabil";
  }
  return {
    n, mittel: rund(mittel, 4), mittelR: mittelR === null ? null : rund(mittelR, 3),
    netto: rund(Math.abs(mittel) - KOSTEN_PROZENT, 4),
    treffer: treffer === null ? null : rund(treffer, 3),
    t: t === null ? null : rund(t, 2),
    haelfteA: a === null ? null : rund(a, 4), haelfteB: b === null ? null : rund(b, 4), status,
  };
}

/** Proben einer Ereignisliste für einen Horizont. */
export function proben(ereignisse: Ereignis[], h: Horizont, minZ: number, filter?: (e: Ereignis) => boolean): Probe[] {
  const out: Probe[] = [];
  for (const e of ereignisse) {
    if (Math.abs(e.z) < minZ || (filter && !filter(e))) continue;
    const a = ausgerichtet(e, h);
    if (a === null) continue;
    out.push({ zeit: e.event_time, a, r: e.vola && e.vola > 0 ? a / e.vola : null });
  }
  return out;
}

/** Gruppen bilden; nur Ereignisse mit |z| ≥ minZ und gemessener Bewegung zählen. */
export function gruppiere(
  ereignisse: Ereignis[], h: Horizont, minZ: number,
  schluessel: (e: Ereignis) => string, titel: (k: string) => string = (k) => k,
): GruppeErgebnis[] {
  const map = new Map<string, Ereignis[]>();
  for (const e of ereignisse) {
    const k = schluessel(e);
    const l = map.get(k) ?? [];
    l.push(e);
    map.set(k, l);
  }
  return [...map.entries()]
    .map(([k, l]) => ({ schluessel: k, titel: titel(k), ...bewerte(proben(l, h, minZ)) }))
    .filter((g) => g.n > 0);
}

export interface Erkenntnis {
  gruppe: GruppeErgebnis;
  text: string;
}

const KATEGORIE_NAME: Record<string, string> = {
  wachstum: "Wachstum (PMI, BIP, Umsätze)", inflation: "Inflation", arbeit: "Arbeitsmarkt",
  stimmung: "Stimmung", notenbank: "Notenbank", sonstiges: "Sonstiges",
};
export const kategorieName = (k: string) => KATEGORIE_NAME[k] ?? k;

/** Formuliert Gruppen als Satz. Nur Gruppen mit genug Fällen. */
export function erkenntnisse(gruppen: GruppeErgebnis[], h: Horizont, max = 8): Erkenntnis[] {
  return gruppen
    .filter((g) => g.n >= 30 && g.t !== null)
    .sort((a, b) => Math.abs(b.t ?? 0) - Math.abs(a.t ?? 0))
    .slice(0, max)
    .map((g) => {
      const folgt = g.mittel > 0;
      const treffer = g.treffer === null ? "" : `, Trefferquote ${Math.round(g.treffer * 100)} %`;
      const kern = g.status === "zufall"
        ? `kein erkennbarer Zusammenhang (Ø ${g.mittel > 0 ? "+" : ""}${g.mittel.toFixed(2)} %${treffer})`
        : folgt
          ? `der Markt folgt der Überraschung (Ø +${g.mittel.toFixed(2)} % nach ${HORIZONT_NAME[h]}${treffer})`
          : `der Markt läuft gegen die Überraschung (Ø ${g.mittel.toFixed(2)} % nach ${HORIZONT_NAME[h]}${treffer})`;
      return { gruppe: g, text: `${g.titel}: ${kern}, ${g.n} Fälle.` };
    });
}
