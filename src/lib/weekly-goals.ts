import "server-only";
import { weekStart as toWeekStart, heuteISO } from "@/lib/time";
import {
  gymConfigured, fetchWeeklyGoal, countWeeklyTrainingBreakdown, fetchWeeklySteps,
} from "@/lib/supabase/gym";
import { tradingConfigured, WEEKLY_BACKTEST_ZIEL } from "@/lib/supabase/trading";
import { fetchWeeklyNativeBacktestCount } from "@/lib/supabase/backtest";

/**
 * Wochenpuls für die Startseite: die drei Zahlen, an denen sich die Woche
 * gerade misst - manuelle Backtest-Trades, Gym (Kraft + Ausdauer getrennt,
 * weil das zwei unterschiedliche Wochenziele sind) und Schritte.
 *
 * Jede Quelle ist unabhängig: fehlt eine Datenbank oder ein Wert, wird nur
 * dieser Teil weggelassen statt die ganze Karte zu verstecken.
 */
export interface WeeklyGoals {
  trades: { current: number; target: number } | null;
  gym: { kraft: number; kraftZiel: number; ausdauer: number; ausdauerZiel: number } | null;
  steps: { current: number; ziel: number } | null;
}

export async function fetchWeeklyGoals(): Promise<WeeklyGoals> {
  const heute = heuteISO();
  const wochenstart = toWeekStart(heute);

  const [trades, gymZiel, gymBreakdown, steps] = await Promise.all([
    tradingConfigured() ? fetchWeeklyNativeBacktestCount(wochenstart, heute) : null,
    gymConfigured() ? fetchWeeklyGoal() : null,
    gymConfigured() ? countWeeklyTrainingBreakdown(wochenstart) : null,
    gymConfigured() ? fetchWeeklySteps(wochenstart, heute) : null,
  ]);

  return {
    trades: trades === null ? null : { current: trades, target: WEEKLY_BACKTEST_ZIEL },
    gym: gymBreakdown === null ? null : {
      kraft: gymBreakdown.kraft, kraftZiel: gymZiel ?? 4,
      ausdauer: gymBreakdown.ausdauer, ausdauerZiel: 1,
    },
    steps: steps === null ? null : { current: steps.total, ziel: steps.ziel },
  };
}
