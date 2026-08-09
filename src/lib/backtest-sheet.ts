import "server-only";

/**
 * Backtest-Stand aus Kerims altem Google Sheet.
 *
 * Abgelöst durch das native Backtest-Journal (lib/supabase/backtest.ts) als
 * Quelle der Wahrheit - diese Datei bleibt nur als Fallback/Referenz stehen,
 * falls das Sheet nochmal gebraucht wird. Nichts im Code ruft aktuell noch
 * fetchBacktestStand() auf.
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
