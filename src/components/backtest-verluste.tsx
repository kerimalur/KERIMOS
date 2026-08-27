"use client";
import { useMemo, useState } from "react";
import { Empty, cx } from "@/components/ui";
import { TradeKarte, TradeOverlay, ERGEBNIS_FARBE } from "@/components/backtest-trade-karte";
import {
  RESULT_LABEL, type BacktestResult, type NativeBacktestTrade,
} from "@/lib/backtest-types";

/**
 * Die Trades, die nicht durchgelaufen sind — als Bilder, nicht als Zeilen.
 *
 * Der Sinn ist ein anderer als der der Aufschlüsselung darüber: die Tabelle
 * sagt, welche Gruppe anteilig zu viele Stopouts hat; das Raster zeigt die
 * Charts nebeneinander, und Muster im Chartbild („Einstieg immer am gleichen
 * Punkt der Bewegung") sieht keine Statistik der Welt.
 *
 * Bewusst OHNE fundamentale Lage: die kostet Zins-, COT- und Kursreihen und
 * würde das Raster um Sekunden verzögern. Wer die Lage zu einem Verlust
 * sehen will, klickt ihn im Reiter „Fundamental" im Zeitstrahl an.
 */

type FilterKey = "alle" | BacktestResult;

const FILTER: { key: FilterKey; label: string }[] = [
  { key: "alle", label: "Alles ausser Full TP" },
  { key: "sl", label: RESULT_LABEL.sl },
  { key: "teil_tp_be", label: RESULT_LABEL.teil_tp_be },
  { key: "breakeven", label: RESULT_LABEL.breakeven },
  { key: "skip", label: RESULT_LABEL.skip },
];

/** Alles ausser Full TP — Skips gehören dazu, sind aber kein Verlust. */
const STANDARD: BacktestResult[] = ["sl", "teil_tp_be", "breakeven"];

type Sortierung = "neu" | "alt";

export function BacktestVerluste({
  trades, zeigePaar = false,
}: {
  trades: NativeBacktestTrade[];
  zeigePaar?: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("alle");
  const [sortierung, setSortierung] = useState<Sortierung>("neu");
  const [offen, setOffen] = useState<string | null>(null);

  const sichtbar = useMemo(() => {
    const passt = (t: NativeBacktestTrade) =>
      filter === "alle" ? STANDARD.includes(t.result) : t.result === filter;
    return trades.filter(passt).sort((a, b) => sortierung === "neu"
      ? b.occurred_on.localeCompare(a.occurred_on)
      : a.occurred_on.localeCompare(b.occurred_on));
  }, [trades, filter, sortierung]);

  const anzahl = useMemo(() => {
    const zaehle = (k: FilterKey) => k === "alle"
      ? trades.filter((t) => STANDARD.includes(t.result)).length
      : trades.filter((t) => t.result === k).length;
    return Object.fromEntries(FILTER.map((f) => [f.key, zaehle(f.key)])) as Record<FilterKey, number>;
  }, [trades]);

  const summeR = sichtbar.reduce((s, t) => s + (t.r_multiple ?? 0), 0);
  const ohneBild = sichtbar.filter((t) => !t.tradingview_link && !t.screenshot_url).length;

  const index = offen === null ? -1 : sichtbar.findIndex((t) => t.id === offen);
  const aktiv = index >= 0 ? sichtbar[index] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            disabled={anzahl[f.key] === 0}
            className={cx(
              "rounded-xl px-3 py-1.5 text-xs transition duration-150 ease-tactile active:scale-95",
              "disabled:cursor-not-allowed disabled:opacity-35",
              filter === f.key
                ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                : "border border-line bg-sand text-ink-muted hover:text-ink")}>
            {f.key !== "alle" && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ backgroundColor: ERGEBNIS_FARBE[f.key as BacktestResult] }} />
            )}
            {f.label}
            <span className="ml-1.5 tabular opacity-60">{anzahl[f.key]}</span>
          </button>
        ))}

        <button type="button"
          onClick={() => setSortierung((s) => (s === "neu" ? "alt" : "neu"))}
          className="ml-auto rounded-lg px-2.5 py-1 text-[11px] text-ink-muted
                     transition hover:text-ink">
          {sortierung === "neu" ? "neueste zuerst" : "älteste zuerst"} ↕
        </button>
      </div>

      {sichtbar.length === 0 ? (
        <Empty>Kein Trade in dieser Auswahl — was in diesem Fall eine gute Nachricht ist.</Empty>
      ) : (
        <>
          <p className="text-[11px] text-ink-faint">
            {sichtbar.length} von {trades.length} Trades
            {filter !== "skip" && (
              <> · zusammen <span className="tabular">{summeR > 0 ? "+" : ""}{summeR.toFixed(2)} R</span></>
            )}
            {ohneBild > 0 && ` · ${ohneBild} ohne hinterlegten Chart`}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sichtbar.map((t) => (
              <TradeKarte key={t.id} trade={t} zeigePaar={zeigePaar}
                onOeffnen={() => setOffen(t.id)} />
            ))}
          </div>
        </>
      )}

      {aktiv && (
        <TradeOverlay trade={aktiv} lage={null}
          position={`${index + 1} von ${sichtbar.length}`}
          onSchliessen={() => setOffen(null)}
          onZurueck={index > 0 ? () => setOffen(sichtbar[index - 1].id) : undefined}
          onVor={index < sichtbar.length - 1 ? () => setOffen(sichtbar[index + 1].id) : undefined} />
      )}
    </div>
  );
}
