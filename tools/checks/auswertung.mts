// Kontrollwerte für die ergebnis-orientierte Auswertung.
// Aufruf:  npx -y tsx tools/checks/auswertung.mts
//
// Der wichtigste Test steht in der Mitte: eine Dimension, die bei den Gewinnern
// GENAUSO oft dafuer stand wie ueberall, darf NICHT auffaellig sein. Ohne
// Grundrate liest man 62 % als Befund, obwohl 62 % der Normalfall ist.
import {
  nachErgebnis, nachDimension, dimensionenAus, DIM_STANDARD, DIM_ALLE,
  MIN_JE_SEITE_DIM, type DimKey,
} from "../../src/lib/confluence/auswertung";
import type { TiefenTrade } from "../../src/lib/confluence/tiefe";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const t = (ergebnis: string, cot: -1 | 0 | 1, gewonnen: boolean | null, r = 0): TiefenTrade => ({
  id: Math.random().toString(36).slice(2),
  datum: "2026-05-01", paar: "GBPAUD", richtung: 1, r,
  gewonnen, urteil: "neutral", dafuer: 0, dagegen: 0, vetoAktiv: false,
  ergebnis, faktoren: [], link: null, cot: null,
  dims: [{ key: "cot", wert: cot }],
});

const ERG = [
  { key: "full_tp", label: "Full TP" },
  { key: "sl", label: "SL" },
];

/* ------------------------------------------------------------ Auswahl */

check("ohne Parameter gilt der Standard", dimensionenAus(null), DIM_STANDARD);
check("Veto ist NICHT im Standard", DIM_STANDARD.includes("veto"), false);
check("Confluence-Score auch nicht", DIM_STANDARD.includes("qscore"), false);
check("aber beide sind waehlbar",
  DIM_ALLE.includes("veto") && DIM_ALLE.includes("qscore"), true);
check("Unsinn wird verworfen", dimensionenAus("cot,quatsch"), ["cot"]);
// Eine ausdrueckliche Leer-Auswahl darf NICHT still auf den Standard zurueckfallen —
// sonst kann man die Dimensionen nie alle abwaehlen.
check("leere Auswahl bleibt leer", dimensionenAus("-"), []);

/* ---------------------------------------------------------- Grundrate */

// 8 von 10 Full TPs mit COT dafuer — und 8 von 10 SLs ebenfalls. Der Anteil
// ist hoch, die Aussage null.
const gleichVerteilt = [
  ...Array.from({ length: 8 }, () => t("full_tp", 1, true, 2)),
  ...Array.from({ length: 2 }, () => t("full_tp", -1, true, 2)),
  ...Array.from({ length: 8 }, () => t("sl", 1, false, -1)),
  ...Array.from({ length: 2 }, () => t("sl", -1, false, -1)),
];
const a1 = nachErgebnis(gleichVerteilt, ["cot"], ERG);
check("Grundrate wird gerechnet", a1.grundraten[0].anteil, 0.8);
check("Full TP hat denselben Anteil", a1.zeilen[0].dims[0].anteil, 0.8);
check("Abweichung ist null", a1.zeilen[0].dims[0].abweichung, 0);
check("und nichts ist auffaellig",
  a1.zeilen.every((z) => z.dims.every((d) => !d.auffaellig)), true);

// Jetzt echte Trennung: alle Gewinner dafuer, alle Verlierer dagegen.
const getrennt = [
  ...Array.from({ length: 25 }, () => t("full_tp", 1, true, 2)),
  ...Array.from({ length: 25 }, () => t("sl", -1, false, -1)),
];
const a2 = nachErgebnis(getrennt, ["cot"], ERG);
check("klare Trennung faellt auf", a2.zeilen[0].dims[0].auffaellig, true);
check("Abweichung zeigt nach oben", (a2.zeilen[0].dims[0].abweichung ?? 0) > 0, true);
check("und bei den SL nach unten", (a2.zeilen[1].dims[0].abweichung ?? 0) < 0, true);

// Stumme Trades gehoeren nicht in den Nenner: sonst saehe eine Quelle mit
// Luecken automatisch schlecht aus.
const mitStummen = [
  ...Array.from({ length: 5 }, () => t("full_tp", 1, true, 2)),
  ...Array.from({ length: 5 }, () => t("full_tp", 0, true, 2)),
];
const a3 = nachErgebnis(mitStummen, ["cot"], ERG);
check("stumme Trades bleiben aus dem Nenner", a3.zeilen[0].dims[0].anteil, 1);
check("werden aber ausgewiesen", a3.zeilen[0].dims[0].stumm, 5);
check("n zaehlt sie mit", a3.zeilen[0].n, 10);

check("ohne Dimensionen bleibt die Tabelle leer",
  nachErgebnis(getrennt, [], ERG).grundraten.length, 0);
check("jede Ergebnisklasse bekommt eine Zeile",
  nachErgebnis([], ["cot"], ERG).zeilen.map((z) => z.ergebnis), ["full_tp", "sl"]);

/* -------------------------------------------------- Dimension x Erfolg */

const erfolg = nachDimension(getrennt, ["cot"])[0];
check("dafuer und dagegen getrennt gezaehlt",
  [erfolg.dafuer.n, erfolg.dagegen.n], [25, 25]);
check("und die Trennung wird gemeldet", erfolg.satz.includes("trennt hier"), true);

const wenige = nachDimension([
  ...Array.from({ length: 5 }, () => t("full_tp", 1, true, 2)),
  ...Array.from({ length: 5 }, () => t("sl", -1, false, -1)),
], ["cot"])[0];
check("kleine Stichprobe sagt nichts", wenige.satz.includes("sagt der Vergleich nichts"), true);
check("Mindestgroesse ist gesetzt", MIN_JE_SEITE_DIM >= 15, true);

const jedeDim: DimKey[] = ["cot", "saison", "qscore", "veto"];
check("jede gewaehlte Dimension bekommt eine Zeile",
  nachDimension([], jedeDim).map((z) => z.key), jedeDim);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
