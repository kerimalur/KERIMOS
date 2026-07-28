import Link from "next/link";
import {
  createTradingClient, tradingConfigured, computeBacktestStats, fetchScreener,
  BACKTEST_ZIEL,
  type BacktestSessionRow, type BacktestTrade, type GvaSignal, type ScreenerPair,
} from "@/lib/supabase/trading";
import { Card, CardTitle, Stat, Badge, Empty } from "@/components/ui";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const SIDE_TONE: Record<string, "good" | "bad"> = { LONG: "good", SHORT: "bad" };

function fmtUpdated(unix: number | null): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleTimeString("de-CH", {
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function TradingPage() {
  const [screener, journal] = await Promise.all([
    fetchScreener(),
    (async () => {
      const supabase = createTradingClient();
      if (!supabase) return null;
      const [{ data: sessions }, { data: signals }] = await Promise.all([
        supabase.from("backtest_sessions")
          .select("id, name, status, created_at, trades, stats")
          .order("created_at", { ascending: false }),
        supabase.from("signals")
          .select("id, pair, line_type, line_level, status, hit_at")
          .order("hit_at", { ascending: false }).limit(8),
      ]);
      return {
        sessions: (sessions ?? []) as BacktestSessionRow[],
        signals: (signals ?? []) as GvaSignal[],
      };
    })(),
  ]);

  const sessions = journal?.sessions ?? [];
  const alleTrades: BacktestTrade[] = sessions.flatMap((s) => s.trades ?? []);
  const total = computeBacktestStats(alleTrades);

  const pairs = (screener?.data ?? []) as ScreenerPair[];
  const hits = pairs.filter((p) => p.status === "HIT");
  const prepares = pairs
    .filter((p) => p.status === "PREPARE")
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Trading</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          GVA-Board live vom Screener, Backtest-Fortschritt aus dem Journal.
          Roadmap-Schritt 2: {BACKTEST_ZIEL} dokumentierte Trades, bevor FTMO ein Thema ist.
        </p>
      </div>

      {/* GVA-Board */}
      <Card>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">GVA-Board</CardTitle>
          <span className="text-xs text-ink-muted">
            {screener
              ? `Stand ${fmtUpdated(screener.updated)}${screener.live ? "" : " · Tagesschluss-Preise"}`
              : ""}
          </span>
        </div>

        {!screener ? (
          <Empty>
            Screener nicht erreichbar — das Backend auf Render schläft nach
            Inaktivität und braucht beim Aufwachen bis zu einer Minute.
            Seite gleich nochmal laden.
          </Empty>
        ) : (
          <div className="space-y-4">
            {hits.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-bad">
                  GVA gehittet
                </div>
                <ul className="space-y-1.5">
                  {hits.map((p) => (
                    <li key={p.pair}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-bad-tint px-3 py-2 text-sm">
                      <span className="font-medium text-ink">{p.pair}</span>
                      {p.near && <Badge tone={SIDE_TONE[p.near] ?? "neutral"}>{p.near}</Badge>}
                      {p.pending && <Badge tone="warn">pending</Badge>}
                      <span className="ml-auto tabular text-xs text-ink-muted">
                        Level {p.near === "SHORT" ? p.short : p.long}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Innerhalb 100 Pips ({prepares.length})
              </div>
              {prepares.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Kein Paar in Reichweite — gerade nichts vorzubereiten.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {prepares.map((p) => (
                    <li key={p.pair}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-sand/60 px-3 py-2 text-sm">
                      <span className="font-medium text-ink">{p.pair}</span>
                      {p.near && <Badge tone={SIDE_TONE[p.near] ?? "neutral"}>{p.near}</Badge>}
                      <span className="ml-auto tabular text-xs text-ink-soft">
                        {p.stale ? "~" : ""}{p.distance} Pips
                      </span>
                      <span className="tabular text-xs text-ink-muted">
                        {p.price} → {p.near === "SHORT" ? p.short : p.long}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-xs text-ink-faint">
              {pairs.length - hits.length - prepares.length} weitere Paare neutral.
            </p>
          </div>
        )}
      </Card>

      {/* Backtest-Fortschritt */}
      {!tradingConfigured() ? (
        <Card>
          <CardTitle>Backtest &amp; Journal</CardTitle>
          <p className="text-sm text-ink-muted">
            Journal-Zugang noch nicht eingerichtet. In Vercel und{" "}
            <code className="rounded bg-sand px-1 py-0.5 text-xs">.env.local</code> setzen:{" "}
            <code className="rounded bg-sand px-1.5 py-0.5 text-xs">TRADING_SUPABASE_URL</code> und{" "}
            <code className="rounded bg-sand px-1.5 py-0.5 text-xs">TRADING_SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            — Werte aus dem Supabase-Projekt des Trading-Journals, gleiches Prinzip wie beim Gym.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Backtest-Trades" value={`${total.n} / ${BACKTEST_ZIEL}`}
                sub={`${Math.round((total.n / BACKTEST_ZIEL) * 100)} % des Fundaments`} />
              <Stat label="Winrate"
                value={total.winrate === null ? "—" : `${total.winrate.toFixed(0)} %`}
                sub={`${total.wins} W · ${total.losses} L`} />
              <Stat label="Profit Factor"
                tone={total.profitFactor !== null && total.profitFactor >= 1.5 ? "good" : "neutral"}
                value={total.profitFactor === null ? "—" : total.profitFactor.toFixed(2)} />
              <Stat label="Expectancy"
                tone={total.expectancy !== null && total.expectancy > 0 ? "good" : "neutral"}
                value={total.expectancy === null ? "—" : `${total.expectancy.toFixed(2)} R`}
                sub="Ø pro Trade" />
            </div>
          </Card>

          <Card>
            <CardTitle>Backtest-Sessions</CardTitle>
            {sessions.length === 0 ? (
              <Empty>Noch keine Sessions im Journal.</Empty>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => {
                  const st = computeBacktestStats(s.trades ?? []);
                  const cfg = s.stats?.config;
                  return (
                    <li key={s.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-sand/50 px-3 py-2 text-sm">
                      <span className="font-medium text-ink">{s.name}</span>
                      {cfg?.pair && <span className="text-xs text-ink-muted">{cfg.pair}</span>}
                      {cfg?.defaultRR && (
                        <span className="text-xs text-ink-muted">RR {cfg.defaultRR}</span>
                      )}
                      <span className="ml-auto tabular text-xs text-ink-soft">
                        {st.n} Trades
                        {st.winrate !== null && ` · ${st.winrate.toFixed(0)} % WR`}
                        {st.profitFactor !== null && ` · PF ${st.profitFactor.toFixed(2)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Letzte GVA-Hits (Screener-Historie)</CardTitle>
            {(journal?.signals ?? []).length === 0 ? (
              <Empty>Noch keine aufgezeichneten Hits.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {journal!.signals.map((sig) => (
                  <li key={sig.id}
                    className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-ink">{sig.pair}</span>
                    <Badge tone={sig.line_type === "long" ? "good" : "bad"}>
                      {sig.line_type.toUpperCase()}
                    </Badge>
                    <span className="tabular text-xs text-ink-muted">@ {sig.line_level}</span>
                    <span className="ml-auto text-xs text-ink-muted">
                      {dateLabel(sig.hit_at.slice(0, 10))}
                    </span>
                    {sig.status === "dismissed" && (
                      <span className="text-xs text-ink-faint">erledigt</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <p className="text-xs text-ink-muted">
        <Link href="https://gva-screener-kerim-alurs-projects.vercel.app" target="_blank"
          rel="noopener noreferrer" className="text-accent-soft hover:underline">
          Zum Screener ↗
        </Link>
      </p>
    </div>
  );
}
