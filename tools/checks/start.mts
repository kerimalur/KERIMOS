// Kontrollwerte für die Begrüssung auf der Startseite.
// Aufruf:  npx -y tsx tools/checks/start.mts
//
// Der Punkt dieser Datei: die Begrüssung nennt IMMER nur die dringendste
// Sache. Wenn hier je zwei Meldungen gleichzeitig durchkommen, ist aus dem
// Gruss ein Bericht geworden — und Berichte liest man beim Reinkommen nicht.
import type { Lage } from "../../src/lib/start/begruessung";

const { begruessung, anrede } = await import("../../src/lib/start/begruessung.ts");

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}`
    + `${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const lage = (o: Partial<Lage> = {}): Lage => ({
  stunde: 9, wochentag: 2, hits: 0, laufende: 0, unvollstaendig: 0, ...o,
});

check("Morgen", anrede(9), "Guten Morgen");
check("Nacht", anrede(2), "Noch wach");
check("Abend", anrede(20), "Guten Abend");

check("Hits gewinnen vor allem anderen",
  begruessung(lage({ hits: 2, laufende: 3, unvollstaendig: 5 })).ziel, "/trading/cockpit");
check("Einzahl bei einem Hit",
  begruessung(lage({ hits: 1 })).satz, "Ein GVA-Hit wartet auf eine Entscheidung.");
check("Nachtrag vor laufenden Trades",
  begruessung(lage({ laufende: 2, unvollstaendig: 1 })).ziel, "/trading/journal/trades");
check("laufende Trades, wenn sonst nichts ansteht",
  begruessung(lage({ laufende: 1 })).ziel, "/trading");
check("Wochenende ohne offene Punkte → Backtest",
  begruessung(lage({ wochentag: 6 })).ziel, "/trading/backtest");
check("Werktag ohne alles → kein Ziel",
  begruessung(lage()).ziel, null);
check("Name steht im Gruss",
  begruessung(lage({ stunde: 20 })).gruss, "Guten Abend, Kerim.");

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
