"use client";
import { useMemo, useState } from "react";
import { Badge, cx } from "@/components/ui";
import { bauePineSkript, baueCsv, MAX_LABELS, type ExportTrade } from "@/lib/confluence/pine-export";
import { baueMarkdown } from "@/lib/backtest-markdown";
import { type BacktestResult, type NativeBacktestTrade } from "@/lib/backtest-types";

/**
 * Export in drei Formen, nach Ergebnis filterbar.
 *
 * Der Filter ist der eigentliche Punkt: „alle Stopouts als Markdown" ist eine
 * Frage, die man einem Modell stellen kann — „alle Trades" ist ein Datenberg.
 *
 * Der Kopierknopf ist neu und ersetzt das frühere „markieren und Strg+C":
 * seit die Auswahl im Client sitzt, kostet er nichts mehr, und die Markdown-
 * Ausgabe ist zu lang, um sie bequem von Hand zu markieren.
 */

type Auswahl = "alle" | "gewertet" | "tp" | "sl" | "be" | "skip";

const AUSWAHL: { key: Auswahl; label: string; ergebnisse: BacktestResult[] }[] = [
  { key: "alle", label: "alle Trades", ergebnisse: [] },
  { key: "gewertet", label: "ohne Skips", ergebnisse: ["full_tp", "teil_tp_be", "breakeven", "sl"] },
  { key: "tp", label: "nur TP", ergebnisse: ["full_tp", "teil_tp_be"] },
  { key: "sl", label: "nur SL", ergebnisse: ["sl"] },
  { key: "be", label: "nur Breakeven", ergebnisse: ["breakeven"] },
  { key: "skip", label: "nur Skips", ergebnisse: ["skip"] },
];

const alsExport = (t: NativeBacktestTrade): ExportTrade => ({
  datum: t.occurred_on.slice(0, 10),
  paar: t.pair,
  richtung: (t.direction === "short" ? -1 : 1) as -1 | 1,
  ergebnis: t.result,
  r: t.r_multiple ?? 0,
});

export function BacktestExport({ trades, paar }: {
  trades: NativeBacktestTrade[];
  paar: string;
}) {
  const [auswahl, setAuswahl] = useState<Auswahl>("alle");

  const gewaehlt = useMemo(() => {
    const a = AUSWAHL.find((x) => x.key === auswahl)!;
    return a.ergebnisse.length === 0
      ? trades
      : trades.filter((t) => a.ergebnisse.includes(t.result));
  }, [trades, auswahl]);

  const anzahl = useMemo(() => Object.fromEntries(AUSWAHL.map((a) => [
    a.key,
    a.ergebnisse.length === 0 ? trades.length
      : trades.filter((t) => a.ergebnisse.includes(t.result)).length,
  ])) as Record<Auswahl, number>, [trades]);

  const label = AUSWAHL.find((a) => a.key === auswahl)!.label;
  const pine = bauePineSkript(gewaehlt.map(alsExport), `GVA Backtest ${paar} — ${label}`);
  const csv = baueCsv(gewaehlt.map(alsExport).filter((t) => t.ergebnis !== "skip"));
  const markdown = baueMarkdown(gewaehlt, { paar, auswahl: label, bestand: trades });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] text-ink-faint">Exportieren</span>
        {AUSWAHL.map((a) => (
          <button key={a.key} type="button" onClick={() => setAuswahl(a.key)}
            disabled={anzahl[a.key] === 0}
            className={cx(
              "rounded-xl px-3 py-1.5 text-xs transition duration-150 ease-tactile active:scale-95",
              "disabled:cursor-not-allowed disabled:opacity-35",
              auswahl === a.key
                ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                : "border border-line bg-sand text-ink-muted hover:text-ink")}>
            {a.label}
            <span className="ml-1.5 tabular opacity-60">{anzahl[a.key]}</span>
          </button>
        ))}
      </div>

      <Feld titel="Als Markdown — zum Weitergeben"
        text={markdown} zeilen={12}
        zusatz={<Badge tone="neutral">{gewaehlt.length} Trades</Badge>}>
        Enthält Datum, Richtung, Ergebnis, R, alle Tags, die Verlaufsklasse, die Notiz
        und den <strong>Chart als Bild-URL</strong> — dazu einen Kontextblock, der
        erklärt, was die Klassen bedeuten. Kopieren, in einen Chat werfen und fragen,
        was auffällt. Ohne den Kontextblock rät das Gegenüber Muster zusammen, die
        nur aus dem Missverständnis kommen.
      </Feld>

      <Feld titel="Pine-Skript für TradingView"
        text={pine.quelltext} zeilen={10}
        zusatz={
          <>
            <Badge tone="neutral">{pine.anzahl} Trades</Badge>
            {pine.weggelassen > 0 && <Badge tone="warn">{pine.weggelassen} weggelassen</Badge>}
          </>
        }>
        In TradingView unter <strong>Pine-Editor → Neu → Indikator</strong> einfügen,
        speichern, zum Chart hinzufügen. <strong>Longs stehen unter der Kerze, Shorts
        darüber</strong>; die Farbe kommt aus dem erreichten R, nicht aus dem
        Ergebnis-Etikett. Das Skript filtert <strong>nicht</strong> nach Symbol — leg es
        auf das ausgewertete Paar. Pine zeichnet höchstens {MAX_LABELS} Labels; darüber
        hinaus fallen die ältesten weg. Skips sind hier nie dabei, auch nicht bei
        „alle Trades" — sie haben kein Ergebnis, das sich markieren liesse.
      </Feld>

      <Feld titel="Als CSV" text={csv} zeilen={6}>
        Semikolon getrennt, damit Excel es ohne Import-Assistent öffnet.
      </Feld>
    </div>
  );
}

function Feld({
  titel, text, zeilen, zusatz, children,
}: {
  titel: string;
  text: string;
  zeilen: number;
  zusatz?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [kopiert, setKopiert] = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1600);
    } catch {
      // Ohne Zwischenablage-Recht bleibt das Textfeld — dort geht Strg+A, Strg+C.
      setKopiert(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{titel}</span>
        {zusatz}
        <button type="button" onClick={kopieren}
          className="ml-auto rounded-lg border border-line bg-sand px-2.5 py-1 text-xs
                     text-ink-muted transition hover:text-ink active:scale-95">
          {kopiert ? "kopiert ✓" : "kopieren"}
        </button>
      </div>
      <textarea readOnly rows={zeilen} value={text} spellCheck={false}
        className="num w-full rounded-xl border border-line bg-sand/60 p-3 text-[11px]
                   leading-relaxed text-ink-soft" />
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{children}</p>
    </div>
  );
}
