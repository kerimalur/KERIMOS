import Link from "next/link";
import {
  createTradingClient, computeBacktestStats, fetchScreener, fetchTodayEvents,
  BACKTEST_ZIEL,
  type BacktestSessionRow, type ScreenerPair,
} from "@/lib/supabase/trading";
import { Card, Badge } from "@/components/ui";

const eventTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-CH", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich",
  });

/**
 * Kompakte Trading-Karte fürs Cockpit: GVA-Status (Hits + Paare in Reichweite)
 * und Backtest-Fortschritt. Server Component — Details auf /trading.
 */
export async function TradingCard() {
  const [screener, sessions, events] = await Promise.all([
    fetchScreener(),
    (async () => {
      const supabase = createTradingClient();
      if (!supabase) return null;
      const { data } = await supabase
        .from("backtest_sessions").select("id, trades");
      return (data ?? []) as Pick<BacktestSessionRow, "id" | "trades">[];
    })(),
    fetchTodayEvents(),
  ]);

  const pairs = (screener?.data ?? []) as ScreenerPair[];
  const hits = pairs.filter((p) => p.status === "HIT");
  const prepares = pairs
    .filter((p) => p.status === "PREPARE")
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));

  const stats = sessions
    ? computeBacktestStats(sessions.flatMap((s) => s.trades ?? []))
    : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/trading"
          className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted transition hover:text-ink-soft">
          Trading
        </Link>
        {stats && (
          <span className="tabular text-xs text-ink-muted">
            Backtest {stats.n}/{BACKTEST_ZIEL}
            {stats.winrate !== null && ` · ${stats.winrate.toFixed(0)} % WR`}
            {stats.profitFactor !== null && ` · PF ${stats.profitFactor.toFixed(2)}`}
          </span>
        )}
      </div>

      <div className="mt-3">
        {!screener ? (
          <p className="text-sm text-ink-muted">
            GVA-Screener startet gerade — Board in einer Minute wieder da.
          </p>
        ) : hits.length === 0 && prepares.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Kein GVA-Setup in Reichweite — alle {pairs.length} Paare neutral.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {hits.map((p) => (
              <Link key={p.pair} href="/trading"
                className="flex items-center gap-1.5 rounded-lg bg-bad-tint px-2.5 py-1.5 text-sm font-medium text-ink">
                {p.pair}
                <Badge tone={p.near === "LONG" ? "good" : "bad"}>
                  HIT {p.near ?? ""}
                </Badge>
              </Link>
            ))}
            {prepares.map((p) => (
              <Link key={p.pair} href="/trading"
                className="flex items-center gap-1.5 rounded-lg bg-sand/70 px-2.5 py-1.5 text-sm text-ink-soft">
                {p.pair}
                <span className="tabular text-xs text-ink-muted">
                  {p.stale ? "~" : ""}{p.distance} Pips {p.near?.toLowerCase()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Wirtschaftskalender: die High-Impact-Termine des Tages */}
      <div className="mt-3 border-t border-line/70 pt-2.5 text-xs">
        {events.length === 0 ? (
          <span className="text-ink-faint">Keine High-Impact-News heute.</span>
        ) : (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {events.map((e, i) => {
              const vorbei = new Date(e.event_time) < new Date();
              return (
                <span key={i}
                  className={vorbei ? "text-ink-faint line-through" : "text-ink-soft"}>
                  <span className="tabular font-medium">{eventTime(e.event_time)}</span>
                  {e.currency && <span className="ml-1 font-medium">{e.currency}</span>}
                  <span className="ml-1">{e.title}</span>
                  {vorbei && e.actual && <span className="ml-1">→ {e.actual}</span>}
                </span>
              );
            })}
          </span>
        )}
      </div>
    </Card>
  );
}
