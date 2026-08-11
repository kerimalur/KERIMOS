"use client";
import { useState } from "react";
import { Badge, Empty, cx } from "@/components/ui";
import { deleteBacktestTrade } from "@/lib/backtest-actions";
import { BacktestTradeForm } from "@/components/backtest-trade-form";
import {
  RESULT_LABEL, tradingViewBild,
  type BacktestCategory, type NativeBacktestTrade,
} from "@/lib/backtest-types";

interface Kategorien {
  gvaTyp: BacktestCategory | null;
  confluence: BacktestCategory | null;
  anmerkung: BacktestCategory | null;
  skipGrund: BacktestCategory | null;
}

/**
 * Trade-Liste mit drei Zuständen je Zeile: zugeklappt, Detail-Dialog und
 * Bearbeiten. Der Dialog lädt den Chart aus dem TradingView-Link nach —
 * ein geteilter Schnappschuss liegt als PNG vor, das lässt sich direkt
 * anzeigen statt nur zu verlinken.
 */
export function BacktestTradeListe({
  trades, kategorien,
}: { trades: NativeBacktestTrade[]; kategorien: Kategorien }) {
  const [offen, setOffen] = useState<string | null>(null);
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);

  if (trades.length === 0) {
    return <Empty>Noch keine Trades in dieser Session.</Empty>;
  }

  const dialogTrade = trades.find((t) => t.id === offen) ?? null;

  return (
    <>
      <ul className="space-y-1.5">
        {trades.map((t) => (
          <li key={t.id} className="rounded-lg bg-sand/60 px-3 py-2.5 text-sm">
            {bearbeitet === t.id ? (
              <BacktestTradeForm sessionId={t.session_id ?? ""} kategorien={kategorien}
                trade={t} onFertig={() => setBearbeitet(null)} />
            ) : (
              <TradeZeile t={t}
                onOeffnen={() => setOffen(t.id)}
                onBearbeiten={() => setBearbeitet(t.id)} />
            )}
          </li>
        ))}
      </ul>

      {dialogTrade && (
        <TradeDialog trade={dialogTrade} onSchliessen={() => setOffen(null)}
          onBearbeiten={() => { setBearbeitet(dialogTrade.id); setOffen(null); }} />
      )}
    </>
  );
}

function ergebnisTon(t: NativeBacktestTrade) {
  if (t.result === "skip") return "neutral" as const;
  if (t.r_multiple !== null && t.r_multiple > 0) return "good" as const;
  if (t.r_multiple !== null && t.r_multiple < 0) return "bad" as const;
  return "neutral" as const;
}

function TradeZeile({
  t, onOeffnen, onBearbeiten,
}: { t: NativeBacktestTrade; onOeffnen: () => void; onBearbeiten: () => void }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onOeffnen}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
          <span className="tabular text-xs text-ink-muted">
            {t.occurred_on.slice(8, 10)}.{t.occurred_on.slice(5, 7)}.{t.occurred_on.slice(0, 4)}
          </span>
          <Badge tone={t.direction === "long" ? "good" : "bad"}>
            {t.direction === "long" ? "Long" : "Short"}
          </Badge>
          <Badge tone={ergebnisTon(t)}>{RESULT_LABEL[t.result]}</Badge>
          {t.r_multiple !== null && (
            <span className="tabular text-xs text-ink-soft">
              {t.r_multiple > 0 ? "+" : ""}{t.r_multiple.toFixed(2)} R
            </span>
          )}
          {t.tradingview_link && (
            <span className="text-[11px] text-accent-soft">Chart</span>
          )}
        </button>

        <button type="button" onClick={onBearbeiten}
          className="text-xs text-ink-faint transition hover:text-accent-soft">
          bearbeiten
        </button>
        <form action={deleteBacktestTrade}>
          <input type="hidden" name="id" value={t.id} />
          <button className="text-xs text-ink-faint transition hover:text-bad">löschen</button>
        </form>
      </div>

      {t.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {t.tags.map((tg) => (
            <span key={tg.tagId} className="rounded bg-card px-1.5 py-0.5 text-[11px] text-ink-muted">
              {tg.label}
            </span>
          ))}
        </div>
      )}
      {t.notiz && <p className="mt-1.5 text-xs text-ink-muted">{t.notiz}</p>}
    </>
  );
}

function TradeDialog({
  trade, onSchliessen, onBearbeiten,
}: { trade: NativeBacktestTrade; onSchliessen: () => void; onBearbeiten: () => void }) {
  const bild = tradingViewBild(trade.tradingview_link) ?? trade.screenshot_url;
  const [bildFehler, setBildFehler] = useState(false);

  return (
    <div onClick={onSchliessen}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                 bg-black/70 p-4 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-3xl rounded-2xl border border-line bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-bold text-ink">{trade.pair}</span>
          <Badge tone={trade.direction === "long" ? "good" : "bad"}>
            {trade.direction === "long" ? "Long" : "Short"}
          </Badge>
          <Badge tone={ergebnisTon(trade)}>{RESULT_LABEL[trade.result]}</Badge>
          <span className="tabular text-xs text-ink-muted">
            {trade.occurred_on.slice(8, 10)}.{trade.occurred_on.slice(5, 7)}.{trade.occurred_on.slice(0, 4)}
          </span>
          <span className="ml-auto flex items-center gap-3">
            <button type="button" onClick={onBearbeiten}
              className="text-xs text-accent-soft transition hover:underline">
              bearbeiten
            </button>
            <button type="button" onClick={onSchliessen} aria-label="Schliessen"
              className="text-sm text-ink-faint transition hover:text-ink-soft">✕</button>
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
          {trade.rr_geplant !== null && (
            <span className="tabular">RR geplant {trade.rr_geplant.toFixed(2)}</span>
          )}
          {trade.r_multiple !== null && (
            <span className="tabular">
              R erreicht {trade.r_multiple > 0 ? "+" : ""}{trade.r_multiple.toFixed(2)}
            </span>
          )}
        </div>

        {bild && !bildFehler ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bild} alt={`Chart ${trade.pair}`} onError={() => setBildFehler(true)}
            className="w-full rounded-xl border border-line" />
        ) : (
          <div className="rounded-xl bg-sand/60 px-4 py-8 text-center text-xs text-ink-muted">
            {trade.tradingview_link
              ? bildFehler
                ? "Der Chart liess sich nicht laden."
                : "Aus diesem Link lässt sich kein Bild ableiten."
              : "Kein Chart hinterlegt."}
            {trade.tradingview_link && (
              <>
                {" "}
                <a href={trade.tradingview_link} target="_blank" rel="noopener noreferrer"
                  className="text-accent-soft hover:underline">
                  Link öffnen ↗
                </a>
              </>
            )}
          </div>
        )}

        {trade.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {trade.tags.map((tg) => (
              <span key={tg.tagId}
                className="rounded bg-sand px-1.5 py-0.5 text-[11px] text-ink-muted">
                {tg.label}
              </span>
            ))}
          </div>
        )}
        {trade.notiz && (
          <p className={cx("mt-3 text-sm text-ink-soft")}>{trade.notiz}</p>
        )}
      </div>
    </div>
  );
}
