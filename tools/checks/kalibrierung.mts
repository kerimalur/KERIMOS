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
  SCHWELLEN, divergenzBei, paarSignale, fazitVon, gesamtbild,
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


// --- Ein Bein oder beide -------------------------------------------------
// Der Fall aus Kerims TradingView-Screenshot vom 21.08.2026: sein Indikator
// zeigt fuer USDJPY ein klares Short-Signal ("Quelle: USD", Commercials im
// 7. Perzentil, Retail im 82.). Diese Rechnung sah dort NICHTS — weil sie
// beide Beine voneinander abzieht und JPY zur selben Zeit ebenfalls gestreckt
// short stand. Zwei gleichgerichtete Beine loeschen sich in der Differenz aus.
//
// Das ist keine Kleinigkeit: es erklaert, warum die Messung negativ aussah,
// waehrend der Indikator gut aussah. Die beiden messen nicht dasselbe.
{
  const usd = [w(0, 7, 82)];   // Commercials short, Retail long -> USD belastet
  const jpy = [w(0, 10, 80)];  // JPY genauso
  check("gleichgerichtete Beine: beide -> kein Signal",
    paarSignale(usd, jpy, 75, "beide").length, 0);
  check("gleichgerichtete Beine: nur Basis -> Short",
    paarSignale(usd, jpy, 75, "basis").map((x) => x.richtung), [-1]);
  check("gleichgerichtete Beine: nur Quote -> Long",
    paarSignale(usd, jpy, 75, "quote").map((x) => x.richtung), [1]);
}
{
  // Passen die Beine zusammen, sagen alle drei Fassungen dasselbe.
  const a = [w(0, 90, 10)], b = [w(0, 10, 90)];
  check("passende Beine: beide", paarSignale(a, b, 75, "beide").map((x) => x.richtung), [1]);
  check("passende Beine: basis", paarSignale(a, b, 75, "basis").map((x) => x.richtung), [1]);
  check("passende Beine: quote", paarSignale(a, b, 75, "quote").map((x) => x.richtung), [1]);
}
{
  // Fehlt der Gegentermin, darf die Basis-Fassung trotzdem zaehlen — sonst
  // waere das ein stiller Datenverlust in genau der Fassung, die das andere
  // Bein gar nicht braucht.
  const a = [w(0, 90, 10), w(1, 90, 10)], b = [w(1, 50, 50)];
  check("basis braucht kein Gegenbein", paarSignale(a, b, 75, "basis").length, 1);
  check("beide ueberspringt fehlenden Termin", paarSignale(a, b, 75, "beide").length, 1);
}

// --- Das Urteil ueber alle Paare ----------------------------------------
// Hier entscheidet sich, ob die Auswertung ehrlich bleibt. Der wichtigste
// Fall ist Kerims echter Befund vom 21.08.2026: zwei von vier Paaren
// durchgehend im Minus. Eine Auswertung, die daraus trotzdem eine Empfehlung
// baut, waere schlimmer als keine.
const paarAus = (name: string, proSchwelle: (number | null)[], n = 40): SchwellenZeile => ({
  oben: 75 as never, unten: 25, signale: n,
  zeilen: proSchwelle.map((v) => zeile(n, v)),
} as never);

const bau = (name: string, proSchwelle: (number | null)[], n = 40) => ({
  paar: name, fazit: "",
  reihen: proSchwelle.map((v) => reihe(75, [v, v, v, v], n)),
} as never);

{
  const g = gesamtbild([
    bau("EURUSD", [0.27, -0.15, -0.24, 0.25, 0.14]),
    bau("GBPUSD", [0.34, 0.16, 0.07, 0.40, 0.59]),
    bau("USDJPY", [-0.81, -1.05, -0.95, -0.66, -0.59]),
    bau("AUDUSD", [-0.17, -0.61, -0.77, -1.21, -0.24]),
  ]);
  check("echter Befund: 2 von 4 mit Vorsprung", g.mitVorsprung, 2);
  check("Haelfte im Minus -> keine Empfehlung",
    g.fazit.includes("75/25 bleibt"), true);
  check("durchgehend negatives Paar hat keine beste Schwelle",
    g.zeilen[2].beste, null);
}
{
  const g = gesamtbild([bau("A", [-1, -1, -1, -1, -1]), bau("B", [-1, -1, -1, -1, -1])]);
  check("alles negativ -> Faktor traegt nicht",
    g.fazit.includes("keine Drift"), true);
}
{
  const hoch = [0.1, 0.1, 0.1, 0.1, 0.9];
  const g = gesamtbild(["A", "B", "C", "D", "E", "F", "G"].map((n, i) =>
    bau(n, i < 5 ? hoch : [-1, -1, -1, -1, -1])));
  check("5 von 7 bei derselben Schwelle -> Hinweis", g.fazit.includes("85/15"), true);
}
{
  // Alle positiv, aber jede bei einer anderen Schwelle. Genau der Fall, in dem
  // man versucht waere, den "Gewinner" zu nehmen — und ihn nicht nehmen darf.
  const g = gesamtbild([
    bau("A", [0.9, 0.1, 0.1, 0.1, 0.1]),
    bau("B", [0.1, 0.9, 0.1, 0.1, 0.1]),
    bau("C", [0.1, 0.1, 0.9, 0.1, 0.1]),
    bau("D", [0.1, 0.1, 0.1, 0.9, 0.1]),
  ]);
  check("Paare widersprechen sich -> 75/25 bleibt",
    g.fazit.includes("75/25 bleibt"), true);
}
{
  const g = gesamtbild([bau("A", [0.5, 0.5, 0.5, 0.5, 0.5], 5)]);
  check("unter 15 Signalen -> Feld leer statt Null",
    g.zeilen[0].jeSchwelle, [null, null, null, null, null]);
}

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
