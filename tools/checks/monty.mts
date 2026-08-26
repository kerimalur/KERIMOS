// Kontrollwerte für die COT-Statistik auf der Monty-Seite.
// Aufruf:  npx -y tsx tools/checks/monty.mts
//
// Der Punkt dieser Datei ist die Frage, die man sich beim ersten Blick auf ein
// Perzentil nicht stellt: ist eine Streckung selten oder normal? Ein Signal,
// das in jeder dritten Woche auftritt, ist kein Extrem — und dann sagt
// "Commercials im 80. Perzentil" wenig.
import { plusTage, type Punkt } from "../../src/lib/confluence/reihen";
import { cotStatistik, HAEUFIG_AB } from "../../src/lib/confluence/monty-cot";
import {
  cotPaarZeilen, type CotBild, type CotRohdaten,
} from "../../src/lib/confluence/cot-divergenz";

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

/* ------------------------------------------------- Paar-Ansicht (24.08.2026) */

// Ein Waehrungsbild von Hand, nur mit dem, worauf die Paar-Rechnung schaut.
const bild = (ccy: string, divergenz: -1 | 0 | 1): CotBild => ({
  ccy, kommRang: divergenz > 0 ? 90 : divergenz < 0 ? 10 : 50,
  retailRang: divergenz > 0 ? 10 : divergenz < 0 ? 90 : 50,
  kommN: 156, retailN: 156, datum: "2026-08-18", frische: "frisch",
  divergenz, text: "",
});
const karte = (eintraege: [string, -1 | 0 | 1][]) =>
  new Map<string, CotBild>(eintraege.map(([c, d]) => [c, bild(c, d)]));

const eur_usd = (b: -1 | 0 | 1, q: -1 | 0 | 1) =>
  cotPaarZeilen(karte([["EUR", b], ["USD", q]]), ["EURUSD"])[0];

check("beide gestreckt, gegeneinander → volles Long", eur_usd(1, -1).urteil.dir, 1);
check("und das ist volle Staerke", eur_usd(1, -1).urteil.staerke, 1);
check("nur die Basis gestreckt → halbe Staerke", eur_usd(1, 0).urteil.staerke, 0.5);
// Der Fall, um den es Kerim geht: gleich gestreckte Beine loeschen sich aus.
check("gleiche Richtung hebt sich im Paar auf", eur_usd(1, 1).urteil.dir, 0);
check("aber die Basis allein sagt weiter etwas", eur_usd(1, 1).nurBasis, 1);
check("und genau das ist ein Widerspruch", eur_usd(1, 1).widerspruch, true);

// Widerspruch heisst NICHT „ungleich".
check("beide einig, obwohl nur die Basis spricht → kein Widerspruch",
  eur_usd(1, 0).widerspruch, false);
check("sagt keine Sicht etwas, ist nichts strittig", eur_usd(0, 0).widerspruch, false);
// Das Signal kommt allein vom Gegenbein — TradingView zeigt dann nichts.
check("stille Basis bei sprechendem Paar ist strittig",
  eur_usd(0, -1).widerspruch, true);
check("gegenlaeufige Beine sind einig", 
  cotPaarZeilen(karte([["EUR", 1], ["USD", -1]]), ["EURUSD"])[0].widerspruch, false);

// Unbekannte Waehrung faellt lautlos raus statt eine halbe Zeile zu bauen.
check("Paar ohne Bilder faellt raus",
  cotPaarZeilen(karte([["EUR", 1]]), ["EURUSD"]).length, 0);

// Reihenfolge: Widersprueche zuerst, dann Staerke.
const sortiert = cotPaarZeilen(
  karte([["EUR", 1], ["USD", 1], ["GBP", 1], ["JPY", -1], ["AUD", 0], ["CHF", 0]]),
  ["AUDCHF", "USDJPY", "GBPUSD", "EURUSD"],
).map((z) => z.paar);
check("Strittige stehen ganz oben, alphabetisch", sortiert.slice(0, 2), ["EURUSD", "GBPUSD"]);
check("dann das volle Signal", sortiert[2], "USDJPY");
check("Paare ohne Aussage zuletzt", sortiert[sortiert.length - 1], "AUDCHF");

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
