// Kontrollwerte für den Varianten-Vergleich (lib/makro/varianten-rechnen.ts).
// Aufruf:  npx -y tsx tools/checks/varianten.mts
import {
  raenge, rangIdeen, messeHorizonte, variantenScores, kurve, statistik, variantenBild, type KompWoche,
} from "../../src/lib/makro/varianten-rechnen";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}
const PAARE = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY", "EURCHF", "GBPCHF", "AUDNZD", "EURAUD", "GBPAUD", "EURNZD", "GBPNZD", "AUDCAD", "AUDCHF", "CADCHF", "EURCAD", "GBPCAD", "NZDCAD", "NZDCHF"];

check("Ränge", raenge({ A: 3, B: 1, C: 2 }), { A: 1, B: -1, C: 0 });
check("Ränge null", raenge({ A: 3, B: null, C: 1 }), { A: 1, B: null, C: -1 });

const sc = { USD: 0.9, EUR: 0.5, GBP: 0.1, JPY: -0.8, AUD: 0, NZD: -0.2, CAD: 0.2, CHF: -0.5 };
const id = rangIdeen(sc, PAARE);
check("4 Ideen", id.length, 4);
check("Extrem USD gegen JPY", id.filter((i) => i.extrem).map((i) => `${i.paar} ${i.seite}`), ["USDJPY long"]);
check("EUR gegen CHF long", id.some((i) => i.paar === "EURCHF" && i.seite === "long"), true);
check("zu wenige Scores", rangIdeen({ USD: 1, EUR: 0 }, PAARE).length, 0);

// Kerzen: Mo 2025-01-06, Kurs steigt jede Woche um 1.
const kz = Array.from({ length: 70 }, (_, i) => ({
  zeit: new Date(Date.parse("2025-01-05T22:00:00Z") + i * 86_400_000).toISOString(),
  open: 100 + i / 7, close: 100 + (i + 1) / 7,
}));
const m = messeHorizonte(kz, "2025-01-06", "long", Date.parse("2026-01-01"));
check("1 W positiv", (m[1] ?? 0) > 0, true);
check("8 W grösser als 1 W", (m[8] ?? 0) > (m[1] ?? 0), true);
check("Short umgekehrt", (messeHorizonte(kz, "2025-01-06", "short", Date.parse("2026-01-01"))[2] ?? 0) < 0, true);
check("noch nicht messbar", messeHorizonte(kz, "2025-01-06", "long", Date.parse("2025-01-07"))[1], undefined);

const leer: KompWoche = { gesamt: null, zentralbank: null, wirtschaft: null, ueberraschung: null, zweiJahr: null, pmiRichtung: null, pmiNiveau: null };
const w = ["2025-01-06", "2025-01-13", "2025-01-20", "2025-01-27", "2025-02-03"];
const komp = new Map(w.map((x, i) => [x, { USD: { ...leer, gesamt: 0.1 * i, zweiJahr: 4 + 0.1 * i }, EUR: { ...leer, gesamt: 0.5, zweiJahr: 2 } }]));
const vs = variantenScores(w, komp);
check("Veränderung 4 W USD", Math.round((vs.get("modell_d4")!.get("2025-02-03")!.USD ?? 0) * 100) / 100, 0.4);
check("Veränderung erst ab Woche 5", vs.get("modell_d4")!.get("2025-01-27")!.USD, null);
check("Kontra", vs.get("kontra")!.get("2025-01-06")!.EUR, -0.5);
check("2J Veränderung USD", Math.round((vs.get("rendite_d4")!.get("2025-02-03")!.USD ?? 0) * 100) / 100, 0.4);

const zeilen = [
  { variante: "modell", woche: "2025-01-06", paar: "EURUSD", seite: "long" as const, extrem: true, p1: 1, p2: 2, p4: null, p8: null },
  { variante: "modell", woche: "2025-01-06", paar: "GBPUSD", seite: "long" as const, extrem: false, p1: -1, p2: -1, p4: null, p8: null },
  { variante: "modell", woche: "2025-01-13", paar: "EURUSD", seite: "long" as const, extrem: true, p1: 2, p2: 1, p4: null, p8: null },
];
check("Kurve", kurve(zeilen), [{ woche: "2025-01-06", wert: 0 }, { woche: "2025-01-13", wert: 2 }]);
check("Kurve extrem", kurve(zeilen, true), [{ woche: "2025-01-06", wert: 1 }, { woche: "2025-01-13", wert: 3 }]);
check("Statistik", statistik([1, -1, 2, null]), { n: 3, treffer: 67, schnitt: 0.667 });
check("Bild 2W 2025", variantenBild(zeilen).stat.modell[2].alle["2025"], { n: 3, treffer: 67, schnitt: 0.667 });

console.log(fails === 0 ? "\nAlles gut." : `\n${fails} Fehler.`);
process.exit(fails === 0 ? 0 : 1);
