// Kontrollwerte für die Journal-Kennzahlen.
// Aufruf:  npx -y tsx tools/checks/journal-kennzahlen.mts
import {
  computeJournalStats, equityKurve, signiertesR, gruppiere, berechneKontostaende,
  type Trade, type Konto, type KontoBuchung,
} from "../../src/lib/trading/journal";
import { sortiereNachDringlichkeit, zaehleStatus, baueHeatmap, rankingPairBias,
  type ScreenerPair } from "../../src/lib/supabase/trading";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const t = (p: Partial<Trade>): Trade => ({
  id: Math.random().toString(36).slice(2), type: "ek", pair: "EURUSD", direction: "long",
  date: "2026-08-10", result: "win", rMultiple: 2, riskPercent: null, profitAmount: null,
  entryPrice: null, exitPrice: null, stopLoss: null, takeProfit: null, lotSize: null,
  sessionType: "backtest", session: "London", notes: "", comment: "",
  strategyId: null, outlookId: null,
  setups: { dailyBos: false, valueArea: false, marketStructure: false, weeklyGva: false, dreiTagesGva: false },
  confluences: [], adherenceScore: null, createdAt: "2026-08-10T08:00:00Z", ...p,
});

// --- signiertesR: Betrag-Konvention -----------------------------------------
check("Gewinn +2R", signiertesR(t({ result: "win", rMultiple: 2 })), 2);
check("Verlust als -1 gespeichert zaehlt -1", signiertesR(t({ result: "loss", rMultiple: -1 })), -1);
check("Verlust als +1 gespeichert zaehlt auch -1", signiertesR(t({ result: "loss", rMultiple: 1 })), -1);
check("Verlust ohne R zaehlt -1", signiertesR(t({ result: "loss", rMultiple: 0 })), -1);
check("Breakeven zaehlt 0", signiertesR(t({ result: "breakeven", rMultiple: 5 })), 0);
check("offener Trade zaehlt 0", signiertesR(t({ result: null })), 0);

// --- computeJournalStats -----------------------------------------------------
const menge = [
  t({ date: "2026-08-03", result: "win",  rMultiple: 2 }),
  t({ date: "2026-08-04", result: "win",  rMultiple: 3 }),
  t({ date: "2026-08-05", result: "loss", rMultiple: 1 }),
  t({ date: "2026-08-06", result: "loss", rMultiple: 1 }),
  t({ date: "2026-08-07", result: "breakeven", rMultiple: 0 }),
  t({ date: "2026-08-08", result: null }),           // offen -> zaehlt nirgends
];
const s = computeJournalStats(menge);
check("n zaehlt nur abgeschlossene", s.n, 5);
check("wins/losses/be", [s.wins, s.losses, s.breakeven], [2, 2, 1]);
check("Winrate ohne Breakeven im Nenner", s.winrate, 50);
check("Profit Factor 5/2", s.profitFactor, 2.5);
check("Gesamt-R", s.gesamtR, 3);
check("Expectancy = 3/5", s.expectancy, 0.6);
check("beste Serie", s.besteSerie, 2);
check("schlechteste Serie", s.schlechtesteSerie, 2);

// Drawdown: +2, +5, +4, +3 -> Hoch 5, Tief danach 3
check("max Drawdown", s.maxDrawdownR, 2);

// Leere Menge darf nicht durch Null teilen
const leer = computeJournalStats([]);
check("leer: winrate null", leer.winrate, null);
check("leer: profitFactor null", leer.profitFactor, null);
check("leer: expectancy null", leer.expectancy, null);

// Nur Gewinne -> kein Verlust -> Profit Factor null statt Unendlich
check("nur Gewinne: PF null", computeJournalStats([t({ result: "win", rMultiple: 1 })]).profitFactor, null);

// --- equityKurve -------------------------------------------------------------
const kurve = equityKurve(menge);
check("Kurve laesst offene Trades weg", kurve.length, 5);
check("Kurve ist chronologisch", kurve.map((p) => p.date),
  ["2026-08-03","2026-08-04","2026-08-05","2026-08-06","2026-08-07"]);
check("kumuliert", kurve.map((p) => p.kumuliert), [2, 5, 4, 3, 3]);

// --- gruppiere ---------------------------------------------------------------
const g = gruppiere([
  t({ pair: "EURUSD", result: "win", rMultiple: 1 }),
  t({ pair: "EURUSD", result: "loss", rMultiple: 1 }),
  t({ pair: "GBPUSD", result: "win", rMultiple: 2 }),
], (x) => x.pair);
check("Gruppen nach Anzahl sortiert", g.map((x) => x.key), ["EURUSD", "GBPUSD"]);
check("Gruppe EURUSD ausgeglichen", g[0].stats.gesamtR, 0);

// --- Screener-Ableitungen ----------------------------------------------------
const sp = (p: Partial<ScreenerPair>): ScreenerPair => ({
  pair: "EURUSD", near: null, price: 1.1, short: null, long: null,
  short_tf: null, long_tf: null, status: "NEUTRAL", distance: null,
  stale: false, pending: false, ...p,
});

const board = [
  sp({ pair: "AUDJPY", status: "NEUTRAL", distance: 5 }),
  sp({ pair: "EURUSD", status: "PREPARE", distance: 80 }),
  sp({ pair: "GBPUSD", status: "PREPARE", distance: 20 }),
  sp({ pair: "USDCAD", status: "HIT", distance: 0 }),
  sp({ pair: "NZDCHF", status: "PREPARE", distance: null }),
];
check("Dringlichkeit: Hit zuerst, dann naechster Abstand",
  sortiereNachDringlichkeit(board).map((p) => p.pair),
  ["USDCAD", "GBPUSD", "EURUSD", "NZDCHF", "AUDJPY"]);
check("Statuszaehlung", zaehleStatus(board), { hit: 1, prepare: 3, neutral: 1, stale: 0 });

// --- Pair-Bias: nur die Extreme geben Richtung -------------------------------
check("Q5 gegen Q1 -> Long", rankingPairBias(5, 1), "LONG");
check("Q1 gegen Q5 -> Short", rankingPairBias(1, 5), "SHORT");
check("beide Q5 -> neutral", rankingPairBias(5, 5), "NEUTRAL");
check("beide Q1 -> neutral", rankingPairBias(1, 1), "NEUTRAL");
check("Q3 gegen Q3 -> neutral", rankingPairBias(3, 3), "NEUTRAL");
check("Q5 gegen Q3 -> Long", rankingPairBias(5, 3), "LONG");
check("Q3 gegen Q5 -> Short", rankingPairBias(3, 5), "SHORT");

// --- Heatmap -----------------------------------------------------------------
const raster = baueHeatmap([sp({ pair: "EURUSD", status: "HIT" })],
  [{ ccy: "EUR", score: 1, strength_quintile: 5 }, { ccy: "USD", score: -1, strength_quintile: 1 }]);
check("Raster ist 8x8", [raster.length, raster[0].length], [8, 8]);
check("Diagonale leer", raster[0][0].pair, "");
const eurusd = raster.flat().find((z) => z.base === "EUR" && z.quote === "USD")!;
check("EURUSD gefunden", eurusd.daten?.status, "HIT");
check("EURUSD Ranking Long", eurusd.rankingSeite, "LONG");
const usdeur = raster.flat().find((z) => z.base === "USD" && z.quote === "EUR")!;
check("Gegenzelle zeigt dasselbe Paar", usdeur.daten?.pair, "EURUSD");
check("Gegenzelle Ranking gespiegelt", usdeur.rankingSeite, "SHORT");

// --- Kontostand -------------------------------------------------------------
const konto = (p: Partial<Konto>): Konto => ({
  id: "k1", name: "FTMO", type: "funded", broker: "FTMO", currency: "USD",
  initialBalance: 100000, currentBalance: 100000, defaultRiskPerTrade: 1,
  isActive: true, isDefault: true, ...p,
});
const bu = (p: Partial<KontoBuchung>): KontoBuchung => ({
  id: Math.random().toString(36).slice(2), accountId: "k1", type: "funded",
  buchungsTyp: "deposit", amount: 0, date: "2026-08-01", note: "", ...p,
});

const stand = berechneKontostaende(
  [konto({ currentBalance: 104000 })],
  [bu({ buchungsTyp: "deposit", amount: 5000 }),
   bu({ buchungsTyp: "withdrawal", amount: 2000 }),
   bu({ buchungsTyp: "payout", amount: 1000 })],
  [t({ sessionType: "live", type: "funded", result: "win", profitAmount: 2000 }),
   t({ sessionType: "live", type: "funded", result: "loss", profitAmount: -1000 }),
   t({ sessionType: "backtest", type: "funded", result: "win", profitAmount: 99999 })],
)[0];
// 100000 + 5000 - (2000+1000) + (2000-1000) = 103000
check("Kontostand gerechnet", stand.berechnet, 103000);
check("Einzahlungen", stand.einzahlungen, 5000);
check("Auszahlungen inkl. Payout", stand.auszahlungen, 3000);
check("Backtest zaehlt nicht mit", stand.handelsGewinn, 1000);
check("nur Live-Trades gezaehlt", stand.trades, 2);
check("Abweichung zum hinterlegten Stand", stand.abweichung, 1000);

// Betraege sind immer positiv zu lesen, egal wie sie gespeichert wurden
const negativ = berechneKontostaende(
  [konto({ initialBalance: 1000, currentBalance: 1000 })],
  [bu({ buchungsTyp: "withdrawal", amount: -500 })],
  [],
)[0];
check("negativ gespeicherte Auszahlung zaehlt als Abgang", negativ.berechnet, 500);

// Buchung ohne Konto-Zuordnung faellt auf den Kontotyp zurueck
const ohneKonto = berechneKontostaende(
  [konto({ initialBalance: 0, currentBalance: 0 })],
  [bu({ accountId: null, type: "funded", buchungsTyp: "deposit", amount: 700 })],
  [],
)[0];
check("Buchung ohne Konto-ID ueber den Typ zugeordnet", ohneKonto.berechnet, 700);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
