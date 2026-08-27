"use client";
import { useEffect, useState } from "react";
import { Badge, cx } from "@/components/ui";
import {
  RESULT_LABEL, tradingViewBild,
  type BacktestCategoryKey, type BacktestResult, type NativeBacktestTrade,
} from "@/lib/backtest-types";

/**
 * Ein Trade als Bild — einmal als Karte im Raster, einmal gross im Overlay.
 *
 * Bewusst EIN Bauteil für beide Orte, an denen ein Trade angesehen wird: das
 * Verlust-Raster und der Klick auf einen Punkt im Zeitstrahl. Zwei Fassungen
 * derselben Karte würden auseinanderlaufen, sobald an einer Stelle ein Feld
 * dazukommt.
 */

/** Wie die drei Fundamental-Spuren zu diesem Trade standen. */
export interface TradeLage {
  cot: -1 | 0 | 1;
  saison: -1 | 0 | 1;
  qscore: -1 | 0 | 1;
}

const LAGE_LABEL: Record<keyof TradeLage, string> = {
  cot: "Commercials gegen Retail",
  saison: "Saisonalität",
  qscore: "Confluence-Score",
};

/** Farben der Ergebnisse — dieselben im Raster, im Zeitstrahl und in der Legende. */
export const ERGEBNIS_FARBE: Record<BacktestResult, string> = {
  full_tp: "#7EE0C6",
  teil_tp_be: "#5FC2A6",
  breakeven: "#9A8C74",
  sl: "#F0A08A",
  skip: "#7A6E5C",
};

export function ergebnisTon(t: NativeBacktestTrade) {
  if (t.result === "skip") return "neutral" as const;
  if (t.r_multiple !== null && t.r_multiple > 0) return "good" as const;
  if (t.r_multiple !== null && t.r_multiple < 0) return "bad" as const;
  return "neutral" as const;
}

export const datumDE = (iso: string) =>
  `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export const wochentagVon = (iso: string) =>
  WOCHENTAG[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()];

const TAG_TON: Partial<Record<BacktestCategoryKey, string>> = {
  skip_grund: "bg-warn-tint text-accent-soft",
  anmerkung: "bg-bad-tint text-bad",
};

/* ----------------------------------------------------------------- Bild */

function TradeBild({
  trade, gross,
}: { trade: NativeBacktestTrade; gross?: boolean }) {
  const quelle = tradingViewBild(trade.tradingview_link) ?? trade.screenshot_url;
  const [fehler, setFehler] = useState(false);
  // Im Raster wird beschnitten (gleich hohe Kacheln), im Overlay nicht — dort
  // ist der Chart der Inhalt und darf nicht am Rand abgeschnitten werden.
  const bildKlasse = gross
    ? "max-h-[62vh] w-full bg-paper object-contain"
    : "h-36 w-full bg-paper object-cover";
  const platzKlasse = gross ? "h-56" : "h-36";

  if (quelle && !fehler) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={quelle} alt={`Chart ${trade.pair} ${datumDE(trade.occurred_on)}`}
        loading="lazy" onError={() => setFehler(true)}
        className={bildKlasse} />
    );
  }

  return (
    <div className={cx(
      "flex w-full items-center justify-center bg-sand/50 px-4 text-center text-[11px] text-ink-faint",
      platzKlasse)}>
      {trade.tradingview_link
        ? fehler ? "Chart liess sich nicht laden" : "Aus diesem Link lässt sich kein Bild ableiten"
        : "Kein Chart hinterlegt"}
    </div>
  );
}

/* ---------------------------------------------------------------- Karte */

export function TradeKarte({
  trade, zeigePaar, onOeffnen,
}: {
  trade: NativeBacktestTrade;
  zeigePaar: boolean;
  onOeffnen: () => void;
}) {
  return (
    <button type="button" onClick={onOeffnen}
      className="group overflow-hidden rounded-xl border border-line bg-card text-left
                 transition duration-150 ease-tactile hover:border-line-strong
                 hover:shadow-card active:scale-[.99]">
      <div className="relative">
        <TradeBild trade={trade} />
        <span className="absolute left-2 top-2 rounded-lg bg-paper/85 px-2 py-0.5 text-[11px]
                         tabular text-ink-soft backdrop-blur-sm">
          {datumDE(trade.occurred_on)}
        </span>
        <span className="absolute right-2 top-2 rounded-lg px-2 py-0.5 text-[11px] font-medium
                         backdrop-blur-sm"
          style={{
            backgroundColor: `${ERGEBNIS_FARBE[trade.result]}22`,
            color: ERGEBNIS_FARBE[trade.result],
          }}>
          {RESULT_LABEL[trade.result]}
        </span>
      </div>

      <div className="space-y-1.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {zeigePaar && <span className="font-medium text-ink">{trade.pair}</span>}
          <Badge tone={trade.direction === "long" ? "good" : "bad"}>
            {trade.direction === "long" ? "Long" : "Short"}
          </Badge>
          <span className="tabular text-ink-muted">
            {trade.r_multiple !== null
              ? `${trade.r_multiple > 0 ? "+" : ""}${trade.r_multiple.toFixed(2)} R`
              : "—"}
          </span>
          {trade.rr_geplant !== null && (
            <span className="tabular text-ink-faint">RR {trade.rr_geplant.toFixed(1)}</span>
          )}
          <span className="text-ink-faint">{wochentagVon(trade.occurred_on)}</span>
        </div>

        {trade.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {trade.tags.slice(0, 5).map((tg) => (
              <span key={tg.tagId}
                className={cx("rounded px-1.5 py-0.5 text-[10px]",
                  TAG_TON[tg.categoryKey] ?? "bg-sand text-ink-muted")}>
                {tg.label}
              </span>
            ))}
            {trade.tags.length > 5 && (
              <span className="text-[10px] text-ink-faint">+{trade.tags.length - 5}</span>
            )}
          </div>
        )}

        {trade.notiz && (
          <p className="line-clamp-2 text-[11px] leading-snug text-ink-muted">{trade.notiz}</p>
        )}
      </div>
    </button>
  );
}

/* -------------------------------------------------------------- Overlay */

function LageZeile({ art, wert }: { art: keyof TradeLage; wert: -1 | 0 | 1 }) {
  const wort = wert > 0 ? "dafür" : wert < 0 ? "dagegen" : "keine Aussage";
  const farbe = wert > 0 ? "text-good" : wert < 0 ? "text-bad" : "text-ink-faint";
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <span className="text-xs text-ink-muted">{LAGE_LABEL[art]}</span>
      <span className={cx("text-xs font-medium", farbe)}>{wort}</span>
    </li>
  );
}

export function TradeOverlay({
  trade, lage, onSchliessen, onZurueck, onVor, position,
}: {
  trade: NativeBacktestTrade;
  lage: TradeLage | null;
  onSchliessen: () => void;
  onZurueck?: () => void;
  onVor?: () => void;
  /** "3 von 17" — nur zur Orientierung beim Durchklicken. */
  position?: string;
}) {
  // Tastatur, weil man dreissig Verluste durchsieht und nicht dreissigmal
  // zielen will: Esc schliesst, Pfeile blättern.
  useEffect(() => {
    const auf = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSchliessen();
      if (e.key === "ArrowLeft" && onZurueck) onZurueck();
      if (e.key === "ArrowRight" && onVor) onVor();
    };
    window.addEventListener("keydown", auf);
    return () => window.removeEventListener("keydown", auf);
  }, [onSchliessen, onZurueck, onVor]);

  return (
    <div onClick={onSchliessen}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                 bg-black/75 p-4 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-4xl rounded-2xl border border-line bg-card p-5 animate-pop">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-bold text-ink">{trade.pair}</span>
          <Badge tone={trade.direction === "long" ? "good" : "bad"}>
            {trade.direction === "long" ? "Long" : "Short"}
          </Badge>
          <Badge tone={ergebnisTon(trade)}>{RESULT_LABEL[trade.result]}</Badge>
          <span className="tabular text-xs text-ink-muted">
            {datumDE(trade.occurred_on)} · {wochentagVon(trade.occurred_on)}
          </span>
          <span className="ml-auto flex items-center gap-3">
            {position && <span className="tabular text-[11px] text-ink-faint">{position}</span>}
            {onZurueck && (
              <button type="button" onClick={onZurueck} aria-label="Vorheriger Trade"
                className="text-sm text-ink-faint transition hover:text-ink-soft">←</button>
            )}
            {onVor && (
              <button type="button" onClick={onVor} aria-label="Nächster Trade"
                className="text-sm text-ink-faint transition hover:text-ink-soft">→</button>
            )}
            <button type="button" onClick={onSchliessen} aria-label="Schliessen"
              className="text-sm text-ink-faint transition hover:text-ink-soft">✕</button>
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-line">
          <TradeBild trade={trade} gross />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
              {trade.rr_geplant !== null && (
                <span className="tabular">RR geplant {trade.rr_geplant.toFixed(2)}</span>
              )}
              {trade.r_multiple !== null && (
                <span className="tabular">
                  R erreicht {trade.r_multiple > 0 ? "+" : ""}{trade.r_multiple.toFixed(2)}
                </span>
              )}
              {trade.tradingview_link && (
                <a href={trade.tradingview_link} target="_blank" rel="noopener noreferrer"
                  className="text-accent-soft hover:underline">Chart in TradingView ↗</a>
              )}
            </div>

            {trade.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {trade.tags.map((tg) => (
                  <span key={tg.tagId}
                    className={cx("rounded px-1.5 py-0.5 text-[11px]",
                      TAG_TON[tg.categoryKey] ?? "bg-sand text-ink-muted")}>
                    {tg.label}
                  </span>
                ))}
              </div>
            )}

            {trade.notiz
              ? <p className="text-sm leading-relaxed text-ink-soft">{trade.notiz}</p>
              : <p className="text-xs text-ink-faint">Keine Anmerkung erfasst.</p>}
          </div>

          <div className="rounded-xl bg-sand/50 p-3">
            <p className="mb-1 text-[11px] font-medium text-ink-soft">
              Fundamentale Lage am Handelstag
            </p>
            {lage ? (
              <>
                <ul>
                  <LageZeile art="cot" wert={lage.cot} />
                  <LageZeile art="saison" wert={lage.saison} />
                  <LageZeile art="qscore" wert={lage.qscore} />
                </ul>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
                  Auf die gehandelte Richtung gedreht: „dafür" heisst, der Faktor sprach
                  für <em>diesen</em> Trade — nicht für das Paar.
                </p>
              </>
            ) : (
              <p className="text-[11px] leading-relaxed text-ink-faint">
                Wird nur im Reiter <strong>Fundamental</strong> geladen — dort auf einen
                Punkt im Zeitstrahl klicken. Die Lage kostet Zins-, COT- und Kursreihen;
                dieses Raster soll ohne diese Wartezeit aufgehen.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
