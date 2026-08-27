// Kontrollwerte für die Verlaufs-Auswertung (wie knapp war es).
// Aufruf:  npx -y tsx tools/checks/verlauf.mts
//
// Der wichtigste Test steht unten: ein Stopout darf NIE in den Gegenlauf-Block
// fallen und ein Full TP nie in den Vorlauf-Block. Sonst mischte die Tabelle
// zwei Fragen, deren Antwort bei diesen Ergebnissen ohnehin feststeht — und
// niemand würde es der Verteilung ansehen.
import {
  verlaufBilanz, verlaufFeld, verlaufReihe, MIN_VERLAUF,
  GEGENLAUF_REIHE, VORLAUF_REIHE,
  type Gegenlauf, type NativeBacktestTrade, type Vorlauf,
} from "../../src/lib/backtest-types";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

let lauf = 0;
const t = (
  result: NativeBacktestTrade["result"],
  gegenlauf: Gegenlauf | null = null,
  vorlauf: Vorlauf | null = null,
): NativeBacktestTrade => ({
  id: `t${lauf++}`, occurred_on: "2026-05-01", pair: "GBPAUD", direction: "long",
  result, r_multiple: null, rr_geplant: null, notiz: null,
  tradingview_link: null, screenshot_url: null, session_id: null,
  gegenlauf, vorlauf, tags: [],
});

/* --------------------------------------------------------- Zuordnung */

check("Full TP fragt nach der Gegenbewegung", verlaufFeld("full_tp"), "gegenlauf");
check("Teil-TP ebenso", verlaufFeld("teil_tp_be"), "gegenlauf");
check("Stopout fragt nach dem Vorlauf", verlaufFeld("sl"), "vorlauf");
check("Breakeven auch", verlaufFeld("breakeven"), "vorlauf");
check("Skip fragt gar nichts", verlaufFeld("skip"), null);

/* ------------------------------------------------- Welche Klassen gelten */

// Break-even wird erst ab dem -0.27er FIP-Level gesetzt. Ein BE-Trade war
// damit per Regel im Plus — "nie im Plus" darf dort nicht wählbar sein.
check("Breakeven kennt kein 'nie im Plus'",
  verlaufReihe("breakeven"), VORLAUF_REIHE.filter((v) => v !== "kein"));
check("Stopout behaelt alle Vorlauf-Klassen", verlaufReihe("sl"), VORLAUF_REIHE);
check("Full TP bekommt die Gegenlauf-Reihe", verlaufReihe("full_tp"), GEGENLAUF_REIHE);
check("Teil-TP ebenso", verlaufReihe("teil_tp_be"), GEGENLAUF_REIHE);
check("Skip bekommt nichts", verlaufReihe("skip"), []);

/* ------------------------------------------------------------ Aufbau */

const leer = verlaufBilanz([]);
check("zwei Bloecke, Verlierer zuerst", leer.map((b) => b.feld), ["vorlauf", "gegenlauf"]);
check("leere Bilanz zaehlt nichts", leer.map((b) => b.erfasst), [0, 0]);
check("und gibt keinen Befund", leer.map((b) => b.befund), [null, null]);
check("alle Gegenlauf-Klassen erscheinen",
  leer[1].klassen.map((k) => k.key), GEGENLAUF_REIHE);
check("alle Vorlauf-Klassen erscheinen",
  leer[0].klassen.map((k) => k.key), VORLAUF_REIHE);

/* ------------------------------------------------- Nenner und Anteile */

const gemischt = verlaufBilanz([
  t("sl", null, "ueber_1"), t("sl", null, "kein"), t("sl", null, null),
  t("full_tp", "knapp"), t("full_tp", null),
  t("skip"),
]);
const vor = gemischt[0];
const gegen = gemischt[1];

check("drei Stopouts gelten fuer den Vorlauf", vor.gilt, 3);
check("davon zwei erfasst", vor.erfasst, 2);
check("nicht Erfasstes bleibt aus dem Nenner",
  vor.klassen.find((k) => k.key === "ueber_1")!.anteil, 0.5);
check("zwei Gewinner gelten fuer den Gegenlauf", gegen.gilt, 2);
check("davon einer erfasst", gegen.erfasst, 1);
check("Skips gelten nirgends", vor.gilt + gegen.gilt, 5);

// Der zentrale Test: eine Angabe im falschen Feld darf nicht mitzaehlen.
const verdreht = verlaufBilanz([t("sl", "knapp", null), t("full_tp", null, "ueber_1")]);
check("Gegenlauf an einem Stopout zaehlt nicht", verdreht[1].erfasst, 0);
check("Vorlauf an einem Full TP zaehlt nicht", verdreht[0].erfasst, 0);

/* ------------------------------------------------------------ Befunde */

const wenige = verlaufBilanz(
  Array.from({ length: MIN_VERLAUF - 1 }, () => t("sl", null, "ueber_1")),
);
check("unter der Mindestzahl kein Befund", wenige[0].befund, null);

const ausstieg = verlaufBilanz([
  ...Array.from({ length: 5 }, () => t("sl", null, "ueber_1")),
  ...Array.from({ length: 5 }, () => t("sl", null, "kein")),
]);
check("die Haelfte stand ueber 1 R im Plus -> Ausstiegsproblem",
  ausstieg[0].befund!.includes("Ausstiegsproblem"), true);

const einstieg = verlaufBilanz([
  ...Array.from({ length: 8 }, () => t("sl", null, "kein")),
  ...Array.from({ length: 2 }, () => t("sl", null, "bis_05")),
]);
check("meist nie im Plus -> Einstieg",
  einstieg[0].befund!.includes("Einstieg"), true);

const knapp = verlaufBilanz([
  ...Array.from({ length: 3 }, () => t("full_tp", "knapp")),
  ...Array.from({ length: 7 }, () => t("full_tp", "bis_05")),
]);
check("jeder vierte Gewinner knapp am Stop faellt auf",
  knapp[1].befund!.includes("knapp am Stop"), true);

const luft = verlaufBilanz(
  Array.from({ length: 10 }, (_, i) => t("full_tp", i < 8 ? "bis_025" : "bis_05")),
);
check("kaum Gegenbewegung -> Stop hat Luft",
  luft[1].befund!.includes("Luft"), true);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
