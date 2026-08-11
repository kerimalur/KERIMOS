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

/**
 * Faktoren, mit denen aus dem geplanten RR das erreichte R wird.
 *
 * Die Werte stammen aus Kerims eigenem Sheet: über alle migrierten Trades
 * lag R/RR bei Full TP konstant zwischen 0.808 und 0.812, bei Teil-TP-dann-BE
 * bei 0.310. Der Abschlag gegenüber dem vollen RR bildet ab, dass der
 * Einstieg selten exakt am Fib sitzt und Spread anfällt.
 *
 * SL ist bewusst KEIN Faktor, sondern fix -1: ein ausgelöster Stop kostet
 * immer genau ein R, unabhängig davon, wie weit das Ziel entfernt war.
 */
export const R_FAKTOR_STANDARD: Record<BacktestResult, number | null> = {
  full_tp: 0.81,
  teil_tp_be: 0.31,
  sl: -1,
  breakeven: 0,
  skip: null,
};

/** Nur diese zwei skalieren mit dem geplanten RR. */
const SKALIERT: BacktestResult[] = ["full_tp", "teil_tp_be"];

/**
 * Erreichtes R aus Ergebnis und geplantem RR.
 *
 * Null heisst "nicht berechenbar" - beim Skip gibt es kein Ergebnis, und
 * ohne RR lässt sich ein Full TP nicht beziffern. Das Formular lässt den
 * Wert dann leer, statt eine Null hinzuschreiben, die wie ein Breakeven
 * aussähe.
 */
export function berechneR(
  result: BacktestResult,
  rrGeplant: number | null,
  faktoren: Record<BacktestResult, number | null> = R_FAKTOR_STANDARD,
): number | null {
  const f = faktoren[result];
  if (f === null || f === undefined) return null;
  if (!SKALIERT.includes(result)) return f;
  if (rrGeplant === null || !Number.isFinite(rrGeplant)) return null;
  return Math.round(f * rrGeplant * 100) / 100;
}

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
  session_id: string | null;
  tags: TradeTag[];
}

export type SessionStatus = "aktiv" | "abgeschlossen";

/**
 * Eine Backtest-Session: an ein Pair gebunden, damit man es beim Erfassen
 * nicht bei jedem Trade neu eintippen muss. "Aktiv" heisst: wählbar im
 * Trade-Formular. "Abgeschlossen" = ausgewertet, lässt sich jederzeit
 * reaktivieren, um sie weiterzuführen.
 */
export interface BacktestSession {
  id: string;
  pair: string;
  status: SessionStatus;
  created_at: string;
  closed_at: string | null;
}

/** Ein Punkt der Vor-dem-Trade-Checkliste. */
export interface ChecklistPunkt {
  id: string;
  label: string;
  sort_order: number;
  archived: boolean;
}

/**
 * Bild-Adresse zu einem TradingView-Link.
 *
 * Ein geteilter Chart (tradingview.com/x/ABC123/) liegt als PNG unter
 * s3.tradingview.com/snapshots/<erster Buchstabe klein>/<ID>.png - so lässt
 * sich der Chart direkt anzeigen, statt nur zu verlinken. Zeigt der Link
 * schon auf eine Bilddatei, wird er unverändert genommen.
 *
 * Null heisst: daraus lässt sich kein Bild ableiten (z.B. ein Link auf ein
 * Chart-Layout statt auf einen Schnappschuss). Dann bleibt der Link ein Link.
 */
export function tradingViewBild(link: string | null): string | null {
  if (!link) return null;
  const sauber = link.trim();
  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(sauber)) return sauber;

  const treffer = sauber.match(/tradingview\.com\/x\/([A-Za-z0-9]+)/);
  if (!treffer) return null;
  const id = treffer[1];
  return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
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
  /** Ø R pro Trade in dieser Gruppe - die eigentliche Edge-Kennzahl. */
  expectancy: number | null;
  /** Wie viele davon in den Stop liefen. */
  sl: number;
  /** Anteil Stopouts in Prozent. Null ohne gewertete Trades. */
  slQuote: number | null;
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
  /** Nur Stopouts betrachten - für die Frage "woran scheitern meine Trades". */
  nurSL = false,
): BreakdownRow[] {
  const buckets = new Map<string,
    { n: number; wins: number; sumR: number; gewertet: number; sl: number }>();
  const add = (label: string, r: number | null, istGewertet: boolean, istSL = false) => {
    const b = buckets.get(label) ?? { n: 0, wins: 0, sumR: 0, gewertet: 0, sl: 0 };
    b.n++;
    if (istSL) b.sl++;
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
    const basis = trades.filter((x) =>
      nurSL ? x.result === "sl" : x.result !== "skip");
    for (const t of basis) {
      const istSL = t.result === "sl";
      if (dimension === "direction") {
        add(t.direction === "long" ? "Long" : "Short", t.r_multiple, true, istSL);
      } else if (dimension === "wochentag") {
        add(wochentagVon(t.occurred_on), t.r_multiple, true, istSL);
      } else if (dimension === "pair") {
        add(t.pair, t.r_multiple, true, istSL);
      } else {
        const tags = t.tags.filter((tg) => tg.categoryKey === dimension);
        if (tags.length === 0) add("(keine Angabe)", t.r_multiple, true, istSL);
        for (const tg of tags) add(tg.label, t.r_multiple, true, istSL);
      }
    }
  }

  const rows: BreakdownRow[] = [...buckets.entries()].map(([label, b]) => ({
    label, n: b.n,
    winrate: b.gewertet > 0 ? (b.wins / b.gewertet) * 100 : null,
    gesamtR: Math.round(b.sumR * 100) / 100,
    expectancy: b.gewertet > 0 ? b.sumR / b.gewertet : null,
    sl: b.sl,
    slQuote: b.gewertet > 0 ? (b.sl / b.gewertet) * 100 : null,
  }));

  if (dimension === "wochentag") {
    rows.sort((a, b) => WOCHENTAG_ORDER.indexOf(a.label) - WOCHENTAG_ORDER.indexOf(b.label));
  } else {
    rows.sort((a, b) => b.n - a.n);
  }
  return rows;
}

/* --------------------------------------------------------------- Erkenntnisse */

export type InsightArt = "erkenntnis" | "pruefen" | "edge" | "warnung";

export interface Insight {
  art: InsightArt;
  titel: string;
  text: string;
  /** Anzahl Trades, auf der die Aussage beruht - Ehrlichkeit über die Basis. */
  basis: number;
}

export const INSIGHT_LABEL: Record<InsightArt, string> = {
  erkenntnis: "Erkenntnis",
  edge: "Mögliche Edge",
  pruefen: "Genauer prüfen",
  warnung: "Achtung",
};

/**
 * Ab wann eine Gruppe überhaupt eine Aussage trägt. Bewusst konservativ:
 * bei 5 Trades ist eine "80 % Winrate" reines Rauschen. Zwischen MIN_HINWEIS
 * und MIN_AUSSAGE gilt ein Muster als "genauer prüfen", darüber als
 * belastbarer - und selbst dann steht die Stichprobengrösse immer dabei.
 */
const MIN_HINWEIS = 5;
const MIN_AUSSAGE = 15;

/** Längste Serie gleicher Vorzeichen (Gewinn bzw. Verlust) in Datumsreihenfolge. */
function laengsteSerie(trades: NativeBacktestTrade[], gewinn: boolean): number {
  const chrono = [...trades]
    .filter((t) => t.result !== "skip")
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  let max = 0, aktuell = 0;
  for (const t of chrono) {
    const r = t.r_multiple ?? 0;
    const passt = gewinn ? r > 0 : r < 0;
    aktuell = passt ? aktuell + 1 : 0;
    if (aktuell > max) max = aktuell;
  }
  return max;
}

/** Grösster Rückgang der kumulierten R-Kurve (Peak-to-Trough), in R. */
function maxDrawdownR(trades: NativeBacktestTrade[]): number {
  const chrono = [...trades]
    .filter((t) => t.result !== "skip")
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  let kum = 0, peak = 0, maxDd = 0;
  for (const t of chrono) {
    kum += t.r_multiple ?? 0;
    if (kum > peak) peak = kum;
    const dd = peak - kum;
    if (dd > maxDd) maxDd = dd;
  }
  return Math.round(maxDd * 100) / 100;
}

/**
 * Leitet aus den Zahlen lesbare Hinweise ab - was auffällt, was eine Edge
 * sein KÖNNTE und was noch zu dünn belegt ist.
 *
 * Grundhaltung: nichts wird als bewiesen verkauft. Jede Aussage nennt ihre
 * Stichprobengrösse, und Muster unterhalb von MIN_AUSSAGE Trades landen
 * bewusst in "genauer prüfen" statt in "Edge". Das ist der ganze Zweck des
 * 200-Trades-Ziels der Roadmap: vorher sind das Indizien, keine Belege.
 */
export function computeInsights(
  trades: NativeBacktestTrade[],
  stats: NativeBacktestStats,
): Insight[] {
  const insights: Insight[] = [];
  if (stats.total === 0) return insights;

  // ---------------------------------------------------------------- Gesamtbild
  if (stats.gewertet < MIN_AUSSAGE) {
    insights.push({
      art: "pruefen",
      titel: "Stichprobe noch klein",
      text: `Erst ${stats.gewertet} gewertete Trades. Alles hier unten sind Indizien, ` +
        `keine Belege - Muster können sich mit den nächsten 20 Trades komplett drehen.`,
      basis: stats.gewertet,
    });
  }

  if (stats.profitFactor !== null && stats.gewertet >= MIN_HINWEIS) {
    if (stats.profitFactor >= 1.5) {
      insights.push({
        art: stats.gewertet >= MIN_AUSSAGE ? "edge" : "pruefen",
        titel: `Profit Factor ${stats.profitFactor.toFixed(2)}`,
        text: `Pro 1 R Verlust stehen ${stats.profitFactor.toFixed(2)} R Gewinn. ` +
          (stats.gewertet >= MIN_AUSSAGE
            ? "Das ist die Grössenordnung, die ein Setup tragfähig macht."
            : "Sieht gut aus, ist aber noch auf zu wenig Trades gebaut."),
        basis: stats.gewertet,
      });
    } else if (stats.profitFactor < 1) {
      insights.push({
        art: "warnung",
        titel: `Profit Factor unter 1 (${stats.profitFactor.toFixed(2)})`,
        text: "Die Verluste übersteigen die Gewinne. Bevor mehr Volumen dazukommt, " +
          "lohnt der Blick auf die Verlust-Trades: gleiche Fehlerquelle oder Streuung?",
        basis: stats.gewertet,
      });
    }
  }

  if (stats.expectancy !== null && stats.gewertet >= MIN_HINWEIS) {
    insights.push({
      art: "erkenntnis",
      titel: `${stats.expectancy > 0 ? "+" : ""}${stats.expectancy.toFixed(2)} R pro Trade`,
      text: stats.expectancy > 0
        ? `Bei ${stats.gewertet} Trades ergibt das ${stats.gesamtR > 0 ? "+" : ""}` +
          `${stats.gesamtR.toFixed(2)} R gesamt. Hochgerechnet auf 100 Trades: ` +
          `${(stats.expectancy * 100).toFixed(0)} R - unter der Annahme, dass es so bleibt.`
        : "Der Erwartungswert ist negativ. So wie es aktuell aussieht, kostet jeder " +
          "zusätzliche Trade im Schnitt Geld.",
      basis: stats.gewertet,
    });
  }

  // -------------------------------------------------------------- Skip-Disziplin
  if (stats.total >= MIN_HINWEIS) {
    const skipQuote = (stats.skips / stats.total) * 100;
    if (skipQuote >= 40) {
      insights.push({
        art: "erkenntnis",
        titel: `${skipQuote.toFixed(0)} % Skip-Quote`,
        text: `${stats.skips} von ${stats.total} Setups wurden aussortiert. Hohe Quote ` +
          "heisst diszipliniert - lohnt sich zu prüfen, ob unter den Skips systematisch " +
          "Gewinner sind, die die Filter zu streng aussortieren.",
        basis: stats.total,
      });
    } else if (skipQuote > 0 && skipQuote < 10) {
      insights.push({
        art: "pruefen",
        titel: `Nur ${skipQuote.toFixed(0)} % Skips`,
        text: "Fast jedes Setup wird genommen. Entweder ist die Vorauswahl im Chart " +
          "schon sehr sauber - oder die Kriterien filtern im Backtest zu wenig.",
        basis: stats.total,
      });
    }
  }

  // ----------------------------------------------------------- Serien/Drawdown
  if (stats.gewertet >= MIN_HINWEIS) {
    const verlustserie = laengsteSerie(trades, false);
    const dd = maxDrawdownR(trades);
    if (verlustserie >= 3) {
      insights.push({
        art: "warnung",
        titel: `${verlustserie} Verluste in Folge`,
        text: `Grösster Rückgang der R-Kurve: ${dd.toFixed(2)} R. Genau das muss die ` +
          "Positionsgrösse aushalten - bei FTMO ist die Drawdown-Grenze das, woran " +
          "die meisten scheitern, nicht die Winrate.",
        basis: stats.gewertet,
      });
    }
  }

  // ------------------------------------------------- Dimensionen: Edges suchen
  const dimensionen: BreakdownDimension[] =
    ["gva_typ", "confluence", "anmerkung", "direction", "wochentag", "pair"];

  for (const dim of dimensionen) {
    const rows = computeBreakdown(trades, dim)
      .filter((r) => r.n >= MIN_HINWEIS && r.expectancy !== null && r.label !== "(keine Angabe)");
    if (rows.length < 2) continue;

    const sortiert = [...rows].sort((a, b) => (b.expectancy ?? 0) - (a.expectancy ?? 0));
    const best = sortiert[0];
    const schlecht = sortiert[sortiert.length - 1];
    const spanne = (best.expectancy ?? 0) - (schlecht.expectancy ?? 0);

    // Nur berichten, wenn der Unterschied gross genug ist, um interessant zu
    // sein - 0.5 R Unterschied pro Trade ist eine Grössenordnung, die sich
    // im Ergebnis bemerkbar macht.
    if (spanne < 0.5) continue;

    if ((best.expectancy ?? 0) > 0) {
      insights.push({
        art: best.n >= MIN_AUSSAGE ? "edge" : "pruefen",
        titel: `${BREAKDOWN_LABEL[dim]}: „${best.label}" sticht heraus`,
        text: `${(best.expectancy ?? 0).toFixed(2)} R pro Trade über ${best.n} Trades` +
          (best.winrate !== null ? ` (${best.winrate.toFixed(0)} % Winrate)` : "") +
          `, gegenüber ${(schlecht.expectancy ?? 0).toFixed(2)} R bei „${schlecht.label}". ` +
          (best.n >= MIN_AUSSAGE
            ? "Das ist die Art Unterschied, aus der sich ein Filter bauen lässt."
            : `Nur ${best.n} Trades - erst weiter beobachten, bevor du danach filterst.`),
        basis: best.n,
      });
    }

    if ((schlecht.expectancy ?? 0) < -0.2 && schlecht.n >= MIN_HINWEIS) {
      insights.push({
        art: "pruefen",
        titel: `${BREAKDOWN_LABEL[dim]}: „${schlecht.label}" kostet`,
        text: `${(schlecht.expectancy ?? 0).toFixed(2)} R pro Trade über ${schlecht.n} Trades. ` +
          "Lohnt zu prüfen, ob diese Konstellation ein Ausschlusskriterium sein sollte.",
        basis: schlecht.n,
      });
    }
  }

  // ---------------------------------------------- Was als Nächstes zu tun ist
  const untersucht = new Set(
    computeBreakdown(trades, "confluence").filter((r) => r.n >= MIN_HINWEIS).map((r) => r.label),
  );
  const duenn = computeBreakdown(trades, "confluence")
    .filter((r) => r.n > 0 && r.n < MIN_HINWEIS && r.label !== "(keine Angabe)");
  if (duenn.length > 0 && untersucht.size > 0) {
    insights.push({
      art: "pruefen",
      titel: "Zu dünn belegte Confluences",
      text: `${duenn.map((r) => `„${r.label}" (${r.n})`).join(", ")} ` +
        `${duenn.length === 1 ? "hat" : "haben"} noch zu wenig Trades für eine Aussage. ` +
        "Gezielt Setups mit diesen Merkmalen suchen, dann wird die Auswertung vollständig.",
      basis: duenn.reduce((s, r) => s + r.n, 0),
    });
  }

  // Edge-Aussagen zuerst, dann Warnungen, dann der Rest.
  const rang: Record<InsightArt, number> = { edge: 0, warnung: 1, erkenntnis: 2, pruefen: 3 };
  return insights.sort((a, b) => rang[a.art] - rang[b.art]);
}

/** Kumulierte R-Kurve in Datumsreihenfolge - Datenbasis für den Verlaufs-Chart. */
export interface EquityPunkt {
  index: number;
  datum: string;
  kumR: number;
}

export function computeEquityKurve(trades: NativeBacktestTrade[]): EquityPunkt[] {
  const chrono = [...trades]
    .filter((t) => t.result !== "skip")
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  let kum = 0;
  return chrono.map((t, i) => {
    kum += t.r_multiple ?? 0;
    return { index: i + 1, datum: t.occurred_on, kumR: Math.round(kum * 100) / 100 };
  });
}
