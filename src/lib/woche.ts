import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createGymClient, gymConfigured } from "@/lib/supabase/gym";
import { tradingConfigured, WEEKLY_BACKTEST_ZIEL } from "@/lib/supabase/trading";
import { fetchWeeklyNativeBacktestCount } from "@/lib/supabase/backtest";
import { ladeWochenziele, type Wochenziel } from "@/lib/wochenziele";
import { addDays, heuteISO } from "@/lib/time";
import {
  istHabitArt, type HabitArt, type VorhabenStatus,
} from "@/lib/woche-typen";

/**
 * Der Bereich „Woche" — was Kerim sowieso macht, nur zum Abhaken.
 *
 * Seit 21.09.2026 ersetzt er Gym und Zeit. Die Idee ist bewusst klein: ein
 * Tipp pro Einheit, keine Dauer, keine Sätze, keine Statistik-Seiten. Die
 * Software soll zeigen, ob die Woche läuft — nicht selbst zur Arbeit werden.
 *
 * Datenquellen:
 *   habit_log            Push, Pull, Ausdauer (KerimOS-DB)
 *   essen_check          Plan eingehalten ja/nein + was das Problem war (KerimOS-DB)
 *   vorhaben             Woran arbeite ich, wenn ich freie Zeit habe (KerimOS-DB)
 *   weekly_goals         Wochenziele (KerimOS-DB, bestand schon)
 *   body_weight_entries  Gewicht (Gym-DB — dort liegt der ganze Verlauf)
 *   backtest_trades      Backtest-Zähler (Trading-DB, zählt sich selbst)
 */

export interface HabitEintrag {
  id: string;
  datum: string;
  art: HabitArt;
}

export interface EssenCheck {
  datum: string;
  eingehalten: boolean;
  problem: string | null;
}

export interface Gewicht {
  datum: string;
  kg: number;
}

export interface Vorhaben {
  id: string;
  titel: string;
  naechsterSchritt: string | null;
  status: VorhabenStatus;
  erledigtAm: string | null;
}

export interface WochenDaten {
  weekStart: string;
  tage: string[];
  heute: string;
  habits: HabitEintrag[];
  kraft: number;
  ausdauer: number;
  backtest: { current: number; target: number } | null;
  essen: EssenCheck[];
  gewichte: Gewicht[];
  vorhaben: Vorhaben[];
  ziele: Wochenziel[];
  /** Tabellen fehlen noch (Migration nicht gelaufen) — Seite zeigt Hinweis. */
  tabelleFehlt: boolean;
}

/** Die Zahlen für die Startkachel. Günstiger als die ganze Woche. */
export interface WochenPuls {
  kraft: number;
  ausdauer: number;
  backtest: number | null;
  essenOk: number;
  essenErfasst: number;
  zieleOffen: number;
  zieleGesamt: number;
}

const zeilen = <T,>(d: unknown) => ((d ?? []) as T[]);

async function ladeGewichte(): Promise<Gewicht[]> {
  if (!gymConfigured()) return [];
  const gym = createGymClient();
  if (!gym) return [];
  const { data } = await gym.from("body_weight_entries")
    .select("entry_date, weight_kg")
    .not("weight_kg", "is", null)
    .order("entry_date", { ascending: false })
    .limit(12);
  return zeilen<{ entry_date: string; weight_kg: number }>(data)
    .map((r) => ({ datum: String(r.entry_date), kg: Number(r.weight_kg) }));
}

export async function ladeWoche(weekStart: string): Promise<WochenDaten> {
  const supabase = await createClient();
  const ende = addDays(weekStart, 6);
  const heute = heuteISO();
  const bisBacktest = ende < heute ? ende : heute;

  const [habitRes, essenRes, vorhabenRes, gewichte, backtest, ziele] = await Promise.all([
    supabase.from("habit_log").select("id, datum, art")
      .gte("datum", weekStart).lte("datum", ende)
      .order("datum").order("created_at"),
    supabase.from("essen_check").select("datum, eingehalten, problem")
      .gte("datum", weekStart).lte("datum", ende).order("datum"),
    supabase.from("vorhaben").select("id, titel, naechster_schritt, status, erledigt_am")
      .order("sort_order").order("created_at"),
    ladeGewichte(),
    tradingConfigured() ? fetchWeeklyNativeBacktestCount(weekStart, bisBacktest) : null,
    ladeWochenziele(weekStart),
  ]);

  // 42P01 = Tabelle fehlt. Dann zeigt die Seite, was zu tun ist, statt leer.
  const tabelleFehlt = [habitRes, essenRes, vorhabenRes]
    .some((r) => r.error?.code === "42P01");

  const habits = zeilen<{ id: string; datum: string; art: string }>(habitRes.data)
    .filter((h) => istHabitArt(h.art))
    .map((h) => ({ id: h.id, datum: String(h.datum), art: h.art as HabitArt }));

  return {
    weekStart,
    tage: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    heute,
    habits,
    kraft: habits.filter((h) => h.art !== "ausdauer").length,
    ausdauer: habits.filter((h) => h.art === "ausdauer").length,
    backtest: backtest === null ? null : { current: backtest, target: WEEKLY_BACKTEST_ZIEL },
    essen: zeilen<{ datum: string; eingehalten: boolean; problem: string | null }>(essenRes.data)
      .map((e) => ({ datum: String(e.datum), eingehalten: !!e.eingehalten, problem: e.problem })),
    gewichte,
    vorhaben: zeilen<{
      id: string; titel: string; naechster_schritt: string | null;
      status: string; erledigt_am: string | null;
    }>(vorhabenRes.data).map((v) => ({
      id: v.id,
      titel: v.titel,
      naechsterSchritt: v.naechster_schritt,
      status: (["aktiv", "idee", "erledigt"].includes(v.status)
        ? v.status : "idee") as VorhabenStatus,
      erledigtAm: v.erledigt_am,
    })),
    ziele: ziele.ziele,
    tabelleFehlt,
  };
}

export async function ladeWochenPuls(weekStart: string): Promise<WochenPuls> {
  const supabase = await createClient();
  const ende = addDays(weekStart, 6);
  const heute = heuteISO();

  const [habitRes, essenRes, backtest, ziele] = await Promise.all([
    supabase.from("habit_log").select("art").gte("datum", weekStart).lte("datum", ende),
    supabase.from("essen_check").select("eingehalten").gte("datum", weekStart).lte("datum", ende),
    tradingConfigured() ? fetchWeeklyNativeBacktestCount(weekStart, heute) : null,
    ladeWochenziele(weekStart),
  ]);

  const arten = zeilen<{ art: string }>(habitRes.data).map((h) => h.art);
  const essen = zeilen<{ eingehalten: boolean }>(essenRes.data);

  return {
    kraft: arten.filter((a) => a === "push" || a === "pull").length,
    ausdauer: arten.filter((a) => a === "ausdauer").length,
    backtest,
    essenOk: essen.filter((e) => e.eingehalten).length,
    essenErfasst: essen.length,
    zieleOffen: ziele.ziele.filter((z) => !z.erledigtAm).length,
    zieleGesamt: ziele.ziele.length,
  };
}
