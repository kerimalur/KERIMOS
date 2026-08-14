import Link from "next/link";
import {
  fetchTrades, fetchOutlooks, computeJournalStats, gruppiere, signiertesR,
  SETUPS, tradingUserId, type Trade,
} from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { JournalHinweis } from "@/components/journal-hinweis";
import { Card, CardTitle, Stat, Badge, Empty, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Journal-Übersicht — was die Trades zusammengenommen sagen.
 *
 * Umgezogen aus dem GVA-Screener (`/journal/dashboard`), siehe TRADING-UMBAU.md.
 *
 * Die Seite trennt bewusst zwischen **Backtest** und **Live**. Beides in einen
 * Topf zu werfen wäre die bequemere Zahl und die falsche: ein Backtest-Trade
 * kostet nichts, ein Live-Trade schon. Solange Kerim im Backtest ist, steht
 * dieser oben — der Live-Block bleibt leer, bis es etwas zu zeigen gibt.
 */

function KennzahlenBlock({ trades, titel, sub }: {
  trades: Trade[]; titel: string; sub: string;
}) {
  const s = computeJournalStats(trades);

  return (
    <Card area={s.n > 0 ? "trading" : undefined}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">{titel}</CardTitle>
        <span className="text-xs text-ink-faint">{sub}</span>
      </div>

      {s.n === 0 ? (
        <Empty>Noch keine abgeschlossenen Trades.</Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Trades" value={s.n} sub={`${s.wins} W · ${s.losses} L · ${s.breakeven} BE`} />
            <Stat
              label="Winrate"
              value={s.winrate === null ? "—" : `${s.winrate.toFixed(0)} %`}
              tone={s.winrate !== null && s.winrate >= 50 ? "good" : "neutral"}
            />
            <Stat
              label="Profit Factor"
              value={s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)}
              tone={s.profitFactor !== null && s.profitFactor >= 1.5 ? "good"
                : s.profitFactor !== null && s.profitFactor < 1 ? "bad" : "neutral"}
              sub="Gewinn ÷ Verlust in R"
            />
            <Stat
              label="Erwartungswert"
              value={s.expectancy === null ? "—" : `${s.expectancy >= 0 ? "+" : ""}${s.expectancy.toFixed(2)} R`}
              tone={s.expectancy !== null && s.expectancy > 0 ? "good"
                : s.expectancy !== null && s.expectancy < 0 ? "bad" : "neutral"}
              sub="Ø pro Trade"
            />
          </div>

          <div className="mt-5 grid gap-4 border-t border-line/70 pt-4 sm:grid-cols-4">
            <Stat
              label="Gesamt"
              value={`${s.gesamtR >= 0 ? "+" : ""}${s.gesamtR.toFixed(1)} R`}
              tone={s.gesamtR > 0 ? "good" : s.gesamtR < 0 ? "bad" : "neutral"}
            />
            <Stat
              label="Max. Drawdown"
              value={`${s.maxDrawdownR.toFixed(1)} R`}
              tone={s.maxDrawdownR > Math.abs(s.gesamtR) ? "bad" : "neutral"}
              sub="grösster Rückgang"
            />
            <Stat label="Beste Serie" value={`${s.besteSerie}×`} sub="Gewinne in Folge" />
            <Stat label="Schlechteste Serie" value={`${s.schlechtesteSerie}×`} sub="Verluste in Folge" />
          </div>
        </>
      )}
    </Card>
  );
}

/** Kennzahlen je Gruppe als Tabelle — für Setups, Paare und Sessions. */
function GruppenTabelle({ trades, schluessel, leer }: {
  trades: Trade[];
  schluessel: (t: Trade) => string;
  leer: string;
}) {
  const gruppen = gruppiere(trades, schluessel).filter((g) => g.stats.n >= 1);
  if (gruppen.length === 0) return <Empty>{leer}</Empty>;

  return (
    <div className="space-y-2">
      {gruppen.map((g) => {
        const wr = g.stats.winrate ?? 0;
        const r = g.stats.gesamtR;
        return (
          <div key={g.key} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm text-ink-soft" title={g.key}>
              {g.key}
            </span>
            <span className="tabular w-10 shrink-0 text-right text-xs text-ink-muted">
              {g.stats.n}×
            </span>
            <div className="min-w-0 flex-1">
              <Bar pct={wr} color={wr >= 50 ? "#5FC2A6" : "#E28B72"} />
            </div>
            <span className="tabular w-12 shrink-0 text-right text-xs text-ink-muted">
              {g.stats.winrate === null ? "—" : `${wr.toFixed(0)} %`}
            </span>
            <span className={`tabular w-16 shrink-0 text-right text-sm font-medium ${
              r > 0 ? "text-good-bright" : r < 0 ? "text-bad-bright" : "text-ink-muted"
            }`}>
              {r >= 0 ? "+" : ""}{r.toFixed(1)} R
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default async function JournalUebersicht() {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const [alle, outlooks] = await Promise.all([fetchTrades(), fetchOutlooks()]);

  const backtest = alle.filter((t) => t.sessionType === "backtest");
  const live = alle.filter((t) => t.sessionType === "live");
  const offeneThesen = outlooks.filter(
    (o) => o.status !== "closed" && o.status !== "executed" && !o.executedTradeId,
  );

  const letzte = alle.slice(0, 8);

  return (
    <div className="space-y-5">
      <KennzahlenBlock
        trades={backtest}
        titel="Backtest"
        sub="durchgespielt, ohne Geld — die Grundlage für alles weitere"
      />

      <KennzahlenBlock
        trades={live}
        titel="Live"
        sub={live.length === 0 ? "noch nicht gestartet — bewusst so" : "echtes Geld"}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Nach Setup</CardTitle>
          <GruppenTabelle
            trades={alle}
            schluessel={(t) => {
              const treffer = SETUPS.filter((s) => t.setups[s.key]).map((s) => s.label);
              return treffer.length ? treffer.join(" + ") : "ohne Setup-Angabe";
            }}
            leer="Noch keine Trades mit Setup-Angabe."
          />
          <p className="mt-4 text-xs text-ink-faint">
            Ein Trade kann mehrere Setups tragen — dann steht die Kombination als
            eigene Zeile. Das ist Absicht: die Frage lautet nicht „wirkt die GVA",
            sondern „wirkt die GVA <em>zusammen mit</em> dem BOS".
          </p>
        </Card>

        <Card>
          <CardTitle>Nach Paar</CardTitle>
          <GruppenTabelle
            trades={alle}
            schluessel={(t) => t.pair}
            leer="Noch keine Trades erfasst."
          />
        </Card>

        <Card>
          <CardTitle>Nach Session</CardTitle>
          <GruppenTabelle
            trades={alle}
            schluessel={(t) => t.session || "ohne Session-Angabe"}
            leer="Noch keine Session erfasst."
          />
          <p className="mt-4 text-xs text-ink-faint">
            London 08–10 Uhr und New York 14–16 Uhr sind die Fenster, in denen
            der Screener scannt. Was ausserhalb entsteht, ist erklärungsbedürftig.
          </p>
        </Card>

        <Card>
          <CardTitle>Nach Richtung</CardTitle>
          <GruppenTabelle
            trades={alle}
            schluessel={(t) => (t.direction === "long" ? "Long" : "Short")}
            leer="Noch keine Trades erfasst."
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <CardTitle className="mb-0">Letzte Trades</CardTitle>
            <Link href="/trading/journal/trades"
              className="text-xs text-accent-soft transition hover:underline">
              alle ansehen →
            </Link>
          </div>
          {letzte.length === 0 ? (
            <Empty>Noch nichts erfasst.</Empty>
          ) : (
            <div className="space-y-1.5">
              {letzte.map((t) => {
                const r = signiertesR(t);
                return (
                  <div key={t.id}
                    className="flex items-center gap-2.5 rounded-xl bg-sand/50 px-3 py-2">
                    <span className="tabular w-20 shrink-0 text-xs text-ink-faint">
                      {t.date.slice(8, 10)}.{t.date.slice(5, 7)}.{t.date.slice(2, 4)}
                    </span>
                    <span className="w-[76px] shrink-0 text-sm font-medium text-ink">
                      {t.pair}
                    </span>
                    <Badge tone={t.direction === "long" ? "good" : "bad"}>
                      {t.direction === "long" ? "Long" : "Short"}
                    </Badge>
                    {t.sessionType === "backtest" && <Badge tone="neutral">BT</Badge>}
                    <span className={`tabular ml-auto text-sm font-medium ${
                      r > 0 ? "text-good-bright" : r < 0 ? "text-bad-bright" : "text-ink-muted"
                    }`}>
                      {r >= 0 ? "+" : ""}{r.toFixed(1)} R
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <CardTitle className="mb-0">Offene Thesen</CardTitle>
            <Link href="/trading/journal/outlook"
              className="text-xs text-accent-soft transition hover:underline">
              Outlook →
            </Link>
          </div>
          {offeneThesen.length === 0 ? (
            <Empty>Keine offene These. Nichts zu tun ist auch ein Zustand.</Empty>
          ) : (
            <div className="space-y-1.5">
              {offeneThesen.slice(0, 8).map((o) => (
                <div key={o.id}
                  className="flex items-center gap-2.5 rounded-xl bg-sand/50 px-3 py-2">
                  <span className="w-[76px] shrink-0 text-sm font-medium text-ink">
                    {o.symbol}
                  </span>
                  <Badge tone={o.direction === "long" ? "good" : "bad"}>
                    {o.direction === "long" ? "Long" : "Short"}
                  </Badge>
                  {o.source === "gva" && <Badge tone="accent">GVA</Badge>}
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                    {o.thesis || "ohne Notiz"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
