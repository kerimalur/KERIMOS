import "server-only";
import { createTradingClient } from "@/lib/supabase/trading";
import { addDays } from "@/lib/time";
import type {
  BacktestCategory, BacktestCategoryKey, BacktestSession, BacktestTag,
  ChecklistPunkt, NativeBacktestTrade, TradeTag,
} from "@/lib/backtest-types";

/**
 * Natives Backtest-Journal — ersetzt das Google Sheet als Quelle.
 *
 * Kategorien (GVA-Typ, Confluence, Anmerkung, Skip-Grund) entsprechen den
 * Spalten aus dem alten Sheet, sind hier aber Tabellenzeilen statt Code:
 * Kerim kann Tags selbst anlegen, umbenennen und archivieren (siehe
 * backtest-actions.ts), ohne dass jemand Code anfassen muss.
 *
 * Migrierte Historie (18 Trades, Stand Sheet "Backtest GVA / BOS", Tab
 * "Trades") liegt bereits in backtest_trades/backtest_trade_tags. Zwei
 * Dateninkonsistenzen aus dem Sheet wurden dabei korrigiert und stehen als
 * Notiz am jeweiligen Trade: ein leeres Datum (auf den 01.05.2021 geschätzt)
 * und ein Jahres-Tippfehler (28.02.2002 → 28.02.2022, klar aus der
 * Reihenfolge der Nr. ableitbar).
 *
 * Reine Typen und die Rechenlogik (Stats, Breakdown) liegen bewusst in
 * lib/backtest-types.ts statt hier - diese Datei ist "server-only" und darf
 * nicht in Client-Komponenten importiert werden.
 */

/** Kategorien inkl. ihrer Tags, sortiert. `includeArchived` nur für die Verwaltung. */
export async function fetchBacktestCategories(
  includeArchived = false,
): Promise<BacktestCategory[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("backtest_categories")
    .select("id, key, label, allow_multiple, sort_order, backtest_tags(id, label, sort_order, archived)")
    .order("sort_order");

  return (data ?? []).map((c) => ({
    id: c.id as string,
    key: c.key as BacktestCategoryKey,
    label: c.label as string,
    allow_multiple: c.allow_multiple as boolean,
    tags: ((c.backtest_tags ?? []) as BacktestTag[])
      .filter((t) => includeArchived || !t.archived)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}

interface TradeRow {
  id: string;
  occurred_on: string;
  pair: string;
  direction: string;
  result: string;
  r_multiple: number | string | null;
  rr_geplant: number | string | null;
  notiz: string | null;
  tradingview_link: string | null;
  screenshot_url: string | null;
  session_id: string | null;
  backtest_trade_tags: {
    backtest_tags: { id: string; label: string; backtest_categories: { key: string } | null } | null;
  }[] | null;
}

/** Alle Trades inkl. verknüpfter Tags und Session, neuestes Datum zuerst. */
export async function fetchNativeBacktestTrades(): Promise<NativeBacktestTrade[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("backtest_trades")
    .select(
      "id, occurred_on, pair, direction, result, r_multiple, rr_geplant, notiz, " +
      "tradingview_link, screenshot_url, session_id, " +
      "backtest_trade_tags(backtest_tags(id, label, backtest_categories(key)))"
    )
    .order("occurred_on", { ascending: false });

  return ((data ?? []) as unknown as TradeRow[]).map((t) => ({
    id: t.id,
    occurred_on: t.occurred_on,
    pair: t.pair,
    direction: t.direction as NativeBacktestTrade["direction"],
    result: t.result as NativeBacktestTrade["result"],
    r_multiple: t.r_multiple === null ? null : Number(t.r_multiple),
    rr_geplant: t.rr_geplant === null ? null : Number(t.rr_geplant),
    notiz: t.notiz,
    tradingview_link: t.tradingview_link,
    screenshot_url: t.screenshot_url,
    session_id: t.session_id,
    tags: (t.backtest_trade_tags ?? [])
      .map((tt) => tt.backtest_tags)
      .filter((tag): tag is NonNullable<typeof tag> => tag !== null)
      .map((tag): TradeTag => ({
        tagId: tag.id,
        label: tag.label,
        categoryKey: (tag.backtest_categories?.key ?? "") as TradeTag["categoryKey"],
      })),
  }));
}

/**
 * Punkte der Vor-dem-Trade-Checkliste.
 *
 * Fehlt die Tabelle noch, kommt eine leere Liste zurück statt eines
 * Fehlers - das Journal bleibt dann ohne Checkliste benutzbar.
 */
export async function fetchChecklist(includeArchived = false): Promise<ChecklistPunkt[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("backtest_checklist")
    .select("id, label, sort_order, archived")
    .order("sort_order");

  return ((data ?? []) as ChecklistPunkt[])
    .filter((p) => includeArchived || !p.archived);
}

/** Sessions, neueste zuerst. */
export async function fetchBacktestSessions(): Promise<BacktestSession[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("backtest_journal_sessions")
    .select("id, pair, status, created_at, closed_at")
    .order("created_at", { ascending: false });

  return (data ?? []) as BacktestSession[];
}

/**
 * Wochenzahl für das Zielwidget: ALLE Trades (auch Skips), erfasst
 * (created_at) zwischen von/bis, beide inklusiv.
 *
 * Skips zählen bewusst mit: die Roadmap-Quote von 24 Trades/Woche misst
 * Bearbeitungsvolumen (wie viele Setups diese Woche durchgespielt wurden),
 * nicht Trefferquote - ein Skip ist genauso viel Arbeit wie ein gewerteter
 * Trade. Winrate/Profit Factor/Expectancy bleiben trotzdem nur unter den
 * gewerteten Trades berechnet (computeNativeBacktestStats), das ist eine
 * andere Frage als die Wochenquote.
 *
 * Bewusst created_at statt occurred_on: occurred_on ist das historische
 * Datum des GVA/BOS-Setups (oft Jahre zurück) - die Wochenquote misst aber,
 * wie viel Backtest-Arbeit diese Woche passiert ist, nicht wann die Setups
 * historisch stattfanden.
 */
export async function fetchWeeklyNativeBacktestCount(
  von: string, bis: string,
): Promise<number | null> {
  const supabase = createTradingClient();
  if (!supabase) return null;

  const { count } = await supabase
    .from("backtest_trades")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${von}T00:00:00Z`)
    .lt("created_at", `${addDays(bis, 1)}T00:00:00Z`);

  return count ?? 0;
}

/** Gesamtzahl aller Trades (auch Skips) - für /ziele und die Dashboard-Kachel. */
export async function fetchTotalNativeBacktestCount(): Promise<number | null> {
  const supabase = createTradingClient();
  if (!supabase) return null;

  const { count } = await supabase
    .from("backtest_trades")
    .select("id", { count: "exact", head: true });

  return count ?? 0;
}

/** Winrate über alle gewerteten Trades - für die Dashboard-Kachel. */
export async function fetchNativeBacktestWinrate(): Promise<number | null> {
  const supabase = createTradingClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("backtest_trades")
    .select("r_multiple")
    .neq("result", "skip");
  if (!data || data.length === 0) return null;

  const wins = data.filter((t) => Number(t.r_multiple ?? 0) > 0).length;
  return (wins / data.length) * 100;
}
