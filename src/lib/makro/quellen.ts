import "server-only";
import { holeSerie, type Beobachtung } from "./fred";
import { periodeZuDatum } from "./perioden";

/**
 * Woher die Wirtschaftsdaten kommen — alle Quellen, nicht nur FRED
 * (26.09.2026, zweiter Anlauf).
 *
 * FRED allein reicht nicht: es spiegelt die OECD-Reihen, und genau die hat
 * es 2024 still eingestellt (Frühindikator, Eurozone-Arbeitslosigkeit). Also
 * direkt an die Quellen, alle ohne Schlüssel:
 *
 *   OECD      sdmx.oecd.org — Frühindikator (CLI), Arbeitslosenquote,
 *             BIP-Wachstum zum Vorjahr. Monatlich/quartalsweise, aktuell.
 *   Eurostat  Eurozone-Arbeitslosenquote, Eurozone-BIP, Rendite Eurozone;
 *             Schweizer Arbeitslosenquote monatlich.
 *   IMF       DataMapper — Leistungsbilanz und Staatsschulden in % des BIP,
 *             jährlich. Das ist die einzige freie Quelle dafür.
 *   FRED      wie bisher, als Ersatz und für US-Reihen.
 *
 * Je Feld werden ALLE Kandidaten geholt, genommen wird der mit dem jüngsten
 * Wert. So gewinnt automatisch die Quelle, die gerade aktuell ist — und fällt
 * eine aus, springt die nächste ein.
 *
 * Was es nirgends frei gibt (PMI, Auktionsnachfrage), bleibt Handarbeit; die
 * Seite verlinkt dafür direkt auf die Stelle, wo man die Zahl abliest
 * (lib/makro/links.ts).
 *
 * Achtung Rate-Limit: die OECD lässt rund 20 Abfragen pro Minute zu. Deshalb
 * holt ein Lauf jedes OECD-Dataset nur EINMAL für alle Länder zusammen.
 */

export type Quelle =
  | { typ: "fred"; id: string }
  | { typ: "oecd"; set: OecdSet; land: string }
  | { typ: "eurostat"; dataset: string; params: Record<string, string> }
  | { typ: "imf"; indikator: string; land: string };

/** Die OECD-Abfragen, je mit Platzhalter {L} für die Länder. */
export const OECD_SETS = {
  cli: {
    name: "OECD · Frühindikator (CLI)",
    flow: "OECD.SDD.STES,DSD_STES@DF_CLI,",
    key: "{L}.M.LI...AA...H",
  },
  arbeitslos_m: {
    name: "OECD · Arbeitslosenquote",
    flow: "OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M,",
    key: "{L}.UNE_LF_M.PT_LF_SUB._Z.Y._T.Y_GE15._Z.M",
  },
  arbeitslos_q: {
    name: "OECD · Arbeitslosenquote (Quartal)",
    flow: "OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M,",
    key: "{L}.UNE_LF_M.PT_LF_SUB._Z.Y._T.Y_GE15._Z.Q",
  },
  bip: {
    name: "OECD · BIP zum Vorjahr",
    flow: "OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,",
    key: "Q.Y.{L}.S1.S1.B1GQ._Z._Z._Z.PC.L.GY.T0102",
  },
} as const;
export type OecdSet = keyof typeof OECD_SETS;

const fred = (id: string): Quelle => ({ typ: "fred", id });
const oecd = (set: OecdSet, land: string): Quelle => ({ typ: "oecd", set, land });
const imf = (indikator: string, land: string): Quelle => ({ typ: "imf", indikator, land });
const euro = (dataset: string, params: Record<string, string>): Quelle =>
  ({ typ: "eurostat", dataset, params });

const EA_ARBEIT = (geo: string) =>
  euro("une_rt_m", { geo, age: "TOTAL", sex: "T", unit: "PC_ACT", s_adj: "SA" });
const EA_BIP = (geo: string) =>
  euro("namq_10_gdp", { geo, unit: "CLV_PCH_SM", s_adj: "SCA", na_item: "B1GQ" });

/** IMF-Ländercodes. Die Eurozone heisst dort EURO. */
const IMF_LAND: Record<string, string> = {
  USD: "USA", EUR: "EURO", GBP: "GBR", JPY: "JPN", AUD: "AUS", NZD: "NZL", CAD: "CAN", CHF: "CHE",
};

/**
 * Je Währung und Feld die Kandidaten. Reihenfolge = Vorzug bei Gleichstand.
 * Ein Feld, das hier fehlt (PMI, Auktionsnachfrage), gibt es nicht frei.
 */
export const QUELLEN: Record<string, Record<string, Quelle[]>> = {
  USD: {
    fruehindikator: [oecd("cli", "USA"), fred("USALOLITONOSTSAM")],
    arbeitslos: [fred("UNRATE"), oecd("arbeitslos_m", "USA")],
    bip_yoy: [fred("A191RO1Q156NBEA"), oecd("bip", "USA")],
    rendite_10j: [fred("DGS10"), fred("IRLTLT01USM156N")],
  },
  EUR: {
    // G4E = die vier grossen Euroländer. Einen CLI für die ganze Eurozone
    // veröffentlicht die OECD nicht mehr.
    fruehindikator: [oecd("cli", "G4E"), oecd("cli", "EA20"), oecd("cli", "DEU")],
    arbeitslos: [EA_ARBEIT("EA21"), EA_ARBEIT("EA20"), fred("LRHUTTTTDEM156S")],
    bip_yoy: [EA_BIP("EA21"), EA_BIP("EA20"), EA_BIP("EA"), fred("CLVMNACSCAB1GQEA19@pc1")],
    rendite_10j: [euro("irt_lt_mcby_m", { geo: "EA" }), fred("IRLTLT01DEM156N")],
  },
  GBP: {
    fruehindikator: [oecd("cli", "GBR")],
    arbeitslos: [oecd("arbeitslos_m", "GBR"), fred("LRHUTTTTGBM156S")],
    bip_yoy: [oecd("bip", "GBR"), fred("NGDPRSAXDCGBQ@pc1")],
    rendite_10j: [fred("IRLTLT01GBM156N")],
  },
  JPY: {
    fruehindikator: [oecd("cli", "JPN")],
    arbeitslos: [oecd("arbeitslos_m", "JPN"), fred("LRHUTTTTJPM156S")],
    bip_yoy: [oecd("bip", "JPN"), fred("JPNRGDPEXP@pc1")],
    rendite_10j: [fred("IRLTLT01JPM156N")],
  },
  AUD: {
    fruehindikator: [oecd("cli", "AUS")],
    arbeitslos: [oecd("arbeitslos_m", "AUS"), fred("LRHUTTTTAUM156S")],
    bip_yoy: [oecd("bip", "AUS"), fred("NGDPRSAXDCAUQ@pc1")],
    rendite_10j: [fred("IRLTLT01AUM156N")],
  },
  NZD: {
    // Für Neuseeland veröffentlicht die OECD keinen Frühindikator mehr.
    fruehindikator: [oecd("cli", "NZL")],
    arbeitslos: [oecd("arbeitslos_q", "NZL"), fred("LRHUTTTTNZQ156S")],
    bip_yoy: [oecd("bip", "NZL")],
    rendite_10j: [fred("IRLTLT01NZM156N")],
  },
  CAD: {
    fruehindikator: [oecd("cli", "CAN")],
    arbeitslos: [oecd("arbeitslos_m", "CAN"), fred("LRHUTTTTCAM156S")],
    bip_yoy: [oecd("bip", "CAN"), fred("NGDPRSAXDCCAQ@pc1")],
    rendite_10j: [fred("IRLTLT01CAM156N")],
  },
  CHF: {
    // Für die Schweiz ebenfalls kein CLI mehr — Ersatz ist das KOF-Barometer
    // (von Hand, verlinkt).
    fruehindikator: [oecd("cli", "CHE")],
    arbeitslos: [euro("une_rt_m", { geo: "CH", age: "TOTAL", sex: "T", unit: "PC_ACT", s_adj: "SA" }),
      oecd("arbeitslos_q", "CHE"), fred("LRHUTTTTCHQ156S")],
    bip_yoy: [oecd("bip", "CHE"), fred("CLVMNACSCAB1GQCH@pc1")],
    rendite_10j: [fred("IRLTLT01CHM156N")],
  },
};

// Leistungsbilanz und Staatsschulden kommen für alle acht vom IMF.
for (const [ccy, land] of Object.entries(IMF_LAND)) {
  QUELLEN[ccy].handelsbilanz = [imf("BCA_NGDPD", land)];
  QUELLEN[ccy].staatsschulden = [imf("GGXWDG_NGDP", land)];
}

/** Felder, die ein Lauf automatisch füllen kann (für die Seite). */
export const AUTO_FELDER = [...new Set(Object.values(QUELLEN).flatMap((f) => Object.keys(f)))];

/* ------------------------------------------------------------ Hilfen */

async function holeText(url: string, timeoutMs = 20000): Promise<string> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "KerimOS/1.0 (privat)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

const sortiert = (w: Beobachtung[]) =>
  w.filter((x) => Number.isFinite(x.wert)).sort((a, b) => a.datum.localeCompare(b.datum)).slice(-26);

/* ------------------------------------------------------------- OECD */

/** Alle Länder, die ein Set im Katalog braucht — für EINE Abfrage pro Set. */
function oecdLaender(set: OecdSet): string[] {
  const l = new Set<string>();
  for (const felder of Object.values(QUELLEN)) {
    for (const qs of Object.values(felder)) {
      for (const q of qs) if (q.typ === "oecd" && q.set === set) l.add(q.land);
    }
  }
  return [...l];
}

/**
 * Ein OECD-Set für alle Länder auf einmal, als CSV. Die OECD liefert Länder
 * ohne Daten einfach nicht mit — deshalb ist „fehlt" hier kein Fehler der
 * Abfrage, sondern eine Aussage über das Land.
 */
export function oecdLader() {
  const cache = new Map<OecdSet, Promise<Map<string, Beobachtung[]>>>();
  return (set: OecdSet) => {
    if (!cache.has(set)) {
      cache.set(set, (async () => {
        const def = OECD_SETS[set];
        const start = new Date();
        start.setUTCFullYear(start.getUTCFullYear() - 3);
        const url = `https://sdmx.oecd.org/public/rest/data/${def.flow}/`
          + def.key.replace("{L}", oecdLaender(set).join("+"))
          + `?startPeriod=${start.getUTCFullYear()}&format=csvfile`;
        const zeilen = (await holeText(url, 30000)).trim().split(/\r?\n/);
        const kopf = zeilen[0].split(",");
        const iLand = kopf.indexOf("REF_AREA");
        const iZeit = kopf.indexOf("TIME_PERIOD");
        const iWert = kopf.indexOf("OBS_VALUE");
        if (iLand < 0 || iZeit < 0 || iWert < 0) throw new Error("unerwartetes CSV-Format");

        const je = new Map<string, Beobachtung[]>();
        for (const z of zeilen.slice(1)) {
          const c = z.split(",");
          const datum = periodeZuDatum(c[iZeit] ?? "");
          const wert = Number(c[iWert]);
          if (!datum || c[iWert] === "" || !Number.isFinite(wert)) continue;
          const liste = je.get(c[iLand]) ?? [];
          liste.push({ datum, wert });
          je.set(c[iLand], liste);
        }
        for (const [k, v] of je) je.set(k, sortiert(v));
        return je;
      })());
    }
    return cache.get(set)!;
  };
}

/* ---------------------------------------------------------- Eurostat */

export async function holeEurostat(dataset: string, params: Record<string, string>): Promise<Beobachtung[]> {
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 3);
  const q = new URLSearchParams({ ...params, sinceTimePeriod: String(start.getUTCFullYear()) });
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${q}`;
  const j = JSON.parse(await holeText(url)) as {
    value?: Record<string, number>;
    dimension?: { time?: { category?: { index?: Record<string, number> } } };
  };
  const idx = j.dimension?.time?.category?.index ?? {};
  const werte: Beobachtung[] = [];
  for (const [periode, i] of Object.entries(idx)) {
    const v = j.value?.[String(i)];
    const datum = periodeZuDatum(periode);
    if (v !== undefined && datum) werte.push({ datum, wert: Number(v) });
  }
  return sortiert(werte);
}

/* --------------------------------------------------------------- IMF */

/**
 * IMF DataMapper, jährlich. Nur Jahre BIS zum Vorjahr: das laufende Jahr und
 * alles danach sind Prognosen des World Economic Outlook, keine Messwerte.
 */
export function imfLader() {
  const cache = new Map<string, Promise<Record<string, Record<string, number>>>>();
  return async (indikator: string, land: string, heute = new Date()): Promise<Beobachtung[]> => {
    if (!cache.has(indikator)) {
      const jahre = Array.from({ length: 6 }, (_, i) => heute.getUTCFullYear() - 5 + i).join(",");
      cache.set(indikator, holeText(
        `https://www.imf.org/external/datamapper/api/v1/${indikator}?periods=${jahre}`, 30000)
        .then((t) => (JSON.parse(t) as { values?: Record<string, Record<string, Record<string, number>>> })
          .values?.[indikator] ?? {}));
    }
    const reihe = (await cache.get(indikator)!)[land] ?? {};
    const bisJahr = heute.getUTCFullYear() - 1;
    return sortiert(Object.entries(reihe)
      .filter(([j]) => Number(j) <= bisJahr)
      .map(([j, v]) => ({ datum: `${j}-01-01`, wert: Number(v) })));
  };
}

/* ------------------------------------------------------------ Etikett */

export function quellenName(q: Quelle): string {
  switch (q.typ) {
    case "fred": return `FRED · ${q.id}`;
    case "oecd": return `${OECD_SETS[q.set].name} · ${q.land}`;
    case "eurostat": return `Eurostat · ${q.dataset} · ${q.params.geo ?? ""}`.trim();
    case "imf": return `IMF · ${q.indikator} · ${q.land}`;
  }
}

/* ------------------------------------------------------------- Holen */

export interface FeldErgebnis {
  ccy: string;
  feld: string;
  /** Name der gewählten Quelle, null wenn keine geliefert hat. */
  serie: string | null;
  werte: Beobachtung[];
  fehler: string | null;
}

/**
 * Alle Felder aller Währungen holen. Je Feld gewinnt der Kandidat mit dem
 * jüngsten Wert (bei Gleichstand der weiter vorne stehende).
 */
export async function holeAlles(): Promise<FeldErgebnis[]> {
  const oecd = oecdLader();
  const imf = imfLader();

  const eine = async (q: Quelle): Promise<Beobachtung[]> => {
    switch (q.typ) {
      case "fred": {
        const r = await holeSerie(q.id);
        if (r.fehler) throw new Error(r.fehler);
        return r.werte;
      }
      case "oecd": return (await oecd(q.set)).get(q.land) ?? [];
      case "eurostat": return holeEurostat(q.dataset, q.params);
      case "imf": return imf(q.indikator, q.land);
    }
  };

  const auftraege = Object.entries(QUELLEN).flatMap(([ccy, felder]) =>
    Object.entries(felder).map(async ([feld, kandidaten]): Promise<FeldErgebnis> => {
      const versuche = await Promise.all(kandidaten.map(async (q) => {
        try {
          const werte = await eine(q);
          return { q, werte, fehler: werte.length === 0 ? "keine Werte" : null };
        } catch (e) {
          return { q, werte: [] as Beobachtung[], fehler: e instanceof Error ? e.message : "unbekannt" };
        }
      }));

      const gut = versuche.filter((v) => !v.fehler);
      if (gut.length === 0) {
        return {
          ccy, feld, serie: null, werte: [],
          fehler: versuche.map((v) => `${quellenName(v.q)}: ${v.fehler}`).join(" · "),
        };
      }
      const letzte = (v: typeof gut[number]) => v.werte[v.werte.length - 1].datum;
      const beste = gut.reduce((a, b) => (letzte(b) > letzte(a) ? b : a));
      return { ccy, feld, serie: quellenName(beste.q), werte: beste.werte, fehler: null };
    }));

  return Promise.all(auftraege);
}
