// Kontrollwerte für „Ersetzen statt verbieten".
// Aufruf:  npx -y tsx tools/checks/ersatz.mts
import type { Ersatz } from "../../src/lib/ersatz/typen";
const { fortschritt, wochenReihe } = await import("../../src/lib/ersatz/typen.ts");

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}
const e = (erfolge: string[]): Ersatz => ({ id: "x", gewohnheit: "Handy", ausloeser: "", bedeutung: "", ersatz: "Backtest", aktiv: true, erstellt: "", erfolge });
const heute = "2026-09-26"; // Samstag, Woche ab 21.09.

check("Wochenreihe: diese Woche zuletzt", wochenReihe(["2026-09-21", "2026-09-26", "2026-09-26"], heute, 2),
  [{ woche: "2026-09-14", anzahl: 0 }, { woche: "2026-09-21", anzahl: 3 }]);
check("ohne Erfolge: Start", fortschritt(e([]), heute).phase, "start");
check("zwei Erfolge am selben Tag = ein Erfolgstag", fortschritt(e(["2026-09-26", "2026-09-26"]), heute).erfolgsTage, 1);
check("dabei seit", fortschritt(e(["2026-09-20", "2026-09-26"]), heute).dabeiSeit, 6);
const viele = Array.from({ length: 70 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 6, 1 + i)); return d.toISOString().slice(0, 10);
});
check("70 Erfolgstage: sitzt", fortschritt(e(viele), heute).phase, "sitzt");
check("Anteil gedeckelt bei 1", fortschritt(e(viele), heute).anteil, 1);
check("ein Aussetzer setzt nichts zurück (kein Streak)",
  fortschritt(e(["2026-09-01", "2026-09-03", "2026-09-10"]), heute).erfolgsTage, 3);
check("Trend: mehr in den letzten 4 abgeschlossenen Wochen",
  fortschritt(e(["2026-07-28", "2026-09-01", "2026-09-10", "2026-09-15"]), heute).trend, "hoch");
check("Trend: nur neu", fortschritt(e(["2026-09-15"]), heute).trend, "neu");
check("Trend: die laufende Woche zählt nicht (Montag wäre sonst immer „runter\")",
  fortschritt(e(["2026-07-28", "2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25", "2026-09-01", "2026-09-08", "2026-09-15"]), "2026-09-21").trend, "gleich");

if (fails > 0) { console.log(`\n${fails} Fehler`); process.exit(1); }
console.log("\nalles OK");
