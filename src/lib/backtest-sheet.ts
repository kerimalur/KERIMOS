import "server-only";
import { createTradingClient } from "@/lib/supabase/trading";

/**
 * Backtest-Stand aus Kerims Google Sheet.
 *
 * Früher kam die Zahl aus `backtest_sessions` im GVA-Screener - das ist aber
 * der automatisierte Engine-Backtest, nicht der manuelle, den die Roadmap
 * meint. Massgeblich ist das Dashboard-Sheet, in dem jeder von Hand
 * durchgespielte Trade steht.
 *
 * Das Sheet ist als "Jeder mit dem Link" freigegeben, deshalb reicht die
 * öffentliche gviz-Adresse - kein Google-Login, kein API-Schlüssel.
 */

const SHEET_ID =
  process.env.BACKTEST_SHEET_ID ??
  "1njF9-BfAZUObPrYS4qb05IQQRWiEzmX3XGbbx6aF4Pg";

/** Ziel der Roadmap: erst ab hier ist die Auswertung belastbar. */
export const BACKTEST_ZIEL = 200;

export interface BacktestStand {
  trades: number;
  winrate: number | null;
  profitFactor: number | null;
  /** Summe aller R-Vielfachen, z.B. 14.32. */
  gesamtR: number | null;
  /** Erwartungswert je Trade in R. */
  erwartungswert: number | null;
  maxDrawdownR: number | null;
  skips: number | null;
}

/** "85.7%" -> 85.7 · "14.32 R" -> 14.32 · "-" -> null */
function zahl(roh: string | undefined): number | null {
  if (!roh) return null;
  const sauber = roh.replace(/[%\s]/g, "").replace(/R$/i, "").replace(",", ".");
  const n = Number(sauber);
  return Number.isFinite(n) ? n : null;
}

/**
 * Eine CSV-Zeile in Felder zerlegen. Google liefert alles in Anführungs-
 * zeichen; ein eigener Parser ist hier kürzer und verlässlicher als eine
 * Bibliothek, weil das Format fix ist.
 */
function zerlege(zeile: string): string[] {
  const felder: string[] = [];
  let aktuell = "";
  let inAnfuehrung = false;

  for (let i = 0; i < zeile.length; i++) {
    const z = zeile[i];
    if (z === '"') {
      if (inAnfuehrung && zeile[i + 1] === '"') {
        aktuell += '"';
        i++;
      } else {
        inAnfuehrung = !inAnfuehrung;
      }
    } else if (z === "," && !inAnfuehrung) {
      felder.push(aktuell);
      aktuell = "";
    } else {
      aktuell += z;
    }
  }
  felder.push(aktuell);
  return felder;
}

/**
 * Wochenzahl des manuellen Backtests aus dem laufenden Gesamtstand.
 *
 * Das Sheet liefert nur einen kumulativen Gesamtstand ("Trades gewertet"),
 * kein Datum pro Trade - die Roadmap will aber wissen, wie viele Trades
 * DIESE Woche dazugekommen sind. Deshalb merkt sich `backtest_manual_snapshots`
 * den Gesamtstand vom ersten Seitenaufruf einer Woche als Baseline; die
 * Wochenzahl ist seither Gesamtstand minus Baseline.
 *
 * Übergangs-Effekt: läuft diese Funktion zum ersten Mal in einer Woche und
 * es wurden davor in derselben Woche schon Trades geloggt, zählen die nicht
 * rückwirkend mit - die Baseline entsteht ja erst mit diesem Aufruf. Ab der
 * nächsten Woche ist die Zahl dann durchgehend korrekt.
 */
export async function fetchWeeklyManualBacktestCount(weekStart: string): Promise<number | null> {
  const trading = createTradingClient();
  if (!trading) return null;

  const stand = await fetchBacktestStand();
  if (stand === null) return null;

  const { data: vorhanden } = await trading
    .from("backtest_manual_snapshots")
    .select("baseline_trades")
    .eq("week_start", weekStart)
    .maybeSingle();

  if (vorhanden) {
    return Math.max(0, stand.trades - Number(vorhanden.baseline_trades));
  }

  // Erster Aufruf diese Woche: aktuellen Stand als Baseline festschreiben.
  await trading
    .from("backtest_manual_snapshots")
    .insert({ week_start: weekStart, baseline_trades: stand.trades });

  return 0;
}

export async function fetchBacktestStand(): Promise<BacktestStand | null> {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

  let text: string;
  try {
    // Zehn Minuten Cache: Kerim trägt Trades in Blöcken ein, nicht im
    // Sekundentakt. Bei jedem Seitenaufruf zu laden wäre Verschwendung.
    const antwort = await fetch(url, { next: { revalidate: 600 } });
    if (!antwort.ok) return null;
    text = await antwort.text();
  } catch {
    return null;
  }

  // Die Kennzahlen stehen als Label-Wert-Paare im Kopf des Dashboards.
  // Ab "Nach GVA-Typ" beginnen die Aufschlüsselungen, die eigene Zeilen
  // mit denselben Wörtern enthalten - deshalb dort abbrechen.
  const werte = new Map<string, string>();

  for (const zeile of text.split(/\r?\n/)) {
    const felder = zerlege(zeile);
    const label = (felder[1] ?? "").trim();
    const wert = (felder[2] ?? "").trim();

    if (label.startsWith("Nach ")) break;
    if (label && wert) werte.set(label, wert);
  }

  const trades = zahl(werte.get("Trades gewertet"));
  if (trades === null) return null;

  return {
    trades,
    winrate: zahl(werte.get("Winrate")),
    profitFactor: zahl(werte.get("Profit Factor")),
    gesamtR: zahl(werte.get("Gesamt R")),
    erwartungswert: zahl(werte.get("Erwartungswert (R pro Trade)")),
    maxDrawdownR: zahl(werte.get("Max Drawdown (R)")),
    skips: zahl(werte.get("Skips (nicht gewertet)")),
  };
}
