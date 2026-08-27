// Kontrollwerte für den Markdown-Export.
// Aufruf:  npx -y tsx tools/checks/markdown.mts
//
// Der wichtigste Test steht unten: eine Notiz mit einem Pipe-Zeichen darf die
// Tabelle nicht zerlegen. Genau das passiert sonst still — die Ausgabe sieht
// im Textfeld richtig aus und rutscht erst beim Gegenüber auseinander.
import { baueMarkdown } from "../../src/lib/backtest-markdown";
import type { NativeBacktestTrade } from "../../src/lib/backtest-types";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

let lauf = 0;
const t = (
  teile: Partial<NativeBacktestTrade> = {},
): NativeBacktestTrade => ({
  id: `t${lauf++}`, occurred_on: "2026-05-04", pair: "GBPAUD", direction: "long",
  result: "sl", r_multiple: -1, rr_geplant: 3, notiz: null,
  tradingview_link: null, screenshot_url: null, session_id: null,
  gegenlauf: null, vorlauf: null, tags: [],
  ...teile,
});

const opt = (bestand: NativeBacktestTrade[]) =>
  ({ paar: "GBPAUD", auswahl: "nur SL", bestand });

/* ------------------------------------------------------------- Grundform */

const leer = baueMarkdown([], opt([]));
check("leere Auswahl sagt das auch", leer.includes("Kein Trade in dieser Auswahl"), true);
check("und traegt trotzdem die Ueberschrift", leer.startsWith("# Backtest GBPAUD"), true);

const einer = t({ vorlauf: "ueber_1", notiz: "Einstieg zu frueh" });
const md = baueMarkdown([einer], opt([einer, t({ result: "full_tp", r_multiple: 2.4 })]));

check("Kontextblock ist dabei", md.includes("Ein Stopout kostet immer genau"), true);
check("Bestand wird eingeordnet", md.includes("2 Trades — 1 Full TP"), true);
check("Anzahl steht in der Ueberschrift", md.includes("(1 Trades)"), true);
check("Wochentag wird gerechnet", md.includes("| Mo |"), true);
check("Vorlauf steht als Vorlauf da", md.includes("vor: über 1 R"), true);
check("Notizen bekommen einen eigenen Abschnitt", md.includes("## Notizen"), true);
check("und die Frage steht am Schluss", md.trimEnd().includes("## Frage"), true);

/* ----------------------------------------------------- Verlauf und Ergebnis */

const gewinner = t({ result: "full_tp", r_multiple: 2.4, gegenlauf: "knapp" });
check("beim Gewinner steht die Gegenbewegung",
  baueMarkdown([gewinner], opt([gewinner])).includes("gegen: knapp am Stop"), true);

// Eine Angabe im falschen Feld darf nicht auftauchen: bei einem Stopout ist die
// Gegenbewegung definitionsgemaess 1 R und sagt nichts.
const verdreht = t({ result: "sl", gegenlauf: "knapp" });
check("Gegenbewegung an einem Stopout wird nicht gezeigt",
  baueMarkdown([verdreht], opt([verdreht])).includes("gegen: knapp"), false);

/* ------------------------------------------------------------- Tabellensatz */

const mitPipe = t({ notiz: "erst | dann", tags: [
  { tagId: "1", label: "Typ | A", categoryKey: "gva_typ" },
] });
const mdPipe = baueMarkdown([mitPipe], opt([mitPipe]));
check("Pipe im Tag zerlegt die Tabelle nicht", mdPipe.includes("Typ / A"), true);
check("Pipe in der Notiz ebenso", mdPipe.includes("erst / dann"), true);

const zeilen = mdPipe.split("\n").filter((z) => z.startsWith("| ") && !z.startsWith("|---"));
check("Kopf und eine Datenzeile", zeilen.length, 2);
check("beide haben gleich viele Spalten",
  zeilen[0].split("|").length === zeilen[1].split("|").length, true);

/* ------------------------------------------------------------------ Chart */

const mitChart = t({ tradingview_link: "https://www.tradingview.com/x/AbC123/" });
check("aus dem TradingView-Link wird die Bild-URL",
  baueMarkdown([mitChart], opt([mitChart])).includes(
    "https://s3.tradingview.com/snapshots/a/AbC123.png"), true);

const ohneBild = t({ tradingview_link: "https://example.com/chart" });
check("ein nicht ableitbarer Link bleibt ein Link",
  baueMarkdown([ohneBild], opt([ohneBild])).includes("[Link](https://example.com/chart)"), true);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
