// Kontrollwerte für die Nährwert-Ringe (Essen, ab 24.08.2026).
// Aufruf:  npx -y tsx tools/checks/naehrwerte.mts
import {
  zieleAus, anteil, darueber, uebrig, lage, zahl, GRUNDZIEL,
} from "../../src/lib/naehrwerte";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const keys = (s: Record<string, string>) => zieleAus(s).map((z) => z.key);

// --- Welche Ringe erscheinen. Das ist der Kern: KH und Fett NUR wenn angelegt.
check("ohne Einstellungen nur kcal und Protein", keys({}), ["kcal", "protein"]);
check("leerer String zaehlt nicht als Ziel",
  keys({ kh_ziel: "", fett_ziel: "  " }), ["kcal", "protein"]);
check("Null ist kein Ziel", keys({ kh_ziel: "0" }), ["kcal", "protein"]);
check("Unsinn ist kein Ziel", keys({ fett_ziel: "abc" }), ["kcal", "protein"]);
check("negativ ist kein Ziel", keys({ kh_ziel: "-50" }), ["kcal", "protein"]);
check("KH allein reicht", keys({ kh_ziel: "220" }), ["kcal", "protein", "kh"]);
check("beide angelegt", keys({ kh_ziel: "220", fett_ziel: "60" }),
  ["kcal", "protein", "kh", "fett"]);
check("Komma statt Punkt", zahl("62,5"), 62.5);

// --- Das Tagesziel darf NUR von aussen kommen, wenn es übergeben wird.
//     Sonst gäbe es zwei Stellen, die es bestimmen — genau der Fehler, bei dem
//     „Heute" 2480 zeigte und der Plan 2100.
check("Bonus-Ziel schlaegt die Einstellung",
  zieleAus({ kcal_ziel: "2100" }, 2480)[0].ziel, 2480);
check("ohne Bonus gilt die Einstellung",
  zieleAus({ kcal_ziel: "2100" })[0].ziel, 2100);
check("ohne alles das Grundziel", zieleAus({})[0].ziel, GRUNDZIEL.kcal);

// --- Ring
check("halb voll", anteil(1050, 2100), 0.5);
check("ueber dem Ziel bleibt der Ring voll", anteil(4200, 2100), 1);
check("negativ gibt es nicht", anteil(-5, 2100), 0);
check("ohne Ziel keine Fuellung", anteil(500, 0), 0);
check("drueber in Zahlen", darueber(2360, 2100), 260);
check("nicht drueber ist 0", darueber(1900, 2100), 0);
check("uebrig", uebrig(1240, 2100), 860);
check("uebrig ist nie negativ", uebrig(2360, 2100), 0);

// --- Farbe. Mehr Protein als geplant ist im Cut kein Fehler, mehr Kalorien schon.
check("Protein drueber ist gut", lage("protein", 180, 150), "gut");
check("Kalorien drueber ist drueber", lage("kcal", 2360, 2100), "drueber");
check("90 Prozent zaehlen als erreicht", lage("kcal", 1890, 2100), "gut");
check("knapp darunter ist offen", lage("kcal", 1880, 2100), "offen");
check("ohne Ziel immer offen", lage("kh", 200, 0), "offen");

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
