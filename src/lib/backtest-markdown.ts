import {
  RESULT_LABEL, tradingViewBild, verlaufFeld,
  GEGENLAUF_LABEL, VORLAUF_LABEL,
  type BacktestCategoryKey, type NativeBacktestTrade,
} from "@/lib/backtest-types";

/**
 * Eine Auswahl Trades als Markdown — zum Weitergeben an ein Modell.
 *
 * Der Zweck ist nicht Archivierung, sondern eine Frage: „hier sind alle
 * Stopouts, fällt dir etwas auf". Deshalb steht oben ein Kontextblock. Ohne
 * ihn weiss das Gegenüber nicht, dass R fix ist, dass ein Skip kein Verlust
 * ist und dass „Vorlauf" die Bewegung VOR dem Stop meint — und rät dann
 * Muster zusammen, die nur aus dem Missverständnis kommen.
 *
 * Der Chart-Link steht als Bild-URL da, nicht als TradingView-Seite: die
 * Seite ist für ein Modell eine Anmeldemaske, das PNG ist der Chart.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/markdown.mts`.
 */

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const wochentag = (iso: string) =>
  WOCHENTAG[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()] ?? "";

/** Pipes und Zeilenumbrüche würden die Tabelle zerlegen. */
const zelle = (roh: string | null | undefined): string =>
  (roh ?? "").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim() || "—";

const tags = (t: NativeBacktestTrade, key: BacktestCategoryKey) =>
  zelle(t.tags.filter((tg) => tg.categoryKey === key).map((tg) => tg.label).join(", "));

/** Die Verlaufsangabe, wenn sie zum Ergebnis passt. */
function verlauf(t: NativeBacktestTrade): string {
  const feld = verlaufFeld(t.result);
  if (feld === "gegenlauf" && t.gegenlauf) return `gegen: ${GEGENLAUF_LABEL[t.gegenlauf]}`;
  if (feld === "vorlauf" && t.vorlauf) return `vor: ${VORLAUF_LABEL[t.vorlauf]}`;
  return "—";
}

function chart(t: NativeBacktestTrade): string {
  const bild = tradingViewBild(t.tradingview_link) ?? t.screenshot_url;
  if (bild) return `[Chart](${bild})`;
  return t.tradingview_link ? `[Link](${t.tradingview_link})` : "—";
}

export interface MarkdownOptionen {
  /** Paar oder "mehrere Pairs". */
  paar: string;
  /** Wonach gefiltert wurde, im Klartext — steht in der Überschrift. */
  auswahl: string;
  /** Der gesamte Bestand, aus dem gefiltert wurde. Für die Einordnung. */
  bestand: NativeBacktestTrade[];
}

const KONTEXT = [
  "**Kontext für die Auswertung** (bitte mitlesen, bevor Muster gesucht werden):",
  "",
  "- Strategie: GVA/BOS, diskretionär am Chart erkannt, Rückblick auf Tagesbasis.",
  "- Risiko ist fix. **Ein Stopout kostet immer genau −1 R**, unabhängig vom Ziel.",
  "  Gewinne skalieren mit dem geplanten RR (Full TP ≈ 0.81 × RR, Teil-TP-dann-BE ≈ 0.31 × RR).",
  "- Ergebnisklassen: **Full TP** ganz durchgelaufen · **Teil-TP dann BE** teilweise mitgenommen,",
  "  Rest auf Einstand · **Breakeven** ohne Ergebnis geschlossen · **SL** ausgestoppt ·",
  "  **Skip** nicht gehandelt (zählt in keiner Trefferquote mit).",
  "- Spalte *Verlauf*: bei Gewinnern die maximale Bewegung **gegen** die Position vor dem Ziel",
  "  (sass der Stop richtig), bei Stopouts und Breakeven die maximale Bewegung **für** die",
  "  Position vor der Drehung (war ein Teilverkauf drin). Geschätzte Klassen, keine Messwerte.",
  "- Ein Backtest ist kein Out-of-Sample-Test: die Setups wurden im Rückblick gesucht.",
  "  Die Trefferquote ist dadurch nach oben verzerrt, Unterschiede ZWISCHEN Gruppen weniger.",
].join("\n");

export function baueMarkdown(
  auswahl: NativeBacktestTrade[], opt: MarkdownOptionen,
): string {
  if (auswahl.length === 0) {
    return `# Backtest ${opt.paar} — ${opt.auswahl}\n\nKein Trade in dieser Auswahl.\n`;
  }

  const sortiert = [...auswahl].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const von = sortiert[0].occurred_on.slice(0, 10);
  const bis = sortiert[sortiert.length - 1].occurred_on.slice(0, 10);

  const zaehle = (k: NativeBacktestTrade["result"]) =>
    opt.bestand.filter((t) => t.result === k).length;
  const summeR = sortiert.reduce((s, t) => s + (t.r_multiple ?? 0), 0);

  const kopf = [
    `# Backtest ${opt.paar} — ${opt.auswahl} (${sortiert.length} Trades)`,
    "",
    `Zeitraum ${von} bis ${bis} · zusammen ${summeR > 0 ? "+" : ""}${summeR.toFixed(2)} R.`,
    "",
    `Gesamtbestand, aus dem diese Auswahl stammt: ${opt.bestand.length} Trades — `
    + `${zaehle("full_tp")} Full TP, ${zaehle("teil_tp_be")} Teil-TP, `
    + `${zaehle("breakeven")} Breakeven, ${zaehle("sl")} SL, ${zaehle("skip")} Skip.`,
    "",
    KONTEXT,
    "",
    "| # | Datum | Tag | Richtung | Ergebnis | R | RR | GVA-Typ | Confluence | Anmerkung | Skip-Grund | Verlauf | Chart |",
    "|---:|---|---|---|---|---:|---:|---|---|---|---|---|---|",
  ];

  const zeilen = sortiert.map((t, i) => [
    String(i + 1),
    t.occurred_on.slice(0, 10),
    wochentag(t.occurred_on),
    t.direction === "long" ? "Long" : "Short",
    RESULT_LABEL[t.result],
    t.r_multiple === null ? "—" : `${t.r_multiple > 0 ? "+" : ""}${t.r_multiple.toFixed(2)}`,
    t.rr_geplant === null ? "—" : t.rr_geplant.toFixed(1),
    tags(t, "gva_typ"),
    tags(t, "confluence"),
    tags(t, "anmerkung"),
    tags(t, "skip_grund"),
    verlauf(t),
    chart(t),
  ].join(" | ")).map((z) => `| ${z} |`);

  const mitNotiz = sortiert.filter((t) => (t.notiz ?? "").trim() !== "");
  const notizen = mitNotiz.length === 0 ? [] : [
    "",
    "## Notizen",
    "",
    ...mitNotiz.map((t) => `- **${t.occurred_on.slice(0, 10)}** — ${zelle(t.notiz)}`),
  ];

  const frage = [
    "",
    "## Frage",
    "",
    `Was fällt an diesen ${sortiert.length} Trades auf? Interessant sind wiederkehrende`,
    "Kombinationen (Wochentag, Confluence, Anmerkung, Verlauf), nicht einzelne Ausreisser —",
    "und bitte dazuschreiben, wie viele Trades hinter einer Beobachtung stehen.",
  ];

  return [...kopf, ...zeilen, ...notizen, ...frage].join("\n") + "\n";
}
