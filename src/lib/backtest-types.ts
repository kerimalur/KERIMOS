/**
 * Reine Typen + Rechenlogik fürs native Backtest-Journal — bewusst OHNE
 * "server-only", weil computeBreakdown auch im Client (Dimension-Umschalter
 * auf /trading/backtest) läuft. Die eigentlichen Supabase-Fetches liegen in
 * supabase/backtest.ts.
 */

export type BacktestCategoryKey = "gva_typ" | "confluence" | "anmerkung" | "skip_grund";
export type BacktestResult = "full_tp" | "teil_tp_be" | "sl" | "breakeven" | "skip";
export type BacktestDirection = "long" | "short";

export const RESULT_LABEL: Record<BacktestResult, string> = {
  full_tp: "Full TP",
  teil_tp_be: "Teil-TP dann BE",
  sl: "SL",
  breakeven: "Breakeven",
  skip: "Skip",
};

export interface BacktestTag {
  id: string;
  label: string;
  sort_order: number;
  archived: boolean;
}

export interface BacktestCategory {
  id: string;
  key: BacktestCategoryKey;
  label: string;
  allow_multiple: boolean;
  tags: BacktestTag[];
}

export interface TradeTag {
  tagId: string;
  label: string;
  categoryKey: BacktestCategoryKey;
}

export interface NativeBacktestTrade {
  id: string;
  occurred_on: string;
  pair: string;
  direction: BacktestDirection;
  result: BacktestResult;
  r_multiple: number | null;
  rr_geplant: number | null;
  notiz: string | null;
  tradingview_link: string | null;
  screenshot_url: string | null;
  tags: TradeTag[];
}

export interface NativeBacktestStats {
  total: number;
  gewertet: number;
  skips: number;
  wins: number;
  winrate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  gesamtR: number;
}

/** Kennzahlen wie im alten Sheet-Dashboard, jetzt aus den echten Zeilen berechnet. */
export function computeNativeBacktestStats(trades: NativeBacktestTrade[]): NativeBacktestStats {
  const gewertet = trades.filter((t) => t.result !== "skip");
  let wins = 0, grossWin = 0, grossLoss = 0, sumR = 0;

  for (const t of gewertet) {
    const r = t.r_multiple ?? 0;
    sumR += r;
    if (r > 0) { wins++; grossWin += r; }
    else if (r < 0) { grossLoss += Math.abs(r); }
  }

  return {
    total: trades.length,
    gewertet: gewertet.length,
    skips: trades.length - gewertet.length,
    wins,
    winrate: gewertet.length > 0 ? (wins / gewertet.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: gewertet.length > 0 ? sumR / gewertet.length : null,
    gesamtR: Math.round(sumR * 100) / 100,
  };
}

export type BreakdownDimension =
  | "gva_typ" | "direction" | "wochentag" | "confluence" | "anmerkung" | "pair" | "skip_grund";

export const BREAKDOWN_DIMENSIONS: BreakdownDimension[] =
  ["gva_typ", "direction", "wochentag", "confluence", "anmerkung", "pair", "skip_grund"];

export const BREAKDOWN_LABEL: Record<BreakdownDimension, string> = {
  gva_typ: "GVA-Typ", direction: "Richtung", wochentag: "Wochentag",
  confluence: "Confluence", anmerkung: "Anmerkung", pair: "Pair", skip_grund: "Skip-Grund",
};

export interface BreakdownRow {
  label: string;
  n: number;
  winrate: number | null;
  gesamtR: number;
}

const WOCHENTAG_ORDER = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

/** "2026-08-09" -> "Sonntag", ohne Server-Zeitzonen-Kram - reicht fürs Gruppieren. */
function wochentagVon(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("de-CH", { weekday: "long" });
}

/**
 * Anpassbares Output: gruppiert nach einer beliebigen Dimension. Ein Trade
 * mit mehreren Confluence-/Anmerkung-Tags erscheint in jedem seiner Buckets
 * einmal — exakt das Verhalten der alten "Nach Confluence"-Auswertung im
 * Sheet, deren Summen deshalb bewusst über der Trade-Zahl liegen können.
 */
export function computeBreakdown(
  trades: NativeBacktestTrade[], dimension: BreakdownDimension,
): BreakdownRow[] {
  const buckets = new Map<string, { n: number; wins: number; sumR: number; gewertet: number }>();
  const add = (label: string, r: number | null, istGewertet: boolean) => {
    const b = buckets.get(label) ?? { n: 0, wins: 0, sumR: 0, gewertet: 0 };
    b.n++;
    if (istGewertet) {
      b.gewertet++;
      const rr = r ?? 0;
      b.sumR += rr;
      if (rr > 0) b.wins++;
    }
    buckets.set(label, b);
  };

  if (dimension === "skip_grund") {
    for (const t of trades.filter((x) => x.result === "skip")) {
      const grund = t.tags.find((tg) => tg.categoryKey === "skip_grund");
      add(grund?.label ?? "(kein Grund erfasst)", null, false);
    }
  } else {
    for (const t of trades.filter((x) => x.result !== "skip")) {
      if (dimension === "direction") {
        add(t.direction === "long" ? "Long" : "Short", t.r_multiple, true);
      } else if (dimension === "wochentag") {
        add(wochentagVon(t.occurred_on), t.r_multiple, true);
      } else if (dimension === "pair") {
        add(t.pair, t.r_multiple, true);
      } else {
        const tags = t.tags.filter((tg) => tg.categoryKey === dimension);
        if (tags.length === 0) add("(keine Angabe)", t.r_multiple, true);
        for (const tg of tags) add(tg.label, t.r_multiple, true);
      }
    }
  }

  const rows: BreakdownRow[] = [...buckets.entries()].map(([label, b]) => ({
    label, n: b.n,
    winrate: b.gewertet > 0 ? (b.wins / b.gewertet) * 100 : null,
    gesamtR: Math.round(b.sumR * 100) / 100,
  }));

  if (dimension === "wochentag") {
    rows.sort((a, b) => WOCHENTAG_ORDER.indexOf(a.label) - WOCHENTAG_ORDER.indexOf(b.label));
  } else {
    rows.sort((a, b) => b.n - a.n);
  }
  return rows;
}
