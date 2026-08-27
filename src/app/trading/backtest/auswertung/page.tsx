import Link from "next/link";
import {
  fetchNativeBacktestTrades, fetchBacktestSessions, fetchBacktestCategories,
} from "@/lib/supabase/backtest";
import { tradingConfigured, BACKTEST_ZIEL } from "@/lib/supabase/trading";
import {
  computeNativeBacktestStats, computeBreakdown, computeInsights, computeEquityKurve,
  BREAKDOWN_DIMENSIONS, verlaufBilanz, type BreakdownDimension, type BreakdownRow,
  type NativeBacktestTrade,
} from "@/lib/backtest-types";
import { BacktestFilter } from "@/components/backtest-filter";
import { BacktestBreakdown } from "@/components/backtest-breakdown";
import { BacktestInsights } from "@/components/backtest-insights";
import { BacktestEquity } from "@/components/backtest-equity";
import { BacktestVerluste } from "@/components/backtest-verluste";
import { BacktestVerlauf } from "@/components/backtest-verlauf";
import { BacktestExport } from "@/components/backtest-export";
import { Card, CardTitle, Stat, Empty, Bar } from "@/components/ui";
import { heuteISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Auswertung über ALLE Sessions und Pairs hinweg.
 *
 * Sinnvoll, weil die Strategie über alle Pairs dieselbe ist (GVA/BOS) - das
 * Pair ist nur eine weitere Dimension, keine eigene Strategie. Genau deshalb
 * ist die pair-übergreifende Sicht die statistisch belastbarere: 200 Trades
 * über fünf Pairs sagen mehr über die Strategie aus als 40 über eines.
 */
export default async function GesamtauswertungPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Gesamtauswertung</CardTitle>
        <p className="text-sm text-ink-muted">Trading-Datenbank nicht verbunden.</p>
      </Card>
    );
  }

  const sp = await searchParams;
  const [alle, sessions, categories] = await Promise.all([
    fetchNativeBacktestTrades(),
    fetchBacktestSessions(),
    fetchBacktestCategories(true),
  ]);

  const sessionStatus = new Map(sessions.map((s) => [s.id, s.status]));
  const trades = filtere(alle, sp, sessionStatus);
  const stats = computeNativeBacktestStats(trades);

  const breakdownData = Object.fromEntries(
    BREAKDOWN_DIMENSIONS.map((d) => [d, computeBreakdown(trades, d)]),
  ) as Record<BreakdownDimension, BreakdownRow[]>;
  // Dieselben Gruppen, aber nur über die Stopouts - beantwortet die Frage,
  // was in den Verlust-Trades immer wieder auftaucht.
  const slBreakdown = Object.fromEntries(
    BREAKDOWN_DIMENSIONS.map((d) => [d, computeBreakdown(trades, d, true)]),
  ) as Record<BreakdownDimension, BreakdownRow[]>;
  const insights = computeInsights(trades, stats);
  const equity = computeEquityKurve(trades);

  const pairs = [...new Set(alle.map((t) => t.pair))].sort();
  const gvaTypen = categories.find((c) => c.key === "gva_typ")?.tags.map((t) => t.label) ?? [];
  const confluences = categories.find((c) => c.key === "confluence")?.tags.map((t) => t.label) ?? [];

  const fortschritt = (alle.length / BACKTEST_ZIEL) * 100;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Gesamtauswertung</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Alle Sessions und Pairs zusammen — dieselbe Strategie, nur andere
          Märkte.{" "}
          <Link href="/trading/backtest" className="text-accent-soft hover:underline">
            Zurück zum Journal ↗
          </Link>
        </p>
      </div>

      <Card>
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="text-ink-soft">Roadmap-Fundament</span>
          <span className="tabular font-medium text-ink">
            {alle.length} / {BACKTEST_ZIEL} Trades
          </span>
        </div>
        <Bar pct={fortschritt} color="#8B94B8" />
        <p className="mt-2 text-xs text-ink-faint">
          Ab {BACKTEST_ZIEL} dokumentierten Trades ist die Auswertung belastbar
          genug für den nächsten Schritt (FTMO). Über alle Pairs gezählt.
        </p>
      </Card>

      <Card>
        <CardTitle>Filter</CardTitle>
        <BacktestFilter pairs={pairs} gvaTypen={gvaTypen}
          confluences={confluences} heute={heuteISO()} />
      </Card>

      {trades.length === 0 ? (
        <Card>
          <Empty>Kein Trade passt zu diesem Filter.</Empty>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Trades" value={stats.total}
                sub={trades.length === alle.length ? "alle" : `von ${alle.length} gefiltert`} />
              <Stat label="Gewertet" value={stats.gewertet} sub={`${stats.skips} Skip`} />
              <Stat label="Winrate"
                value={stats.winrate === null ? "—" : `${stats.winrate.toFixed(0)} %`} />
              <Stat label="Profit Factor"
                tone={stats.profitFactor !== null && stats.profitFactor >= 1.5 ? "good" : "neutral"}
                value={stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)} />
              <Stat label="Expectancy"
                tone={stats.expectancy !== null && stats.expectancy > 0 ? "good" : "neutral"}
                value={stats.expectancy === null ? "—" : `${stats.expectancy.toFixed(2)} R`}
                sub="Ø pro Trade" />
              <Stat label="Gesamt R"
                tone={stats.gesamtR > 0 ? "good" : stats.gesamtR < 0 ? "bad" : "neutral"}
                value={`${stats.gesamtR > 0 ? "+" : ""}${stats.gesamtR.toFixed(2)}`} />
            </div>
          </Card>

          <Card>
            <CardTitle>R-Kurve</CardTitle>
            <BacktestEquity punkte={equity} />
          </Card>

          <Card>
            <CardTitle>Was die Zahlen sagen</CardTitle>
            <BacktestInsights insights={insights} />
          </Card>

          <Card>
            <CardTitle>Aufschlüsselung</CardTitle>
            <BacktestBreakdown data={breakdownData} slData={slBreakdown} />
          </Card>

          <Card>
            <CardTitle>Wie knapp war es?</CardTitle>
            <BacktestVerlauf bloecke={verlaufBilanz(trades)} />
          </Card>

          <Card>
            <CardTitle>Was nicht durchgelaufen ist</CardTitle>
            <BacktestVerluste trades={trades} zeigePaar />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Über alle Pairs, weil die Strategie über alle Pairs dieselbe ist — das
              Pair steht auf der Karte. Die fundamentale Lage zu einem einzelnen
              Verlust gibt es nur je Pair, im Reiter <strong>Fundamental</strong> der
              jeweiligen Session.
            </p>
          </Card>

          <Card>
            <CardTitle>Export</CardTitle>
            <BacktestExport trades={trades}
              paar={[...new Set(trades.map((t) => t.pair))].length === 1
                ? trades[0].pair
                : `${[...new Set(trades.map((t) => t.pair))].length} Pairs`} />
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Filter aus der URL anwenden. Bewusst in einer Funktion statt in der
 * Datenbankabfrage: die Trade-Zahl bleibt auf Jahre hinaus klein genug,
 * und die Tag-Filter (Confluence) liessen sich über die Junction-Tabelle
 * ohnehin nicht in einem Rutsch abfragen.
 */
function filtere(
  trades: NativeBacktestTrade[],
  sp: Record<string, string | undefined>,
  sessionStatus: Map<string, string>,
): NativeBacktestTrade[] {
  return trades.filter((t) => {
    if (sp.pair && t.pair !== sp.pair) return false;
    if (sp.richtung && t.direction !== sp.richtung) return false;
    if (sp.von && t.occurred_on < sp.von) return false;
    if (sp.bis && t.occurred_on > sp.bis) return false;

    if (sp.status) {
      const status = t.session_id ? sessionStatus.get(t.session_id) : undefined;
      if (status !== sp.status) return false;
    }

    if (sp.ergebnis === "ohne_skip") {
      if (t.result === "skip") return false;
    } else if (sp.ergebnis && t.result !== sp.ergebnis) {
      return false;
    }

    if (sp.gva && !t.tags.some((tg) => tg.categoryKey === "gva_typ" && tg.label === sp.gva)) {
      return false;
    }
    if (sp.confluence
      && !t.tags.some((tg) => tg.categoryKey === "confluence" && tg.label === sp.confluence)) {
      return false;
    }

    return true;
  });
}
