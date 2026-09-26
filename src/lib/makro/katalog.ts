/**
 * Welche Quelle welche Zahl liefert — der Katalog (26.09.2026).
 *
 * Rein, ohne Server-Abhängigkeit: der Server-Lauf (lib/makro/quellen.ts)
 * und das Nachladen im Browser (components/makro/browser-nachladen.tsx)
 * lesen dieselbe Liste.
 *
 * Quellen, alle ohne Schlüssel ausser FRED:
 *   OECD       Frühindikator, Arbeitslosenquote, BIP zum Vorjahr
 *   Eurostat   Eurozone: Arbeitslosenquote, BIP, Rendite, Leistungsbilanz,
 *              Staatsschulden; Schweiz: Arbeitslosenquote
 *   IMF        Leistungsbilanz und Staatsschulden, jährlich
 *   Weltbank   dasselbe als Ersatz, falls der IMF den Server abweist
 *   FRED       US-Reihen und Ersatz für alles
 *
 * Je Feld werden ALLE Kandidaten versucht; genommen wird der mit dem
 * jüngsten Wert. Was es nirgends frei gibt (PMI, Auktionsnachfrage), steht
 * hier nicht — die Seite verlinkt dafür (lib/makro/links.ts).
 */

export type Quelle =
  | { typ: "fred"; id: string }
  | { typ: "oecd"; set: OecdSet; land: string }
  | { typ: "eurostat"; dataset: string; params: Record<string, string> }
  | { typ: "imf"; indikator: string; land: string }
  | { typ: "weltbank"; indikator: string; land: string };

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
const euro = (dataset: string, params: Record<string, string>): Quelle =>
  ({ typ: "eurostat", dataset, params });

const EA_ARBEIT = (geo: string) =>
  euro("une_rt_m", { geo, age: "TOTAL", sex: "T", unit: "PC_ACT", s_adj: "SA" });
const EA_BIP = (geo: string) =>
  euro("namq_10_gdp", { geo, unit: "CLV_PCH_SM", s_adj: "SCA", na_item: "B1GQ" });

/** IMF-/Weltbank-Ländercodes. Die Eurozone heisst beim IMF EURO. */
const LAND3: Record<string, string> = {
  USD: "USA", EUR: "EURO", GBP: "GBR", JPY: "JPN", AUD: "AUS", NZD: "NZL", CAD: "CAN", CHF: "CHE",
};

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
    handelsbilanz: [
      euro("bop_gdp6_q", { geo: "EA21", bop_item: "CA", stk_flow: "BAL", unit: "PC_GDP",
        freq: "Q", partner: "EXT_EA21", s_adj: "SCA" }),
      { typ: "imf", indikator: "BCA_NGDPD", land: "EURO" },
    ],
    staatsschulden: [
      euro("gov_10q_ggdebt", { geo: "EA21", unit: "PC_GDP", sector: "S13", na_item: "GD" }),
      euro("gov_10q_ggdebt", { geo: "EA20", unit: "PC_GDP", sector: "S13", na_item: "GD" }),
      { typ: "imf", indikator: "GGXWDG_NGDP", land: "EURO" },
    ],
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
    // Auch für die Schweiz kein CLI mehr — Ersatz ist das KOF-Barometer
    // (von Hand, verlinkt).
    fruehindikator: [oecd("cli", "CHE")],
    arbeitslos: [euro("une_rt_m", { geo: "CH", age: "TOTAL", sex: "T", unit: "PC_ACT", s_adj: "SA" }),
      oecd("arbeitslos_q", "CHE"), fred("LRHUTTTTCHQ156S")],
    bip_yoy: [oecd("bip", "CHE"), fred("CLVMNACSCAB1GQCH@pc1")],
    rendite_10j: [fred("IRLTLT01CHM156N")],
  },
};

// Leistungsbilanz und Staatsschulden: IMF, sonst Weltbank. Die Eurozone
// hat oben schon Eurostat (quartalsweise, aktueller).
for (const [ccy, land] of Object.entries(LAND3)) {
  if (ccy === "EUR") continue;
  QUELLEN[ccy].handelsbilanz = [
    { typ: "imf", indikator: "BCA_NGDPD", land },
    { typ: "weltbank", indikator: "BN.CAB.XOKA.GD.ZS", land },
  ];
  QUELLEN[ccy].staatsschulden = [
    { typ: "imf", indikator: "GGXWDG_NGDP", land },
    // Weltbank: nur Zentralstaat — niedriger als die Gesamtschuld, aber
    // besser als nichts, und das Feld zählt ohnehin nur als Kontext.
    { typ: "weltbank", indikator: "GC.DOD.TOTL.GD.ZS", land },
  ];
}

/** Felder, die ein Lauf automatisch füllen kann (für die Seite). */
export const AUTO_FELDER = [...new Set(Object.values(QUELLEN).flatMap((f) => Object.keys(f)))];

export function quellenName(q: Quelle): string {
  switch (q.typ) {
    case "fred": return `FRED · ${q.id}`;
    case "oecd": return `${OECD_SETS[q.set].name} · ${q.land}`;
    case "eurostat": return `Eurostat · ${q.dataset} · ${q.params.geo ?? ""}`.trim();
    case "imf": return `IMF · ${q.indikator} · ${q.land}`;
    case "weltbank": return `Weltbank · ${q.indikator} · ${q.land}`;
  }
}

/** Alle Länder, die ein OECD-Set im Katalog braucht — für EINE Abfrage pro Set. */
export function oecdLaender(set: OecdSet): string[] {
  const l = new Set<string>();
  for (const felder of Object.values(QUELLEN)) {
    for (const qs of Object.values(felder)) {
      for (const q of qs) if (q.typ === "oecd" && q.set === set) l.add(q.land);
    }
  }
  return [...l];
}

/** Die URL einer OECD-Abfrage für alle Länder des Sets. */
export function oecdUrl(set: OecdSet, abJahr: number): string {
  const def = OECD_SETS[set];
  return `https://sdmx.oecd.org/public/rest/data/${def.flow}/`
    + def.key.replace("{L}", oecdLaender(set).join("+"))
    + `?startPeriod=${abJahr}&format=csvfile`;
}

/** Jede Stelle im Katalog, die aus einem OECD-Set kommt. */
export function oecdZuordnung(): { ccy: string; feld: string; set: OecdSet; land: string }[] {
  const out: { ccy: string; feld: string; set: OecdSet; land: string }[] = [];
  for (const [ccy, felder] of Object.entries(QUELLEN)) {
    for (const [feld, qs] of Object.entries(felder)) {
      for (const q of qs) if (q.typ === "oecd") out.push({ ccy, feld, set: q.set, land: q.land });
    }
  }
  return out;
}
