// Kontrollwerte für die COT-Statistik auf der Monty-Seite.
// Aufruf:  npx -y tsx tools/checks/monty.mts
//
// Der Punkt dieser Datei ist die Frage, die man sich beim ersten Blick auf ein
// Perzentil nicht stellt: ist eine Streckung selten oder normal? Ein Signal,
// das in jeder dritten Woche auftritt, ist kein Extrem — und dann sagt
// "Commercials im 80. Perzentil" wenig.
import { plusTage, type Punkt } from "../../src/lib/confluence/reihen";
import { cotStatistik, HAEUFIG_AB } from "../../src/lib/confluence/monty-cot";
import type { CotRohdaten } from "../../src/lib/confluence/cot-divergenz";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const STICHTAG = "2026-08-14";
const START = "2024-01-02";

/** 120 Wochenwerte; `ende` faerbt die letzten `wieViele` Berichte. */
const reihe = (mitte: number, ende: number, wieViele: number): Punkt[] =>
  Array.from({ length: 120 }, (_, i) => ({
    datum: plusTage(START, i * 7),
    wert: i >= 120 - wieViele ? ende : mitte + (i % 10),
  }));

const daten = (kommEnde: number, retailEnde: number, wieViele: number): CotRohdaten => ({
  cotKomm: { EUR: reihe(0, kommEnde, wieViele) },
  cotRetail: { EUR: reihe(0, retailEnde, wieViele) },
});

/* ------------------------------------------------------------ Zaehlung */

// Nur die letzten 3 Berichte gestreckt: selten.
const selten = cotStatistik(daten(999, -999, 3), "EUR", STICHTAG);
check("Termine werden gezaehlt", selten.termine > 100, true);
check("gestreckte Termine gezaehlt", selten.gestreckt, 3);
check("Richtung wird aufgeteilt", [selten.dafuer, selten.dagegen], [3, 0]);
check("laengste Phase", selten.laengste, 3);
check("Anteil ist klein", (selten.anteil ?? 1) < HAEUFIG_AB, true);
check("und der Satz nennt es selten", selten.satz.includes("Selten genug"), true);

// Regelmaessig gestreckt: das ist kein Extrem mehr. Genau diese Warnung ist der
// Grund fuer die ganze Statistik.
//
// Die Dichte ist mit Bedacht gewaehlt. Steht ein Wert in einem Anteil f des
// Fensters ganz oben, ist sein eigener Rang nur noch 1 − f/2 — wer die Reihe
// zu dicht mit Extremen fuellt, macht sie damit zum Mittelmass und misst am
// Ende gar keine Streckung mehr. Drei von sieben ist der Bereich, in dem
// beides gleichzeitig gilt: haeufig UND immer noch am Rand.
const wiederholt = (mitte: number, ende: number): Punkt[] =>
  Array.from({ length: 120 }, (_, i) => ({
    datum: plusTage(START, i * 7),
    wert: i % 7 < 3 ? ende : mitte + (i % 5),
  }));
const haeufig = cotStatistik({
  cotKomm: { EUR: wiederholt(0, 999) },
  cotRetail: { EUR: wiederholt(0, -999) },
}, "EUR", STICHTAG);
check("haeufige Streckung wird als Normalzustand benannt",
  haeufig.satz.includes("Normalzustand"), true);
check("Anteil ueber der Schwelle", (haeufig.anteil ?? 0) > HAEUFIG_AB, true);

// Gar keine Streckung.
const nie = cotStatistik(daten(5, 5, 3), "EUR", STICHTAG);
check("ohne Streckung ist gestreckt null", nie.gestreckt, 0);
check("Anteil ist null", nie.anteil, 0);
check("laengste Phase null", nie.laengste, 0);
check("und der Satz sagt es", nie.satz.includes("keine Streckung"), true);

/* -------------------------------------------------------------- Raender */

check("ohne Daten keine Statistik",
  cotStatistik({}, "EUR", STICHTAG).termine, 0);
check("und der Satz nennt den Grund",
  cotStatistik({}, "EUR", STICHTAG).satz.includes("Zu wenig"), true);
check("der aktuelle Stand kommt trotzdem mit",
  cotStatistik({}, "EUR", STICHTAG).jetzt.ccy, "EUR");

// Termine NACH dem Stichtag duerfen nicht mitzaehlen — sonst wuesste die
// Statistik, was nach ihrem eigenen Stichtag passiert ist.
const frueher = cotStatistik(daten(999, -999, 3), "EUR", "2025-01-01");
check("Termine nach dem Stichtag zaehlen nicht", frueher.termine < selten.termine, true);
check("und die spaete Streckung ist nicht dabei", frueher.gestreckt, 0);

check("Fenster laesst sich begrenzen",
  cotStatistik(daten(999, -999, 3), "EUR", STICHTAG, 10).termine, 10);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
