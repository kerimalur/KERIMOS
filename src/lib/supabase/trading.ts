import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Zugang zur Trading-Datenbank (Journal + GVA-Screener teilen sich ein Projekt).
 *
 * Wie beim Gym: eigene Datenbank, eigene Anmeldung — KerimOS liest serverseitig
 * mit eigenem Schlüssel. Nur in Server Components / Server Actions verwenden;
 * die Variablen tragen bewusst kein NEXT_PUBLIC_.
 */
export function createTradingClient() {
  const url = process.env.TRADING_SUPABASE_URL;
  const key = process.env.TRADING_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function tradingConfigured(): boolean {
  return Boolean(
    process.env.TRADING_SUPABASE_URL && process.env.TRADING_SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Roadmap-Schritt 2: 200 dokumentierte Backtest-Trades. */
export const BACKTEST_ZIEL = 200;

/** Ein Trade innerhalb von backtest_sessions.trades (jsonb-Array). */
export interface BacktestTrade {
  date: string;
  pair: string;
  direction: string;
  result: string; // "win" | "loss" | ggf. "be"
  rMultiple: number | null;
}

export interface BacktestSessionRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  trades: BacktestTrade[] | null;
  stats: { config?: { pair?: string; defaultRR?: number; strategy?: string } } | null;
}

export interface BacktestStats {
  n: number;
  wins: number;
  losses: number;
  /** 0-100, null wenn keine abgeschlossenen Trades. */
  winrate: number | null;
  /** Bruttogewinn / Bruttoverlust in R. Null ohne Verlusttrade. */
  profitFactor: number | null;
  /** Ø signiertes R pro Trade. */
  expectancy: number | null;
}

/**
 * Kennzahlen über eine Trade-Liste. rMultiple wird defensiv interpretiert:
 * Gewinne zählen +|R|, Verluste -|R| (Fallback -1R, wenn kein Wert erfasst) —
 * so stimmt die Rechnung unabhängig davon, ob das Journal Verluste mit
 * negativem oder positivem R speichert.
 */
export function computeBacktestStats(trades: BacktestTrade[]): BacktestStats {
  let wins = 0, losses = 0, grossWin = 0, grossLoss = 0, sumR = 0, n = 0;

  for (const t of trades) {
    const r = Math.abs(Number(t.rMultiple ?? 0));
    if (t.result === "win") {
      wins++; n++;
      grossWin += r; sumR += r;
    } else if (t.result === "loss") {
      losses++; n++;
      const loss = r || 1;
      grossLoss += loss; sumR -= loss;
    } else if (t.result === "be") {
      n++;
    }
  }

  return {
    n, wins, losses,
    winrate: n > 0 ? (wins / n) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: n > 0 ? sumR / n : null,
  };
}

/** Eine Zeile aus signals: vom Screener aufgezeichneter GVA-Hit. */
export interface GvaSignal {
  id: string;
  pair: string;
  line_type: string; // "long" | "short"
  line_level: number;
  status: string; // "new" | "dismissed" | ...
  hit_at: string;
}

/** Ein Termin aus calendar_events (Wirtschaftskalender der Trading-DB). */
export interface EconEvent {
  title: string;
  currency: string | null;
  event_time: string;
  impact: string; // High | Medium | Low | Holiday
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

/** High-Impact-Termine von heute. Leer, wenn nichts ansteht oder DB fehlt. */
export async function fetchTodayEvents(): Promise<EconEvent[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);

  const { data } = await supabase.from("calendar_events")
    .select("title, currency, event_time, impact, forecast, previous, actual")
    .gte("event_time", start.toISOString())
    .lte("event_time", end.toISOString())
    .eq("impact", "High")
    .order("event_time");
  return (data ?? []) as EconEvent[];
}

/** High-Impact-Termine der laufenden Woche (Mo-So). */
export async function fetchWeekEvents(): Promise<EconEvent[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const start = new Date();
  const offset = (start.getDay() + 6) % 7; // Montag = 0
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const { data } = await supabase.from("calendar_events")
    .select("title, currency, event_time, impact, forecast, previous, actual")
    .gte("event_time", start.toISOString())
    .lte("event_time", end.toISOString())
    .eq("impact", "High")
    .order("event_time");
  return (data ?? []) as EconEvent[];
}

// ---------------------------------------------------------------------------
// GVA-Screener Live-API (FastAPI auf Render)
// ---------------------------------------------------------------------------

export interface ScreenerPair {
  pair: string;
  near: "LONG" | "SHORT" | null;
  price: number | null;
  short: number | null;
  long: number | null;
  status: "HIT" | "PREPARE" | "NEUTRAL";
  /** Pips bis zur nächsten Line. PREPARE = innerhalb von 100 Pips. */
  distance: number | null;
  /** True = Preis vom Tagesschluss, nicht live. */
  stale: boolean;
  pending: boolean;
}

export interface ScreenerSnapshot {
  data: ScreenerPair[];
  updated: number | null; // Unix-Sekunden
  live: boolean;
  zones_complete_run: boolean;
}

/**
 * Live-Board vom Screener-Backend. Null bei Timeout/Fehler — das Backend auf
 * Render schläft nach Inaktivität und braucht beim Aufwachen bis zu einer
 * Minute; die Seite zeigt das dann als Hinweis statt zu blockieren.
 */
export async function fetchScreener(): Promise<ScreenerSnapshot | null> {
  const base = (process.env.GVA_API_URL ?? "https://gva-screener.onrender.com")
    .replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/screener`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ScreenerSnapshot;
  } catch {
    return null;
  }
}
