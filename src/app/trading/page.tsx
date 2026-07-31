import Link from "next/link";
import {
  createTradingClient, tradingConfigured, computeBacktestStats, fetchScreener,
  fetchWeekEvents, fetchRanking, checkFundamental, pairTf, tfLabel, BACKTEST_ZIEL,
  type BacktestSessionRow, type BacktestTrade, type EconEvent,
  type GvaSignal, type ScreenerPair, type RankingCurrency,
} from "@/lib/supabase/trading";
import { Card, CardTitle, Stat, Badge, Empty } from "@/components/ui";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const SIDE_TONE: Record<string, "good" | "bad"> = { LONG: "good", SHORT: "bad" };

/** Timeframe der GVA: 3D-Chart oder Wochenchart. */
function TfBadge({ p }: { p: ScreenerPair }) {
  const tf = pairTf(p);
  if (!tf) return null;
  return (
    <Badge tone={tf === "W" ? "warn" : "neutral"}>
      {tfLabel(tf)}
    </Badge>
  );
}

/**
 * Passt die GVA-Richtung zum Wochen-Ranking? Q5/Q1-Regel, identisch zum
 * Screener. "unbekannt" wird nicht angezeigt — kein Badge ist ehrlicher als
 * ein Badge, das nur bedeutet "keine Daten".
 */
function FundamentalBadge({
  pair, side, ranking,
}: {
  pair: string;
  side: "LONG" | "SHORT" | null;
  ranking: RankingCurrency[];
}) {
  const f = checkFundamental(pair, side, ranking);
  if (f.urteil === "unbekannt") return null;

  const text =
    f.urteil === "bestaetigt" ? "fundamental bestätigt"
      : f.urteil === "dagegen" ? "gegen Fundamentals"
        : "fundamental neutral";
  const tone = f.urteil === "bestaetigt" ? "good" : f.urteil === "dagegen" ? "bad" : "neutral";

  return (
    <Badge tone={tone} title={f.grund || `${f.baseCode} Q${f.baseQ} · ${f.quoteCode} Q${f.quoteQ}`}>
      {text}
      {f.grund && <span className="ml-1 opacity-70">({f.grund})</span>}
    </Badge>
  );
}

function fmtUpdated(unix: number | null): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleTimeString("de-CH", {
    hour: "2-digit", minute: "2-digit",
  });
}

const CH_TIME = { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" } as const;

/** Wochen-News gruppiert nach Tag, heutiger Tag hervorgehoben. */
function WeekNews({ events }: { events: EconEvent[] }) {
  const heute = new Date().toDateString();
  const proTag = new Map<string, EconEvent[]>();
  for (const e of events) {
    const key = new Date(e.event_time).toDateString();
    const list = proTag.get(key) ?? [];
    list.push(e);
    proTag.set(key, list);
  }

  return (
    <Card>
      <CardTitle>High-Impact-News diese Woche</CardTitle>
      {events.length === 0 ? (
        <Empty>Diese Woche stehen keine High-Impact-Termine an.</Empty>
      ) : (
        <div className="space-y-2.5">
          {[...proTag.entries()].map(([tag, list]) => {
            const istHeute = tag === heute;
            const vorbei = new Date(list[0].event_time).setHours(23, 59) < Date.now() && !istHeute;
            return (
              <div key={tag}
                className={istHeute
                  ? "rounded-xl border border-accent bg-accent-tint px-3 py-2.5"
                  : "px-3"}>
                <div className={istHeute
                  ? "mb-1.5 text-xs font-medium uppercase tracking-wide text-accent-soft"
                  : "mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted"}>
                  {new Date(list[0].event_time).toLocaleDateString("de-CH",
                    { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Zurich" })}
                  {istHeute && " · heute"}
                </div>
                <ul className="space-y-1">
                  {list.map((e, i) => {
                    const erledigt = new Date(e.event_time) < new Date();
                    return (
                      <li key={i} className={cxNews(erledigt, vorbei)}>
                        <span className="tabular font-medium">
                          {new Date(e.event_time).toLocaleTimeString("de-CH", CH_TIME)}
                        </span>
                        {e.currency && <span className="ml-1.5 font-medium">{e.currency}</span>}
                        <span className="ml-1.5">{e.title}</span>
                        {erledigt && e.actual && (
                          <span className="ml-1.5 text-ink-muted">
                            → {e.actual}{e.forecast ? ` (erw. ${e.forecast})` : ""}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function cxNews(erledigt: boolean, tagVorbei: boolean): string {
  if (tagVorbei || erledigt) return "text-xs text-ink-faint";
  return "text-xs text-ink-soft";
}

export default async function TradingPage() {
  const [screener, weekEvents, ranking, journal] = await Promise.all([
    fetchScreener(),
    fetchWeekEvents(),
    fetchRanking(),
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
          GVA-Board live vom Screener, Backtest-Fortschritt aus der Trading-Datenbank.
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
                      <TfBadge p={p} />
                      <FundamentalBadge pair={p.pair} side={p.near} ranking={ranking} />
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
                      <TfBadge p={p} />
                      <FundamentalBadge pair={p.pair} side={p.near} ranking={ranking} />
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
            <p className="text-xs text-ink-faint">
              „3D" / „Woche" = Chart, auf dem die GVA entstanden ist.
              {ranking.length > 0
                ? " Fundamentale Bewertung aus dem Währungsranking des Screeners (Q5/Q1 der Champion-Woche) — Q2–Q4 gelten als neutral."
                : " Währungsranking gerade nicht verfügbar, darum keine fundamentale Bewertung."}
            </p>
          </div>
        )}
      </Card>

      <WeekNews events={weekEvents} />

      {/* Backtest-Fortschritt */}
      {!tradingConfigured() ? (
        <Card>
          <CardTitle>Backtest &amp; News</CardTitle>
          <p className="text-sm text-ink-muted">
            Trading-Datenbank noch nicht verbunden — das ist dieselbe Supabase, die der
            GVA-Screener nutzt (dort liegen Backtests, Hit-Historie und der
            Wirtschaftskalender). In Vercel und{" "}
            <code className="rounded bg-sand px-1 py-0.5 text-xs">.env.local</code> setzen:{" "}
            <code className="rounded bg-sand px-1.5 py-0.5 text-xs">TRADING_SUPABASE_URL</code> und{" "}
            <code className="rounded bg-sand px-1.5 py-0.5 text-xs">TRADING_SUPABASE_SERVICE_ROLE_KEY</code>.
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
