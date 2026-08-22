// Kontrollwerte fuer das Zerlegen von „Heute das Wichtigste".
// Aufruf:  npx -y tsx tools/checks/heute.mts
//
// Der Haken haengt am TEXT der Zeile, nicht an ihrer Nummer. Deshalb ist das
// Zerlegen keine Kosmetik: aendert es sich, verlieren alle gesetzten Haken
// ihren Bezug. Und ein zu eifriger Trenner (etwa an Kommas) macht aus einem
// Vorsatz drei halbe Aufgaben, die niemand abhaken will.
import { zuPunkten } from "../../src/lib/heute-punkte";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

check("leer", zuPunkten(""), []);
check("nur Leerzeichen", zuPunkten("   \n\n  "), []);
check("ein Satz bleibt einer", zuPunkten("Charts durchgehen"), ["Charts durchgehen"]);

// DAS ist der Fall, an dem ein naiver Trenner scheitert.
check("Komma trennt NICHT",
  zuPunkten("Chart durchgehen, dann Journal"),
  ["Chart durchgehen, dann Journal"]);

check("Zeilen trennen",
  zuPunkten("Charts durchgehen\nJournal nachtragen"),
  ["Charts durchgehen", "Journal nachtragen"]);

check("Spiegelstriche weg",
  zuPunkten("- Charts\n– Journal\n— Gym\n* Essen\n• Schlaf"),
  ["Charts", "Journal", "Gym", "Essen", "Schlaf"]);

check("Nummerierung weg",
  zuPunkten("1. Charts\n2) Journal\n10. Gym"),
  ["Charts", "Journal", "Gym"]);

check("Leerzeilen dazwischen fallen weg",
  zuPunkten("Charts\n\n\nJournal"), ["Charts", "Journal"]);

check("Windows-Zeilenenden",
  zuPunkten("Charts\r\nJournal"), ["Charts", "Journal"]);

// Zwei gleiche Zeilen waeren zwei Kaestchen, die immer gemeinsam umspringen —
// weil der Haken am Text haengt. Also einmal.
check("Dublette einmal", zuPunkten("Charts\nCharts"), ["Charts"]);

check("Randleerzeichen weg", zuPunkten("   Charts   "), ["Charts"]);

// Ein Bindestrich MITTEN im Text ist kein Aufzaehlungszeichen.
check("Bindestrich im Wort bleibt",
  zuPunkten("E-Mail schreiben"), ["E-Mail schreiben"]);

// Eine Zahl am Anfang ohne Punkt ist Inhalt, keine Nummerierung.
check("Zahl ohne Punkt bleibt",
  zuPunkten("3 Trades nachtragen"), ["3 Trades nachtragen"]);

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
