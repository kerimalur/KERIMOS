// Kontrollwerte für die Schwellen-Kalibrierung.
// Aufruf:  npx -y tsx tools/checks/kalibrierung.mts
//
// Der Zweck dieser Datei ist die Frage, ob die Auswertung sich selbst
// belügt. Zwei Wege dorthin sind bekannt und beide werden hier abgedeckt:
//
//   1. Anhaltende Zustände als viele Signale zählen. Bleibt eine Streckung
//      acht Wochen bestehen, ist das EIN Ereignis. Zählt man acht, misst man
//      dieselbe Marktbewegung mehrfach und bekommt ein Vertrauensintervall,
//      das viel zu eng ist.
//   2. Eine engere Schwelle darf nie MEHR Signale liefern als eine weitere —
//      sie ist eine Teilmenge. Passiert das doch, ist der Vergleich verdreht.
import {
  SCHWELLEN, divergenzBei, paarSignale, fazitVon,
  type RangWoche, type SchwellenZeile,
} from "../../src/lib/confluence/kalibrierung";
import type { VorwaertsZeile } from "../../src/lib/confluence/vorwaerts";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const tag = (i: number) => {
  const d = new Date(Date.UTC(2020, 0, 7 + i * 7));
  return d.toISOString().slice(0, 10);
};
const w = (i: number, komm: number, retail: number): RangWoche =>
  ({ datum: tag(i), komm, retail });

// --- Divergenz an der Schwelle ------------------------------------------
check("Commercials oben, Retail unten -> +1", divergenzBei(w(0, 80, 20), 75), 1);
check("Commercials unten, Retail oben -> -1", divergenzBei(w(0, 20, 80), 75), -1);
check("nur eine Seite gestreckt -> 0", divergenzBei(w(0, 80, 50), 75), 0);
check("beide oben -> 0", divergenzBei(w(0, 80, 80), 75), 0);
// Genau auf der Grenze zählt mit — sonst ist die Schwelle eine andere als
// die, die drübersteht.
check("genau auf der Grenze zaehlt", divergenzBei(w(0, 75, 25), 75), 1);
check("eine Stelle darunter zaehlt nicht", divergenzBei(w(0, 74.9, 25), 75), 0);
// Bei 85 gilt unten 15, nicht 25.
check("Schwelle 85 ist strenger", divergenzBei(w(0, 86, 20), 85), 0);
check("Schwelle 85 erfuellt", divergenzBei(w(0, 86, 14), 85), 1);

// --- Übergänge statt Wochen ---------------------------------------------
{
  // Acht Wochen dieselbe Streckung. Das ist EIN Ereignis.
  const basis = Array.from({ length: 8 }, (_, i) => w(i, 90, 10));
  const quote = Array.from({ length: 8 }, (_, i) => w(i, 50, 50));
  check("anhaltender Zustand -> ein Signal", paarSignale(basis, quote, 75).length, 1);
  check("Signal steht am ersten Tag", paarSignale(basis, quote, 75)[0].datum, tag(0));
}
{
  // Streckung, Pause, wieder Streckung: zwei Ereignisse.
  const basis = [w(0, 90, 10), w(1, 90, 10), w(2, 50, 50), w(3, 90, 10)];
  const quote = [w(0, 50, 50), w(1, 50, 50), w(2, 50, 50), w(3, 50, 50)];
  check("mit Unterbrechung -> zwei Signale", paarSignale(basis, quote, 75).length, 2);
}
{
  // Direkter Wechsel der Richtung ohne Pause ist ebenfalls ein neues Signal.
  const basis = [w(0, 90, 10), w(1, 10, 90)];
  const quote = [w(0, 50, 50), w(1, 50, 50)];
  const s = paarSignale(basis, quote, 75);
  check("Richtungswechsel -> zwei Signale", s.map((x) => x.richtung), [1, -1]);
}

// --- Beide Seiten des Paares --------------------------------------------
{
  // Basis gestützt UND Quote belastet zeigen in dieselbe Richtung.
  const basis = [w(0, 90, 10)];
  const quote = [w(0, 10, 90)];
  check("beide Seiten passen -> long", paarSignale(basis, quote, 75)[0].richtung, 1);
}
{
  // Beide Währungen gleich gestreckt: im Paar hebt es sich auf.
  const basis = [w(0, 90, 10)];
  const quote = [w(0, 90, 10)];
  check("beide gleich -> kein Signal", paarSignale(basis, quote, 75).length, 0);
}
{
  // Fehlt die Gegenwährung an einem Datum, wird der Termin uebersprungen
  // statt mit einer halben Information gewertet.
  const basis = [w(0, 90, 10), w(1, 90, 10)];
  const quote = [w(1, 50, 50)];
  check("fehlender Gegentermin faellt weg", paarSignale(basis, quote, 75).length, 1);
}

// --- Monotonie: strenger heisst nie mehr Signale -------------------------
{
  // Zufällige, aber feste Reihe — ohne Math.random, damit der Check
  // reproduzierbar bleibt.
  const pseudo = (i: number) => ((i * 37 + 11) % 100);
  const basis = Array.from({ length: 300 }, (_, i) => w(i, pseudo(i), pseudo(i * 3)));
  const quote = Array.from({ length: 300 }, (_, i) => w(i, pseudo(i * 7), pseudo(i * 5)));

  const anzahl = SCHWELLEN.map((o) => paarSignale(basis, quote, o).length);
  const fallend = anzahl.every((n, i) => i === 0 || n <= anzahl[i - 1]);
  console.log(`     Signale je Schwelle: ${JSON.stringify(anzahl)}`);
  check("strengere Schwelle -> nie mehr Signale", fallend, true);
}

// --- Das Fazit bleibt zurueckhaltend ------------------------------------
const zeile = (n: number, abstand: number | null): VorwaertsZeile => ({
  wochen: 4, signal: { n, schnitt: 0, median: 0, quote: { n, treffer: 0, quote: null, unten: null, oben: null } },
  basis: { n: 100, schnitt: 0, median: 0, quote: { n: 100, treffer: 0, quote: null, unten: null, oben: null } },
  abstand, offen: 0, satz: "",
});
const reihe = (oben: number, abstaende: (number | null)[], signale = 40): SchwellenZeile => ({
  oben: oben as never, unten: 100 - oben, signale,
  zeilen: abstaende.map((a) => zeile(signale, a)),
});

check("zu wenig Signale -> kein Urteil",
  fazitVon([reihe(75, [0.5, 0.5], 5)]).includes("lässt sich nichts sagen"), true);
check("ein einzelner Treffer -> 75/25 bleibt",
  fazitVon([reihe(75, [0.5, 0.0, 0.0, 0.0])]).includes("kann so bleiben"), true);
check("mehrere Horizonte -> Hinweis",
  fazitVon([reihe(80, [0.5, 0.4, 0.3, 0.0])]).includes("80/20"), true);
check("Hinweis bleibt als Hinweis gekennzeichnet",
  fazitVon([reihe(80, [0.5, 0.4, 0.3, 0.0])]).includes("kein Beweis"), true);

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
