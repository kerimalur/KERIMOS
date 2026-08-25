// Kontrollwerte für die Wochenregel des Rückblicks (ab 24.08.2026).
// Aufruf:  npx -y tsx tools/checks/wochenrueckblick.mts
//
// Der wichtigste Wert steht ganz oben: der 23.08.2026 war der Sonntag, an dem
// Kerim den Rückblick für 17.-23. schreiben wollte und das alte Formular ihm
// die Woche 03.-09. hinstellte. Wer diese Zeile ändert, ändert genau den
// Fehler wieder zurück.
import { wochenpaar, zuZielen, MAX_ZIELE } from "../../src/lib/wochenrueckblick";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

// So 23.08.2026 — der Auslöser.
check("Sonntag: die Woche, die endet",
  wochenpaar("2026-08-23"), { rueckblick: "2026-08-17", ziele: "2026-08-24", amWochenende: true });
// Sa 22.08.2026 — ab hier ist die kommende Woche freigeschaltet.
check("Samstag: schon die endende Woche",
  wochenpaar("2026-08-22"), { rueckblick: "2026-08-17", ziele: "2026-08-24", amWochenende: true });
// Fr 21.08.2026 — noch Nachholfenster für die Woche davor.
check("Freitag: noch die Vorwoche",
  wochenpaar("2026-08-21"), { rueckblick: "2026-08-10", ziele: "2026-08-17", amWochenende: false });
// Mo 24.08.2026 — heute.
check("Montag: die Vorwoche nachholen",
  wochenpaar("2026-08-24"), { rueckblick: "2026-08-17", ziele: "2026-08-24", amWochenende: false });

// Zielwoche ist IMMER Rückblickwoche + 7 — die eine Invariante der Regel.
for (const t of ["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-28", "2026-12-31", "2027-01-01"]) {
  const p = wochenpaar(t);
  const plus7 = new Date(`${p.rueckblick}T12:00:00`);
  plus7.setDate(plus7.getDate() + 7);
  const iso = plus7.toISOString().slice(0, 10);
  check(`Zielwoche = Rueckblick + 7 (${t})`, p.ziele, iso);
}

// Jahreswechsel: Do 31.12.2026 ist ein Werktag, Fr 01.01.2027 auch.
check("Silvester 2026 ist ein Donnerstag im Nachholfenster",
  wochenpaar("2026-12-31"), { rueckblick: "2026-12-21", ziele: "2026-12-28", amWochenende: false });
check("Sonntag ueber den Jahreswechsel",
  wochenpaar("2027-01-03"), { rueckblick: "2026-12-28", ziele: "2027-01-04", amWochenende: true });

// --- Ziele aus dem Textfeld
check("eine Zeile, ein Ziel", zuZielen("24 Trades\n4x Kraft"), ["24 Trades", "4x Kraft"]);
check("Bindestriche und Nummern weg", zuZielen("- 24 Trades\n2. 4x Kraft"), ["24 Trades", "4x Kraft"]);
check("Komma trennt NICHT", zuZielen("Backtest, auch wenn es zieht").length, 1);
check("leere Zeilen fliegen raus", zuZielen("A\n\n   \nB"), ["A", "B"]);
check("doppelte einmal", zuZielen("A\nA\nB"), ["A", "B"]);
check("mehr als das Maximum wird gekappt",
  zuZielen("1\n2\n3\n4\n5\n6\n7").length, MAX_ZIELE);
check("leerer Text gibt nichts", zuZielen("   "), []);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
