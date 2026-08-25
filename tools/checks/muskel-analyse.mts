// Kontrollwerte für die Gym-Analyse (ab 24.08.2026).
// Aufruf:  npx -y tsx tools/checks/muskel-analyse.mts
import {
  saetze, proWoche, urteil, grenzenFuer, rampe, alsHex, alsZahl,
  STANDARD, OHNE_KOERPER,
} from "../../src/lib/muskel-analyse";
import { MUSKELN, AM_KOERPER, GERUEST, ansichtName } from "../../src/lib/koerper-teile";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

// --- Nebenmuskeln zählen halb. Der Kern der Entscheidung vom 24.08.
const bank = { direkt: 12, indirekt: 9 };
check("nur Hauptmuskel", saetze(bank, false), 12);
check("mit Nebenmuskeln halb", saetze(bank, true), 16.5);
check("ohne Nebenmuskeln macht der Schalter nichts",
  saetze({ direkt: 8, indirekt: 0 }, true), 8);

// --- Umrechnung auf die Woche. Ohne sie waere „letzter Monat" gegen
//     „letzte Woche" nicht vergleichbar und jede Umschaltung ergaebe ein
//     anderes Urteil ueber dieselbe Gewohnheit.
check("Woche bleibt Woche", proWoche(14, 7), 14);
check("Monat wird geteilt", proWoche(56, 28), 14);
check("zwei Monate", proWoche(112, 56), 14);
check("Zeitraum 0 gibt 0", proWoche(14, 0), 0);

// --- Urteil
check("in der Mitte", urteil(14), "rahmen");
check("genau auf der Untergrenze zaehlt als drin", urteil(10), "rahmen");
check("genau auf der Obergrenze zaehlt als drin", urteil(20), "rahmen");
check("knapp darunter", urteil(9), "knapp");
check("die Haelfte der Untergrenze ist die Schwelle", urteil(5), "knapp");
check("darunter ist deutlich zu wenig", urteil(4.9), "wenig");
check("nichts trainiert", urteil(0), "wenig");
check("darueber", urteil(21), "viel");

// Eigene Grenzen schlagen die Faustregel — sonst waere die Einstellung
// eine Anzeige ohne Wirkung.
const eigene = { waden: { min: 6, max: 12 } };
check("eigene Grenze greift", urteil(8, grenzenFuer("waden", eigene)), "rahmen");
check("mit Faustregel waere dasselbe zu wenig", urteil(8, STANDARD), "knapp");
check("unbekannte Gruppe faellt auf die Vorgabe", grenzenFuer("xyz", eigene), STANDARD);

// Kaputte Werte duerfen keine Gruppe fuer immer als „ueber dem Rahmen"
// markieren.
check("verdrehte Grenze faellt zurueck",
  grenzenFuer("a", { a: { min: 20, max: 5 } }), STANDARD);
check("gleiche Grenzen fallen zurueck",
  grenzenFuer("a", { a: { min: 10, max: 10 } }), STANDARD);
check("negative Grenze faellt zurueck",
  grenzenFuer("a", { a: { min: -5, max: 10 } }), STANDARD);
check("Unsinn faellt zurueck",
  grenzenFuer("a", { a: { min: NaN, max: 10 } }), STANDARD);

// --- Rampe: dunkel nach hell, monoton. Auf dunklem Grund ist hell das
//     „mehr" — laeuft die Helligkeit irgendwo zurueck, liest man die Farbe
//     falsch herum.
const hell = (n: number) => rampe(n).reduce((s, v) => s + v, 0);
let monoton = true;
for (let i = 1; i <= 25; i++) if (hell(i) < hell(i - 1)) monoton = false;
check("Rampe wird durchgehend heller", monoton, true);
check("null ist der dunkelste Wert", alsHex(rampe(0)), "#2a2219");
check("ueber 22 bleibt es beim hellsten", alsHex(rampe(99)), alsHex(rampe(22)));
check("negativ wird wie null behandelt", alsHex(rampe(-5)), alsHex(rampe(0)));
check("Zahl fuer three.js", alsZahl([0xE7, 0xA9, 0x6B]), 0xE7A96B);

// --- Koerper: die Gruppen am Modell muessen die aus der Datenbank sein,
//     minus die ohne Koerperteil. Faellt eine raus, waere sie unsichtbar,
//     ohne dass irgendetwas fehlschlaegt.
const AUS_DATENBANK = ["Schultern", "Bizeps", "Trizeps", "Core", "Brust", "Rücken",
  "Waden", "Quadrizeps", "Hamstrings", "Gesäß", "Cardio"];
check("alle Gruppen ausser Cardio sind am Modell",
  [...AM_KOERPER].sort(),
  AUS_DATENBANK.filter((g) => !OHNE_KOERPER.includes(g)).sort());
check("jede Gruppe hat mindestens einen Bauch",
  Object.values(MUSKELN).every((t) => t.length > 0), true);
check("Geruest ist da", GERUEST.length > 10, true);

// Links und rechts muessen paarweise sein: eine Gruppe, die nur auf einer
// Seite sitzt, sieht nach einem Modellfehler aus, nicht nach einer Aussage.
const unpaarig = Object.entries(MUSKELN).filter(([, teile]) => {
  const x = teile.map((t) => Number(t.p[0].toFixed(3)));
  return x.some((v) => v !== 0 && !x.includes(-v));
}).map(([k]) => k);
check("kein Bauch ohne Gegenstueck", unpaarig, []);

check("Blickrichtung vorne", ansichtName(0), "Vorne");
check("Blickrichtung hinten", ansichtName(Math.PI), "Hinten");
check("Blickrichtung auch nach mehreren Umdrehungen",
  ansichtName(Math.PI + 4 * Math.PI), "Hinten");
check("negative Drehung", ansichtName(-Math.PI), "Hinten");

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
