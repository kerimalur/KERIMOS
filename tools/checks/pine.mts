// Kontrollwerte für den Pine-Export.
// Aufruf:  npx -y tsx tools/checks/pine.mts
//
// Ein Export, der stumm falsche Marken zeichnet, ist schlimmer als keiner:
// man gleicht dann Trades mit dem Chart ab, die es so nie gab. Deshalb wird
// hier vor allem geprueft, was NICHT im Skript landet.
import {
  bauePineSkript, baueCsv, MAX_LABELS, type ExportTrade,
} from "../../src/lib/confluence/pine-export";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const t = (p: Partial<ExportTrade> = {}): ExportTrade => ({
  datum: "2026-03-27", paar: "GBPAUD", richtung: 1,
  ergebnis: "full_tp", r: 1.46, ...p,
});

const skript = bauePineSkript([t(), t({ richtung: -1, ergebnis: "sl", r: -1 })]);

check("zwei Trades sind drin", skript.anzahl, 2);
check("Version steht oben", skript.quelltext.startsWith("//@version=6"), true);
check("Zeitstempel im Pine-Format",
  skript.quelltext.includes('timestamp("2026-03-27T00:00")'), true);
check("Longs unter, Shorts ueber der Kerze",
  skript.quelltext.includes("yloc.belowbar") && skript.quelltext.includes("yloc.abovebar"), true);
check("ueber bar_time gezeichnet", skript.quelltext.includes("xloc.bar_time"), true);
check("Richtungen stehen drin", skript.quelltext.includes("array.from(1, -1)"), true);

// Skips haben kein Ergebnis und gehoeren nicht auf den Chart.
check("Skips fliegen raus",
  bauePineSkript([t({ ergebnis: "skip" }), t()]).anzahl, 1);
check("kaputte Daten fliegen raus",
  bauePineSkript([t({ datum: "keins" }), t()]).anzahl, 1);
check("ganz ohne Trades kein halbes Skript",
  bauePineSkript([]).quelltext.includes("Keine gewerteten Trades"), true);

// Anfuehrungszeichen aus einer Notiz wuerden das Skript zerreissen.
check("Anfuehrungszeichen werden entschaerft",
  bauePineSkript([t({ ergebnis: 'x"y' })]).quelltext.includes('x"y'), false);

// Pine zeichnet hoechstens MAX_LABELS - lieber sichtbar weglassen als still
// abschneiden.
const viele = bauePineSkript(
  Array.from({ length: MAX_LABELS + 20 }, (_, i) =>
    t({ datum: `2020-01-${String((i % 28) + 1).padStart(2, "0")}` })));
check("Grenze wird eingehalten", viele.anzahl, MAX_LABELS);
check("und das Weggelassene benannt", viele.weggelassen, 20);
check("der Hinweis steht im Kopf",
  viele.quelltext.includes("weggelassen"), true);

// Chronologisch, damit die aeltesten wegfallen und nicht zufaellige.
const sortiert = bauePineSkript([
  t({ datum: "2026-05-01" }), t({ datum: "2021-01-05" }),
]);
check("chronologisch sortiert",
  sortiert.quelltext.indexOf("2021-01-05") < sortiert.quelltext.indexOf("2026-05-01"), true);

/* ------------------------------------------------------------------ CSV */

const csv = baueCsv([t(), t({ richtung: -1, ergebnis: "sl", r: -1 })]);
check("CSV hat Kopf und zwei Zeilen", csv.split("\n").length, 3);
check("Semikolon getrennt", csv.split("\n")[0], "datum;paar;richtung;ergebnis;r");
check("Richtung ausgeschrieben", csv.includes(";long;") && csv.includes(";short;"), true);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
