/**
 * Veröffentlichungen mit Erwartung und Ist — die reine Logik (29.09.2026).
 *
 * Kerims Satz aus dem Makro-Lernen: nicht die Zahl bewegt den Kurs, sondern
 * ihre Abweichung von der Erwartung. Die Niveau-Seite (bewertung.ts) sagt,
 * WO eine Wirtschaft steht; diese Datei sagt, ob sie gerade besser oder
 * schlechter läuft, als der Markt gedacht hat.
 *
 * Ohne Datenbank und ohne Server-Abhängigkeit: der Sync-Lauf
 * (releases-sync.ts), die Seiten und der Selbsttest (tools/releases-test.ts)
 * rechnen mit denselben Funktionen.
 *
 * Vorzeichen überall: + heisst „stützt die Währung".
 *   - Wachstum und Stimmung: höher als erwartet = +
 *   - Arbeitsmarkt: mehr Jobs / höhere Löhne = +, bei Arbeitslosigkeit
 *     und Anträgen umgekehrt
 *   - Inflation und Leitzins: höher = Notenbank straffer = +
 */

export const KATEGORIEN = ["wachstum", "inflation", "arbeit", "notenbank", "stimmung", "sonstiges"] as const;
export type Kategorie = (typeof KATEGORIEN)[number];

export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  wachstum: "Wachstum",
  inflation: "Inflation",
  arbeit: "Arbeitsmarkt",
  notenbank: "Notenbank",
  stimmung: "Stimmung",
  sonstiges: "Sonstiges",
};

/** Kategorien, die in die Überraschungs-Matrix und den Index eingehen. */
export const INDEX_KATEGORIEN: Kategorie[] = ["wachstum", "inflation", "arbeit"];

export type IstQuelle = "jblanked" | "mt5" | "rekonstruiert";

export const QUELLE_LABEL: Record<IstQuelle, string> = {
  jblanked: "JBlanked",
  mt5: "MT5",
  rekonstruiert: "rekonstruiert",
};

/** Eine Zeile von public.makro_releases. */
export interface Release {
  id: string;
  ccy: string;
  titel: string;
  serie: string;
  kategorie: Kategorie;
  event_time: string;
  impact: string | null;
  einheit: string;
  erwartung: number | null;
  ist: number | null;
  vorwert: number | null;
  ist_quelle: IstQuelle | null;
  abweichung: number | null;
  z: number | null;
}

/* ------------------------------------------------------------ Parsen */

/**
 * "54.6" → 54.6 · "162K" → 162 K · "-0.1%" → −0.1 % · "<1.25%" → 1.25 %
 * "" / "-" / "2-0-7" (MPC-Stimmen) → null.
 *
 * Das "<" beim BoJ-Leitzins heisst „Spanne bis": die Obergrenze ist die Zahl,
 * die sich bewegt, also zählt sie.
 */
export function parseWert(roh: string | number | null | undefined): { wert: number; einheit: string } | null {
  if (roh === null || roh === undefined) return null;
  if (typeof roh === "number") return Number.isFinite(roh) ? { wert: roh, einheit: "" } : null;
  const t = roh.trim().replace(/^[<>≈~]\s*/, "").replace(/,/g, "");
  const m = t.match(/^([+-]?\d+(?:\.\d+)?)\s*(%|K|M|B|T)?$/i);
  if (!m) return null;
  const e = (m[2] ?? "").toUpperCase();
  return { wert: Number(m[1]), einheit: e };
}

/* ------------------------------------------------------------ Serien */

const STUFEN = /\b(Flash|Final|Prelim|Preliminary|Revised|Advance|Second Estimate)\b\s*/gi;

/**
 * Titel ohne Veröffentlichungsstufe. "German Flash Manufacturing PMI" und
 * "German Final Manufacturing PMI" sind dieselbe Reihe — erst so lässt sich
 * das Ist des Flash aus dem „previous" des Final lesen.
 */
export function serieVon(titel: string): string {
  return titel.replace(STUFEN, "").replace(/\s+/g, " ").trim();
}

const RE_NOTENBANK = /(Cash Rate|Policy Rate|Funds Rate|Bank Rate|Refinancing Rate|Overnight Rate|Deposit Facility Rate|Official Cash Rate)$/i;
const RE_INFLATION = /(CPI|PPI|PCE|HICP|Price Index|Prices|Inflation)/i;
const RE_ARBEIT = /(Employment|Payroll|Unemployment|Claims|Claimant|Jobless|Earnings|Wage|Labor Cost)/i;
const RE_WACHSTUM = /(PMI|ISM|Business NZ|Ivey|Tankan|GDP|Retail Sales|Industrial Production|Manufacturing Sales|Trade Balance|Current Account|Durable Goods|Construction Output|Factory Orders)/i;
const RE_STIMMUNG = /(Sentiment|Confidence|ZEW|Ifo|Optimism|Economic Watchers)/i;

export function kategorieVon(serie: string): Kategorie {
  if (RE_NOTENBANK.test(serie)) return "notenbank";
  if (RE_INFLATION.test(serie)) return "inflation";
  if (RE_ARBEIT.test(serie)) return "arbeit";
  if (RE_WACHSTUM.test(serie)) return "wachstum";
  if (RE_STIMMUNG.test(serie)) return "stimmung";
  return "sonstiges";
}

/** Höher ist schlechter: Arbeitslosigkeit und Anträge auf Arbeitslosenhilfe. */
export function istInvertiert(serie: string): boolean {
  return /(Unemployment|Claims|Claimant|Jobless)/i.test(serie);
}

/**
 * Ein typischer Schritt, wenn die Reihe noch keine 12 Abweichungen hat,
 * aus denen sich eine Streuung rechnen liesse. Grob, aber ehrlich: ein PMI
 * einen Punkt daneben ist ungefähr so viel Nachricht wie eine Inflation
 * 0.1 Prozentpunkte daneben.
 */
export function schrittVon(serie: string, kategorie: Kategorie, einheit: string, erwartung: number | null): number {
  const f = Math.abs(erwartung ?? 0);
  if (kategorie === "notenbank") return 0.25;
  if (/(PMI|ISM|Business NZ|Ivey)/i.test(serie)) return 1;
  if (einheit === "%") return /Retail Sales/i.test(serie) ? 0.3 : 0.1;
  if (einheit === "K") {
    if (/Non-Farm Employment Change/i.test(serie)) return 50;
    if (/Claims|Claimant/i.test(serie)) return 10;
    if (/ADP/i.test(serie)) return 30;
    return Math.max(10, 0.2 * f);
  }
  if (einheit === "M" || einheit === "B" || einheit === "T") return Math.max(0.1, 0.1 * f);
  return Math.max(1, 0.02 * f);
}

/** Wie viel ein Termin zählt: Forex-Factory-Impact als Gewicht. */
export function impactGewicht(impact: string | null): number {
  switch ((impact ?? "").toLowerCase()) {
    case "high": return 1;
    case "medium": return 0.7;
    default: return 0.4;
  }
}

/* ------------------------------------------------------ Rekonstruktion */

export interface KalenderZeile {
  id: string;
  title: string;
  currency: string | null;
  event_time: string;
  impact: string | null;
  forecast: string | null;
  previous: string | null;
}

/**
 * Aus den Kalenderzeilen die Releases bauen — mit rekonstruiertem Ist.
 *
 * Forex Factory liefert kein Ist, wohl aber „previous". Und das „previous"
 * eines Termins IST das Ist des vorherigen Termins derselben Reihe:
 *   Flash PMI Sep → Final PMI Sep: previous = Flash Sep
 *   Final PMI Aug → Flash PMI Sep: previous = Final Aug
 * Der Haken: das Ist steht erst fest, wenn der nächste Termin im Feed ist —
 * bei Monatszahlen bis zu drei Wochen später. Deshalb gewinnt jede echte
 * Quelle (JBlanked) über diese Rekonstruktion.
 */
export function releasesAusKalender(zeilen: KalenderZeile[], waehrungen: readonly string[]): Release[] {
  const gruppen = new Map<string, KalenderZeile[]>();
  for (const z of zeilen) {
    const ccy = (z.currency ?? "").toUpperCase();
    if (!waehrungen.includes(ccy) || !z.title) continue;
    const key = `${ccy}|${serieVon(z.title).toLowerCase()}`;
    const liste = gruppen.get(key) ?? [];
    liste.push(z);
    gruppen.set(key, liste);
  }

  const out: Release[] = [];
  for (const liste of gruppen.values()) {
    // Doppelte Termine (die BoJ steht zweimal zur selben Minute im Feed)
    // nur einmal zählen — sonst wäre der Folgetermin der Zwilling.
    const eindeutig = new Map<string, KalenderZeile>();
    for (const z of liste.sort((a, b) => a.event_time.localeCompare(b.event_time))) {
      const t = new Date(z.event_time).toISOString().slice(0, 16);
      if (!eindeutig.has(t)) eindeutig.set(t, z);
    }
    const reihe = [...eindeutig.values()];

    reihe.forEach((z, i) => {
      const serie = serieVon(z.title);
      const kategorie = kategorieVon(serie);
      const f = parseWert(z.forecast);
      const p = parseWert(z.previous);
      const naechster = reihe[i + 1];
      const ist = naechster ? parseWert(naechster.previous) : null;
      const einheit = f?.einheit || p?.einheit || ist?.einheit || "";
      out.push({
        id: z.id,
        ccy: (z.currency ?? "").toUpperCase(),
        titel: z.title,
        serie,
        kategorie,
        event_time: new Date(z.event_time).toISOString(),
        impact: z.impact,
        einheit,
        erwartung: f?.wert ?? null,
        ist: ist?.wert ?? null,
        vorwert: p?.wert ?? null,
        ist_quelle: ist ? "rekonstruiert" : null,
        abweichung: null,
        z: null,
      });
    });
  }
  return out;
}

/* ---------------------------------------------------------- Abweichung */

const rund = (x: number, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

function streuung(xs: number[]): number | null {
  if (xs.length < 12) return null;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  const sd = Math.sqrt(v);
  return sd > 0 ? sd : null;
}

/**
 * Abweichung und z für alle Releases. Die Streuung einer Reihe kommt nur aus
 * den Abweichungen VOR dem jeweiligen Termin — sonst wüsste der Wert von
 * August schon, wie laut der Dezember war.
 */
export function mitAbweichung(releases: Release[]): Release[] {
  const jeSerie = new Map<string, Release[]>();
  for (const r of releases) {
    const k = `${r.ccy}|${r.serie.toLowerCase()}`;
    const l = jeSerie.get(k) ?? [];
    l.push(r);
    jeSerie.set(k, l);
  }
  const out: Release[] = [];
  for (const liste of jeSerie.values()) {
    liste.sort((a, b) => a.event_time.localeCompare(b.event_time));
    const bisher: number[] = [];
    for (const r of liste) {
      if (r.ist === null || r.erwartung === null) {
        out.push({ ...r, abweichung: null, z: null });
        continue;
      }
      const abw = r.ist - r.erwartung;
      const skala = streuung(bisher) ?? schrittVon(r.serie, r.kategorie, r.einheit, r.erwartung);
      const roh = (abw / skala) * (istInvertiert(r.serie) ? -1 : 1);
      out.push({ ...r, abweichung: rund(abw), z: rund(Math.max(-3, Math.min(3, roh)), 3) });
      bisher.push(abw);
    }
  }
  return out.sort((a, b) => a.event_time.localeCompare(b.event_time));
}

/* ------------------------------------------------- Überraschungsindex */

export const HALBWERT_TAGE = 30;
const FENSTER_TAGE = 180;

/**
 * Gewichteter Mittelwert von z bis zum Stichtag: jüngere und wichtigere
 * Termine zählen mehr (Gewicht = Impact × 0.5^(Alter/30 Tage)). So wie der
 * Citi Economic Surprise Index — nur eben selbst gebaut und je Währung.
 * Null, wenn im Fenster nichts mit Erwartung und Ist liegt.
 */
export function indexBis(
  releases: Release[], stichtag: Date, kategorien: Kategorie[] = INDEX_KATEGORIEN,
): { wert: number | null; gewicht: number } {
  let summe = 0;
  let gewicht = 0;
  const t = stichtag.getTime();
  for (const r of releases) {
    if (r.z === null || !kategorien.includes(r.kategorie)) continue;
    const alter = (t - Date.parse(r.event_time)) / 86_400_000;
    if (alter < 0 || alter > FENSTER_TAGE) continue;
    const g = impactGewicht(r.impact) * 0.5 ** (alter / HALBWERT_TAGE);
    summe += g * r.z;
    gewicht += g;
  }
  return { wert: gewicht >= 0.05 ? rund(summe / gewicht, 3) : null, gewicht };
}

export interface IndexPunkt { datum: string; wert: number | null }

/** Wöchentliche Punkte des Index über die letzten n Monate. */
export function indexVerlauf(
  releases: Release[], monate: number, heute = new Date(), kategorien: Kategorie[] = INDEX_KATEGORIEN,
): IndexPunkt[] {
  const start = new Date(heute);
  start.setUTCMonth(start.getUTCMonth() - monate);
  const punkte: IndexPunkt[] = [];
  for (let d = new Date(start); d <= heute; d = new Date(d.getTime() + 7 * 86_400_000)) {
    punkte.push({ datum: d.toISOString().slice(0, 10), wert: indexBis(releases, d, kategorien).wert });
  }
  const letzter = heute.toISOString().slice(0, 10);
  if (punkte[punkte.length - 1]?.datum !== letzter) {
    punkte.push({ datum: letzter, wert: indexBis(releases, heute, kategorien).wert });
  }
  return punkte;
}

/* ------------------------------------------------------------ Anzeige */

export function fmtWert(w: number | null, einheit: string): string {
  if (w === null) return "—";
  const zahl = Number(w.toFixed(2)).toString();
  if (einheit === "%") return `${zahl} %`;
  if (einheit) return `${zahl}${einheit}`;
  return zahl;
}

export function fmtAbweichung(a: number | null, einheit: string): string {
  if (a === null) return "—";
  const v = Number(Math.abs(a).toFixed(2)).toString();
  const zeichen = a > 0 ? "+" : a < 0 ? "−" : "±";
  return `${zeichen}${v}${einheit === "%" ? "" : einheit}`;
}

export function fmtZ(z: number | null): string {
  if (z === null) return "—";
  return `${z > 0 ? "+" : z < 0 ? "−" : "±"}${Math.abs(z).toFixed(1)}`;
}

export function urteilUeberraschung(x: number | null): string {
  if (x === null) return "keine Daten";
  if (x >= 1) return "klar besser als erwartet";
  if (x >= 0.3) return "leicht besser als erwartet";
  if (x > -0.3) return "im Rahmen der Erwartung";
  if (x > -1) return "leicht schlechter als erwartet";
  return "klar schlechter als erwartet";
}

/**
 * Der Satz zu einem kommenden Termin: was ein Ist über oder unter der
 * Erwartung für die Währung hiesse.
 */
export function szenario(r: Release): string {
  if (r.erwartung === null) return "Keine Erwartung im Kalender — die Reaktion hängt am Vergleich mit dem Vorwert.";
  const f = fmtWert(r.erwartung, r.einheit);
  if (r.kategorie === "notenbank") {
    if (r.vorwert !== null && r.erwartung > r.vorwert) {
      return `Erhöhung auf ${f} erwartet. Wie erwartet → eingepreist. Kein Schritt → belastet ${r.ccy}.`;
    }
    if (r.vorwert !== null && r.erwartung < r.vorwert) {
      return `Senkung auf ${f} erwartet. Wie erwartet → eingepreist. Kein Schritt → stützt ${r.ccy}.`;
    }
    return `Halten bei ${f} erwartet. Erhöhung → stützt ${r.ccy}, Senkung → belastet.`;
  }
  if (istInvertiert(r.serie)) {
    return `Ist unter ${f} → stützt ${r.ccy}; darüber belastet.`;
  }
  if (r.kategorie === "inflation") {
    return `Ist über ${f} → Notenbank eher straffer → stützt ${r.ccy}; darunter belastet.`;
  }
  return `Ist über ${f} → stützt ${r.ccy}; darunter belastet.`;
}

/** Urteil zu einem Notenbank-Entscheid. */
export function entscheidUrteil(r: Release): { text: string; ton: "gut" | "schlecht" | "neutral" | "fehlt" } {
  if (r.ist === null) return { text: "Ist fehlt", ton: "fehlt" };
  if (r.erwartung === null) return { text: "keine Erwartung", ton: "neutral" };
  if (Math.abs(r.ist - r.erwartung) < 0.001) {
    return { text: r.vorwert !== null && Math.abs(r.ist - r.vorwert) >= 0.001 ? "Schritt wie erwartet" : "Halten wie erwartet", ton: "neutral" };
  }
  return r.ist > r.erwartung
    ? { text: "Überraschung falkenhaft", ton: "gut" }
    : { text: "Überraschung taubenhaft", ton: "schlecht" };
}
