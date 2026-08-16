import "server-only";
import { unstable_cache } from "next/cache";
import { createTradingClient } from "@/lib/supabase/trading";
import { plusTage } from "./reihen";
import { nettoReihe, zuReihe } from "./rechnen";
import { G8, LEERE_DATEN, type Rohdaten } from "./faktoren";
import type { Punkt } from "./reihen";

/**
 * Die Rohdaten für die Confluence-Seite — direkt aus der Trading-Datenbank.
 *
 * KerimOS liest hier dieselben Tabellen, die der Screener befüllt
 * (`fred_series`, `cot_tff_reports`, `price_daily`). Kein Umweg über das
 * Render-Backend: dessen `/api/fundamentals` liefert nur den aktuellen Stand,
 * und für den Rückblick braucht es die Historie. Der Screener bleibt der
 * Datenmotor, KerimOS liest mit.
 *
 * Jede Abfrage ist auf ein Zeitfenster begrenzt. Die Ansicht „Jetzt" holt
 * gut ein Jahr, der Rückblick dreieinhalb Jahre um den Stichtag — sonst
 * lädt jede Seite acht Jahre Tagesdaten, die niemand ansieht.
 */

/* ------------------------------------------------------------- Katalog */

/** Leitzins bzw. kurzfristiger Geldmarktsatz je Währung (FRED-Serien-IDs). */
export const LEITZINS_SERIE: Record<string, string> = {
  USD: "FEDFUNDS",
  EUR: "ECBDFR",
  GBP: "IRSTCI01GBM156N",
  JPY: "IRSTCI01JPM156N",
  // CH/NZ: die IRSTCI01-Serien sind seit 2024 tot, deshalb 3M-Interbank als
  // Ersatz — dieselbe Wahl wie im Labor (lib/constants/fredSeries.ts).
  CHF: "IR3TIB01CHM156N",
  AUD: "IRSTCI01AUM156N",
  NZD: "IR3TIB01NZM156N",
  CAD: "IRSTCI01CAM156N",
};

/** CPI als Jahresrate in Prozent. Quelle BIS, weil die OECD-Serien tot sind. */
export const CPI_SERIE: Record<string, string> =
  Object.fromEntries(G8.map((c) => [c, `BIS_CPI_YOY_${c}`]));

/** CFTC-Contract je Währung. USD läuft über den Dollar-Index-Future. */
export const COT_CONTRACT: Record<string, string> = {
  EUR: "099741", GBP: "096742", JPY: "097741", CHF: "092741",
  CAD: "090741", AUD: "232741", NZD: "112741", USD: "098662",
};

export const VIX_SERIE = "VIXCLS";
export const PREIS_INSTRUMENTE = {
  spx: "SPX500_USD",
  gold: "XAU_USD",
  kupfer: "XCU_USD",
} as const;

/* ------------------------------------------------------------- Laden */

/**
 * Alle Zeilen holen, nicht nur die ersten tausend.
 *
 * PostgREST liefert standardmässig höchstens 1000 Zeilen und sagt das nicht
 * dazu — eine stillschweigend abgeschnittene Kursreihe würde hier zu einem
 * falschen 50-Tage-Schnitt und damit zu einem falschen Regime führen.
 */
async function holeAlle<T>(
  bauer: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  schritt = 1000, maxZeilen = 60_000,
): Promise<T[]> {
  const alle: T[] = [];
  for (let von = 0; von < maxZeilen; von += schritt) {
    const { data, error } = await bauer(von, von + schritt - 1);
    if (error || !data) break;
    alle.push(...data);
    if (data.length < schritt) break;
  }
  return alle;
}

interface FredZeile { series_id: string; date: string; value: number | null }
interface PreisZeile { instrument: string; date: string; close: number | null }
interface TffZeile {
  contract_code: string; report_date: string;
  lev_money_long: number | null; lev_money_short: number | null;
  open_interest: number | null;
}
interface LegacyZeile {
  contract_code: string; report_date: string;
  noncomm_long: number | null; noncomm_short: number | null;
  open_interest: number | null;
}

export interface Ladebericht {
  /** Woher das COT-Perzentil je Währung kommt. */
  cotQuelle: Record<string, "tff" | "legacy" | "keine">;
  /** Serien, die gar nichts geliefert haben. */
  leer: string[];
  von: string;
  bis: string;
}

export interface Geladen {
  daten: Rohdaten;
  bericht: Ladebericht;
}

async function ladeRoh(von: string, bis: string): Promise<Geladen> {
  const db = createTradingClient();
  const bericht: Ladebericht = { cotQuelle: {}, leer: [], von, bis };
  if (!db) {
    bericht.leer.push("Trading-Datenbank nicht verbunden");
    return { daten: LEERE_DATEN, bericht };
  }

  const zinsIds = Object.values(LEITZINS_SERIE);
  const cpiIds = Object.values(CPI_SERIE);
  const contracts = Object.values(COT_CONTRACT);

  const [fred, preise, tff, legacy] = await Promise.all([
    holeAlle<FredZeile>((a, b) => db
      .from("fred_series").select("series_id, date, value")
      .in("series_id", [...zinsIds, ...cpiIds, VIX_SERIE])
      .gte("date", von).lte("date", bis)
      .order("date", { ascending: true }).range(a, b)),
    holeAlle<PreisZeile>((a, b) => db
      .from("price_daily").select("instrument, date, close")
      .in("instrument", Object.values(PREIS_INSTRUMENTE))
      .gte("date", von).lte("date", bis)
      .order("date", { ascending: true }).range(a, b)),
    holeAlle<TffZeile>((a, b) => db
      .from("cot_tff_reports")
      .select("contract_code, report_date, lev_money_long, lev_money_short, open_interest")
      .in("contract_code", contracts)
      .gte("report_date", von).lte("report_date", bis)
      .order("report_date", { ascending: true }).range(a, b)),
    holeAlle<LegacyZeile>((a, b) => db
      .from("cot_reports")
      .select("contract_code, report_date, noncomm_long, noncomm_short, open_interest")
      .in("contract_code", contracts)
      .gte("report_date", von).lte("report_date", bis)
      .order("report_date", { ascending: true }).range(a, b)),
  ]);

  const nachSerie = (id: string) => zuReihe(fred.filter((z) => z.series_id === id));
  const nachInstrument = (inst: string) => zuReihe(
    preise.filter((z) => z.instrument === inst).map((z) => ({ date: z.date, value: z.close })),
  );

  const leitzins: Record<string, Punkt[]> = {};
  const cpi: Record<string, Punkt[]> = {};
  const cot: Record<string, Punkt[]> = {};

  for (const ccy of G8) {
    leitzins[ccy] = nachSerie(LEITZINS_SERIE[ccy]);
    cpi[ccy] = nachSerie(CPI_SERIE[ccy]);
    if (leitzins[ccy].length === 0) bericht.leer.push(`${ccy} Leitzins (${LEITZINS_SERIE[ccy]})`);
    if (cpi[ccy].length === 0) bericht.leer.push(`${ccy} CPI (${CPI_SERIE[ccy]})`);

    const code = COT_CONTRACT[ccy];
    // TFF trennt Hedgefonds von Asset Managern und ist für FX die schärfere
    // Quelle. Legacy nur als Ersatz - und niemals gemischt: zwei Definitionen
    // in einer Perzentil-Reihe ergäben einen Rang, den es nie gab.
    const ausTff = nettoReihe(
      tff.filter((z) => z.contract_code === code)
        .map((z) => ({ datum: z.report_date, lang: z.lev_money_long, kurz: z.lev_money_short, oi: z.open_interest })),
    );
    if (ausTff.length >= 26) {
      cot[ccy] = ausTff;
      bericht.cotQuelle[ccy] = "tff";
      continue;
    }
    const ausLegacy = nettoReihe(
      legacy.filter((z) => z.contract_code === code)
        .map((z) => ({ datum: z.report_date, lang: z.noncomm_long, kurz: z.noncomm_short, oi: z.open_interest })),
    );
    cot[ccy] = ausLegacy;
    bericht.cotQuelle[ccy] = ausLegacy.length >= 26 ? "legacy" : "keine";
  }

  const vix = nachSerie(VIX_SERIE);
  const spx = nachInstrument(PREIS_INSTRUMENTE.spx);
  const gold = nachInstrument(PREIS_INSTRUMENTE.gold);
  const kupfer = nachInstrument(PREIS_INSTRUMENTE.kupfer);
  if (vix.length === 0) bericht.leer.push("VIX");
  if (spx.length === 0) bericht.leer.push("S&P 500");
  if (gold.length === 0) bericht.leer.push("Gold");
  if (kupfer.length === 0) bericht.leer.push("Kupfer");

  return { daten: { leitzins, cpi, cot, vix, spx, gold, kupfer }, bericht };
}

/* ------------------------------------------------------------- Fenster */

/**
 * Wie weit vor dem Stichtag Daten gebraucht werden.
 *
 * Drei Jahre für das COT-Perzentil, ein halbes Jahr obendrauf für die
 * 6-Monats-Richtung der Zinsdifferenz, plus Reserve für Serien mit langem
 * Publikationsverzug.
 */
export const VORLAUF_TAGE = 1250;

const gecacht = unstable_cache(
  (von: string, bis: string) => ladeRoh(von, bis),
  ["confluence-roh-v1"],
  // Die Quellen sind täglich bis wöchentlich. Häufiger zu fragen bringt
  // nichts ausser Last auf einer Datenbank, die der Screener ohnehin braucht.
  { revalidate: 1800, tags: ["confluence"] },
);

/** Daten für einen einzelnen Stichtag (Ansicht „Jetzt" und „Rückblick"). */
export function ladeFuerStichtag(stichtag: string): Promise<Geladen> {
  return gecacht(plusTage(stichtag, -VORLAUF_TAGE), stichtag);
}

/** Daten für eine ganze Spanne (Ansicht „Bilanz" über alle Trades). */
export function ladeFuerSpanne(von: string, bis: string): Promise<Geladen> {
  return gecacht(plusTage(von, -VORLAUF_TAGE), bis);
}

/* ------------------------------------------- Zweitmeinung aus dem Labor */

export interface LaborUrteil {
  woche: string;
  instrument: string;
  richtung: "LONG" | "SHORT" | null;
  einig: number;
  faktoren: { name: string; dir: -1 | 0 | 1; text: string }[];
  /** "live" = am Wochenanfang eingefroren, "backfill" = rekonstruiert. */
  quelle: string;
}

/**
 * Das Wochenurteil des Labors zu diesem Paar — als Zweitmeinung.
 *
 * Die Tabelle `weekly_outlook_snapshots` enthält bis zu 416 Wochen mit fünf
 * Faktoren je Instrument. Sie ist bewusst NICHT die Grundlage dieser Seite:
 * ihre Backfill-Zeilen haben ein bekanntes Lookahead-Problem (Saisonalität
 * über die gesamte Preishistorie, monatliche Serien ohne Publikationsverzug).
 * Als zweite Meinung neben der eigenen Rechnung ist sie trotzdem nützlich —
 * vor allem dort, wo beide dasselbe sagen.
 */
export async function ladeLaborUrteil(
  instrument: string, woche: string,
): Promise<LaborUrteil | null> {
  const db = createTradingClient();
  if (!db) return null;

  const { data, error } = await db
    .from("weekly_outlook_snapshots")
    .select("week_start, instrument, direction, aligned_count, factors, source")
    .eq("instrument", instrument)
    .eq("week_start", woche)
    .maybeSingle();

  if (error || !data) return null;
  const z = data as unknown as {
    week_start: string; instrument: string; direction: "LONG" | "SHORT" | null;
    aligned_count: number | null;
    factors: { name: string; dir: -1 | 0 | 1; text: string }[] | null;
    source: string | null;
  };

  return {
    woche: z.week_start,
    instrument: z.instrument,
    richtung: z.direction,
    einig: z.aligned_count ?? 0,
    faktoren: z.factors ?? [],
    quelle: z.source ?? "unbekannt",
  };
}

export { alsInstrument, alsPaar } from "./rechnen";

/** Prüft schnell, ob überhaupt Snapshots vorliegen. */
export async function laborSnapshotsVorhanden(): Promise<number> {
  const db = createTradingClient();
  if (!db) return 0;
  const { count, error } = await db
    .from("weekly_outlook_snapshots")
    .select("*", { count: "exact", head: true });
  return error ? 0 : (count ?? 0);
}
