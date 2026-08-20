// Kontrollwerte für die Vorwaerts-Auswertung mit Basisstichprobe.
// Aufruf:  npx -y tsx tools/checks/vorwaerts.mts
//
// Die Idee stammt aus Kerims Pine-Script und ist dort das Beste am ganzen
// Skript: eine Signalrendite ohne Basisstichprobe sagt nichts. Genau das wird
// hier festgenagelt - ein Signal in einem steigenden Markt darf NICHT als
// Vorsprung durchgehen, wenn der Markt sowieso stieg.
import {
  vorwaertsVergleich, MIN_SIGNALE, HORIZONTE, type Signal,
} from "../../src/lib/confluence/vorwaerts";
import type { Kurspunkt } from "../../src/lib/confluence/saison";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const tag = (i: number) => {
  const d = new Date("2020-01-01T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};

/** 1400 Tage, taeglich, mit fester Steigung je Tag in Prozent. */
const kurse = (steigungProTag: number): Kurspunkt[] =>
  Array.from({ length: 1400 }, (_, i) => ({
    datum: tag(i),
    schluss: 100 * Math.pow(1 + steigungProTag / 100, i),
  }));

const signale = (n: number, richtung: -1 | 1, abTag = 100): Signal[] =>
  Array.from({ length: n }, (_, i) => ({ datum: tag(abTag + i * 14), richtung }));

/* ----------------------------------------------- Der eigentliche Test */

// Steigender Markt, Long-Signale. Die Signale gewinnen - aber die Basis
// gewinnt genauso. Der Abstand muss nahe null sein.
const steigend = vorwaertsVergleich(kurse(0.05), signale(30, 1));
const h4 = steigend[0];
check("Horizonte in der richtigen Reihenfolge",
  steigend.map((z) => z.wochen), [...HORIZONTE]);
check("Signale werden gezaehlt", h4.signal.n >= MIN_SIGNALE, true);
check("Signalrendite ist positiv", (h4.signal.schnitt ?? 0) > 0, true);
check("die Basis aber auch", (h4.basis.schnitt ?? 0) > 0, true);
check("und der Abstand ist praktisch null",
  Math.abs(h4.abstand ?? 9) < 0.2, true);
check("der Satz nennt es Rauschen", h4.satz.includes("Rauschen"), true);

// Derselbe steigende Markt, aber SHORT-Signale: die muessen deutlich unter
// der Basis liegen. Ohne die Richtungsdrehung der Basis waere der Abstand
// hier doppelt so gross wie er ist.
const gegenTrend = vorwaertsVergleich(kurse(0.05), signale(30, -1));
check("Short im steigenden Markt verliert",
  (gegenTrend[0].signal.schnitt ?? 0) < 0, true);
check("die Basis ist auf Short gedreht",
  (gegenTrend[0].basis.schnitt ?? 0) < 0, true);
check("und der Abstand bleibt klein",
  Math.abs(gegenTrend[0].abstand ?? 9) < 0.2, true);

/* ------------------------------------------------------------- Raender */

check("zu wenige Signale sagen nichts",
  vorwaertsVergleich(kurse(0.05), signale(3, 1))[0].satz.includes("sagt der Vergleich nichts"), true);
check("ohne Kurse kein Ergebnis",
  vorwaertsVergleich([], signale(30, 1))[0].signal.n, 0);
check("und der Satz sagt warum",
  vorwaertsVergleich([], signale(30, 1))[0].satz.includes("Keine Kurse"), true);
check("ohne Signale bleibt die Signalseite leer",
  vorwaertsVergleich(kurse(0.05), [])[0].signal.n, 0);

// Signale am Ende der Historie: ihr Horizont ist noch nicht abgelaufen und
// darf NICHT mitgezaehlt werden - sonst rechnet man mit einem kuerzeren
// Zeitraum als behauptet.
const amEnde = vorwaertsVergleich(kurse(0.05), signale(10, 1, 1380));
check("noch offene Horizonte zaehlen nicht", amEnde[3].signal.n, 0);
check("werden aber ausgewiesen", amEnde[3].offen, 10);

// Der laengste Horizont hat zwangslaeufig weniger Beobachtungen als der
// kuerzeste - sonst wurde irgendwo ueber das Ende hinaus gerechnet.
check("laengere Horizonte haben weniger Beobachtungen",
  steigend[3].basis.n <= steigend[0].basis.n, true);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
