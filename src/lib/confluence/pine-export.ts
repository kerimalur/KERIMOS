/**
 * Backtest-Trades als fertiges Pine-Script.
 *
 * Zweck: die eigenen Trades im TradingView-Chart sehen und daneben halten,
 * was ein Indikator zur selben Zeit angezeigt hat. Das beantwortet eine Frage,
 * die keine Tabelle beantwortet — ob ein Signal DA war, wo man eingestiegen
 * ist, sieht man am Chart in zwei Sekunden und in einer Statistik gar nicht.
 *
 * Gezeichnet wird über `xloc.bar_time`: die Marke sitzt am Zeitstempel, nicht
 * an einer Balkennummer. Damit stimmt sie auf jedem Timeframe — auf dem
 * 30-Minuten-Chart genauso wie auf dem Wochenchart. Alles auf einmal auf der
 * letzten Kerze, statt bei jedem Balken zu suchen.
 *
 * Rein Zeichenketten, keine Datenbank. Prüfbar in `tools/checks/pine.mts`.
 */

export interface ExportTrade {
  datum: string;
  paar: string;
  richtung: -1 | 1;
  ergebnis: string;
  r: number;
}

/** Pine kann höchstens so viele Labels zeichnen. */
export const MAX_LABELS = 500;

/** Wie ein Ergebnis in der Marke abgekürzt wird. */
export const KURZ: Record<string, string> = {
  full_tp: "TP", teil_tp_be: "T/BE", sl: "SL", breakeven: "BE", skip: "—",
};

const iso = (d: string) => `${d.slice(0, 10)}T00:00`;

/** Anführungszeichen und Zeilenumbrüche entschärfen. */
const sicher = (t: string) => t.replace(/[\\"]/g, "").replace(/\s+/g, " ").trim();

export interface PineErgebnis {
  quelltext: string;
  /** Wie viele Trades tatsächlich drinstehen. */
  anzahl: number;
  /** Wie viele wegen der Pine-Grenze weggelassen wurden. */
  weggelassen: number;
}

/**
 * Erzeugt ein eigenständiges Pine-v6-Skript.
 *
 * Über der Kerze sitzen die Shorts, darunter die Longs — dieselbe Konvention
 * wie überall im Projekt. Gewinner grün, Verlierer rot, Break-even grau; die
 * Farbe kommt aus dem R, nicht aus dem Ergebnis-Etikett, damit ein Teil-TP
 * mit negativem R nicht fälschlich grün aussieht.
 */
export function bauePineSkript(
  trades: ExportTrade[], titel = "GVA Backtest-Trades",
): PineErgebnis {
  const sortiert = [...trades]
    .filter((t) => t.ergebnis !== "skip" && /^\d{4}-\d{2}-\d{2}/.test(t.datum))
    .sort((a, b) => a.datum.localeCompare(b.datum));

  const drin = sortiert.slice(0, MAX_LABELS);
  const weggelassen = sortiert.length - drin.length;

  if (drin.length === 0) {
    return {
      quelltext: "// Keine gewerteten Trades zum Exportieren.\n",
      anzahl: 0, weggelassen: 0,
    };
  }

  const zeit = drin.map((t) => `timestamp("${iso(t.datum)}")`).join(", ");
  const dir = drin.map((t) => String(t.richtung)).join(", ");
  const txt = drin.map((t) =>
    `"${sicher(`${t.richtung > 0 ? "LONG" : "SHORT"} ${KURZ[t.ergebnis] ?? t.ergebnis} `
      + `${t.r > 0 ? "+" : ""}${t.r.toFixed(2)}R`)}"`).join(", ");
  const r = drin.map((t) => t.r.toFixed(2)).join(", ");
  const paare = [...new Set(drin.map((t) => t.paar))].join(", ");

  const quelltext = `//@version=6
// =====================================================================
//  ${titel}
//
//  Aus KerimOS exportiert. ${drin.length} Trades${weggelassen > 0
    ? `, ${weggelassen} weggelassen (Pine zeichnet hoechstens ${MAX_LABELS} Labels)` : ""}.
//  Paare: ${paare}
//
//  Longs stehen UNTER der Kerze, Shorts DARUEBER. Die Farbe kommt aus dem
//  erreichten R, nicht aus dem Ergebnis-Etikett - ein Teil-TP mit negativem
//  R soll nicht gruen aussehen.
//
//  Das Skript filtert NICHT nach Symbol. Leg es auf das Paar, das du
//  ausgewertet hast; auf einem anderen Chart sitzen die Marken zwar
//  zeitlich richtig, meinen aber ein anderes Instrument.
// =====================================================================
indicator("${sicher(titel)}", overlay = true, max_labels_count = ${MAX_LABELS})

zeigeLong  = input.bool(true,  "Longs zeigen")
zeigeShort = input.bool(true,  "Shorts zeigen")
nurGewinn  = input.bool(false, "Nur Gewinner")
nurVerlust = input.bool(false, "Nur Verlierer")
groesse    = input.string("normal", "Groesse", options = ["tiny", "small", "normal", "large"])

var array<int>    tZeit = array.from(${zeit})
var array<int>    tDir  = array.from(${dir})
var array<string> tText = array.from(${txt})
var array<float>  tR    = array.from(${r})

f_groesse() =>
    groesse == "tiny" ? size.tiny : groesse == "small" ? size.small : groesse == "large" ? size.large : size.normal

// Alles auf der letzten Kerze zeichnen: ueber xloc.bar_time sitzt jede Marke
// an ihrem Zeitstempel, unabhaengig vom Timeframe des Charts.
if barstate.islast
    for i = 0 to array.size(tZeit) - 1
        int   d = array.get(tDir, i)
        float r = array.get(tR, i)
        bool  zeigen = (d > 0 ? zeigeLong : zeigeShort)
             and (not nurGewinn  or r > 0)
             and (not nurVerlust or r < 0)
        if zeigen
            color c = r > 0 ? color.new(#26a69a, 20) : r < 0 ? color.new(#ef5350, 20) : color.new(color.gray, 30)
            label.new(array.get(tZeit, i), na, array.get(tText, i), xloc = xloc.bar_time, yloc = d > 0 ? yloc.belowbar : yloc.abovebar, style = d > 0 ? label.style_label_up : label.style_label_down, color = c, textcolor = color.white, size = f_groesse())
`;

  return { quelltext, anzahl: drin.length, weggelassen };
}

/** Dieselben Trades als CSV — zum Weiterrechnen ausserhalb. */
export function baueCsv(trades: ExportTrade[]): string {
  const kopf = "datum;paar;richtung;ergebnis;r";
  const zeilen = [...trades]
    .sort((a, b) => a.datum.localeCompare(b.datum))
    .map((t) => [
      t.datum.slice(0, 10), t.paar,
      t.richtung > 0 ? "long" : "short",
      t.ergebnis, t.r.toFixed(2),
    ].join(";"));
  return [kopf, ...zeilen].join("\n");
}
