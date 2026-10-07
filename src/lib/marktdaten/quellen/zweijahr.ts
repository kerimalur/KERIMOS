import { blattAusXml, excelDatum, xlsxBlatt, zipEintraege, type Blatt } from "./zip-xlsx";

/**
 * 2-Jahres-Renditen für GBP und CHF aus den offiziellen Quellen (05.10.2026).
 *
 * Bis hier lieferte das Screener-Backend die Reihen Y2_<CCY> — für GBP, NZD
 * und CHF aber nie. Damit fehlte bei drei Währungen die Markterwartung.
 *
 *   GBP  Bank of England, Zinskurve „UK nominal spot curve“, Laufzeit 2 Jahre.
 *        Nur als ZIP mit Excel-Dateien veröffentlicht; die Datei „current
 *        month“ enthält den laufenden Monat (täglich ergänzt).
 *   CHF  SNB-Datenportal, Würfel rendeiduebd: Kassazinssatz von
 *        Eidgenossen-Anleihen, Laufzeit 2 Jahre (D0=CHF, D1=2J), täglich.
 *   NZD  bleibt offen: Die RBNZ sperrt automatische Abrufe (HTTP 403).
 */

export interface ZinsPunkt { date: string; value: number }

const UA = "KerimOS/1.0 (+https://kerimos.vercel.app)";
export const BOE_AKTUELL_URL =
  "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip";
export const snbUrl = (von: string) =>
  `https://data.snb.ch/api/cube/rendeiduebd/data/csv/en?dimSel=D0(CHF),D1(2J)&fromDate=${von}`;

async function hole(url: string, timeoutMs = 30_000): Promise<Response> {
  const res = await fetch(url, {
    cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`);
  return res;
}

/* ------------------------------------------------------------------- CHF */

/** SNB-CSV („Date“;„D0“;„D1“;„Value“) → Punkte. Leere Werte (Feiertage) fallen weg. */
export function snbCsvLesen(csv: string): ZinsPunkt[] {
  const out: ZinsPunkt[] = [];
  for (const zeile of csv.split(/\r?\n/)) {
    const f = zeile.split(";").map((x) => x.replace(/^﻿/, "").replace(/^"|"$/g, ""));
    if (f.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(f[0]) || f[1] !== "CHF" || f[2] !== "2J" || f[3] === "") continue;
    const v = Number(f[3]);
    if (Number.isFinite(v)) out.push({ date: f[0], value: v });
  }
  return out;
}

export async function holeChf2J(von: string): Promise<ZinsPunkt[]> {
  return snbCsvLesen(await (await hole(snbUrl(von))).text());
}

/* ------------------------------------------------------------------- GBP */

/**
 * Aus dem Blatt „4. spot curve“ die Spalte mit Laufzeit `jahre`.
 * Aufbau: eine Kopfzeile, deren Spalte A mit „years“ beginnt und in den
 * übrigen Spalten die Laufzeiten 0.5, 1, 1.5, 2 … trägt; darunter je Zeile
 * ein Excel-Datum in A und die Renditen.
 */
export function boeSpotAusBlatt(blatt: Blatt, jahre = 2): ZinsPunkt[] {
  let kopf = -1;
  let spalte: string | null = null;
  for (const [nr, z] of [...blatt.entries()].sort((a, b) => a[0] - b[0])) {
    const a = z.get("A");
    if (typeof a === "string" && /^years/i.test(a.trim())) {
      for (const [s, w] of z) if (s !== "A" && typeof w === "number" && Math.abs(w - jahre) < 1e-6) spalte = s;
      kopf = nr;
      break;
    }
  }
  if (kopf < 0 || !spalte) return [];
  const out: ZinsPunkt[] = [];
  for (const [nr, z] of blatt) {
    if (nr <= kopf) continue;
    const a = z.get("A"), w = z.get(spalte);
    // Plausible Excel-Daten: 1980 … 2100
    if (typeof a !== "number" || a < 29_000 || a > 73_000 || typeof w !== "number") continue;
    out.push({ date: excelDatum(a), value: Math.round(w * 10_000) / 10_000 });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

const istSpotKurve = (name: string) => /spot curve/i.test(name) && !/short/i.test(name);

/** Alle Nominal-Dateien eines BoE-ZIPs → 2J-Punkte (aktueller Monat oder Archiv). */
export function boe2JAusZip(zip: Buffer): ZinsPunkt[] {
  const dateien = zipEintraege(zip, (n) => /nominal/i.test(n) && /\.xlsx$/i.test(n));
  const alle = new Map<string, number>();
  for (const xlsx of dateien.values()) {
    const blatt = xlsxBlatt(xlsx, istSpotKurve);
    if (!blatt) continue;
    for (const p of boeSpotAusBlatt(blatt)) alle.set(p.date, p.value);
  }
  return [...alle.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function holeGbp2J(): Promise<ZinsPunkt[]> {
  const buf = Buffer.from(await (await hole(BOE_AKTUELL_URL, 45_000)).arrayBuffer());
  return boe2JAusZip(buf);
}

// Für den Selbsttest.
export { blattAusXml };
