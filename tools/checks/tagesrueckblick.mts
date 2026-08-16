// Kontrollwerte für den Tagesrückblick.
// Aufruf:  npx -y tsx tools/checks/tagesrueckblick.mts
import {
  hatInhalt, beantwortet, ausFormular, zusammenfassung, serie,
  MAX_ZEICHEN, LEER,
} from "../../src/lib/tagesrueckblick";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

check("leerer Rueckblick hat keinen Inhalt", hatInhalt(LEER), false);
check("nur Leerzeichen zaehlen nicht",
  hatInhalt({ erreicht: "   ", liegengeblieben: "", morgen: "" }), false);
check("eine Antwort reicht",
  hatInhalt({ ...LEER, morgen: "Backtest" }), true);
check("Zaehlung", beantwortet({ erreicht: "a", liegengeblieben: "", morgen: "c" }), 2);

const f = (e: Record<string, string>) => ausFormular((n) => (n in e ? e[n] : null));
check("fehlende Felder werden leer", f({}), LEER);
check("getrimmt", f({ erreicht: "  10 km gelaufen  " }).erreicht, "10 km gelaufen");
check("gekuerzt", f({ morgen: "x".repeat(900) }).morgen.length, MAX_ZEICHEN);

check("ohne Rueckblick", zusammenfassung(null), "Heute noch nichts festgehalten.");
check("leerer Rueckblick zaehlt als nichts",
  zusammenfassung({ datum: "2026-08-16", ...LEER }), "Heute noch nichts festgehalten.");
check("Zusammenfassung nennt Zahl und Text",
  zusammenfassung({ datum: "2026-08-16", erreicht: "10 km gelaufen", liegengeblieben: "", morgen: "Backtest" }),
  "2 von 3 beantwortet · 10 km gelaufen");
check("langer Text wird gekuerzt",
  zusammenfassung({ datum: "2026-08-16", erreicht: "y".repeat(200), liegengeblieben: "", morgen: "" })
    .endsWith("…"), true);
check("faellt auf morgen zurueck, wenn erreicht leer ist",
  zusammenfassung({ datum: "2026-08-16", erreicht: "", liegengeblieben: "", morgen: "Backtest" }),
  "1 von 3 beantwortet · Backtest");

// Serie
check("keine Tage", serie([], "2026-08-16"), 0);
check("nur heute", serie(["2026-08-16"], "2026-08-16"), 1);
check("drei am Stueck", serie(["2026-08-16", "2026-08-15", "2026-08-14"], "2026-08-16"), 3);
// Heute fehlt noch - der Abend ist ja nicht vorbei, das bricht nichts.
check("heute offen, gestern und vorgestern gesetzt",
  serie(["2026-08-15", "2026-08-14"], "2026-08-16"), 2);
check("Luecke bricht ab",
  serie(["2026-08-16", "2026-08-14", "2026-08-13"], "2026-08-16"), 1);
check("Serie ueber Monatsgrenze",
  serie(["2026-09-01", "2026-08-31", "2026-08-30"], "2026-09-01"), 3);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
