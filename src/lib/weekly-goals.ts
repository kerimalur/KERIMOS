import "server-only";
import { weekStart as toWeekStart, heuteISO } from "@/lib/time";
import { gymConfigured, fetchWeeklySteps } from "@/lib/supabase/gym";
import { tradingConfigured, WEEKLY_BACKTEST_ZIEL } from "@/lib/supabase/trading";
import { fetchWeeklyNativeBacktestCount } from "@/lib/supabase/backtest";

/**
 * Wochenpuls für die Startseite: die Zahlen, an denen sich die Woche gerade
 * misst - manuelle Backtest-Trades und Schritte.
 *
 * Kraft und Ausdauer standen hier früher als getrennte Wochenziele. Wie oft
 * Kerim trainiert hat, zählt jetzt der Habit-Tracker; eine zweite Zählung
 * daneben wäre eine Quelle zu viel.
 *
 * Jede Quelle ist unabhängig: fehlt eine Datenbank oder ein Wert, wird nur
 * dieser Teil weggelassen statt die ganze Karte zu verstecken.
 */
export interface WeeklyGoals {
  trades: { current: number; target: number } | null;
  steps: { current: number; ziel: number } | null;
}

export async function fetchWeeklyGoals(): Promise<WeeklyGoals> {
  const heute = heuteISO();
  const wochenstart = toWeekStart(heute);

  const [trades, steps] = await Promise.all([
    tradingConfigured() ? fetchWeeklyNativeBacktestCount(wochenstart, heute) : null,
    gymConfigured() ? fetchWeeklySteps(wochenstart, heute) : null,
  ]);

  return {
    trades: trades === null ? null : { current: trades, target: WEEKLY_BACKTEST_ZIEL },
    steps: steps === null ? null : { current: steps.total, ziel: steps.ziel },
  };
}
