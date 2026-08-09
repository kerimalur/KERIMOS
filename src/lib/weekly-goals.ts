import "server-only";
import { weekStart as toWeekStart, addDays, heuteISO } from "@/lib/time";
import {
  gymConfigured, fetchWeeklyGoal, countWeeklyTrainingBreakdown, fetchTodaySteps,
} from "@/lib/supabase/gym";
import {
  tradingConfigured, fetchWeeklyBacktestCount, WEEKLY_BACKTEST_ZIEL,
} from "@/lib/supabase/trading";

/**
 * Wochenpuls für die Startseite: die drei Zahlen, an denen sich die Woche
 * gerade misst - Backtest-Trades, Gym (Kraft + Ausdauer getrennt, weil das
 * zwei unterschiedliche Wochenziele sind) und die heutigen Schritte.
 *
 * Jede Quelle ist unabhängig: fehlt eine Datenbank oder ein Wert, wird nur
 * dieser Teil weggelassen statt die ganze Karte zu verstecken.
 */
export interface WeeklyGoals {
  trades: { current: number; target: number } | null;
  gym: { kraft: number; kraftZiel: number; ausdauer: number; ausdauerZiel: number } | null;
  steps: { current: number; ziel: number | null } | null;
}

export async function fetchWeeklyGoals(): Promise<WeeklyGoals> {
  const heute = heuteISO();
  const wochenstart = toWeekStart(heute);
  const wochenendeExkl = addDays(wochenstart, 7);

  const [trades, gymZiel, gymBreakdown, steps] = await Promise.all([
    tradingConfigured() ? fetchWeeklyBacktestCount(wochenstart, wochenendeExkl) : null,
    gymConfigured() ? fetchWeeklyGoal() : null,
    gymConfigured() ? countWeeklyTrainingBreakdown(wochenstart) : null,
    gymConfigured() ? fetchTodaySteps(heute) : null,
  ]);

  return {
    trades: trades === null ? null : { current: trades, target: WEEKLY_BACKTEST_ZIEL },
    gym: gymBreakdown === null ? null : {
      kraft: gymBreakdown.kraft, kraftZiel: gymZiel ?? 4,
      ausdauer: gymBreakdown.ausdauer, ausdauerZiel: 1,
    },
    // Schritte erst zeigen, wenn die Uhr für heute schon synchronisiert hat -
    // "0 von X" um 6 Uhr morgens wäre technisch korrekt, aber demotivierend
    // und ohne Aussage.
    steps: steps?.schritte ? { current: steps.schritte, ziel: steps.ziel } : null,
  };
}
