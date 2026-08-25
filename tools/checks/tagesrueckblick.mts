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
// Seit dem 24.08.2026 wird nach `erreicht` nicht mehr gefragt - der Abgleich
// hat die Frage ersetzt. Gezaehlt werden nur noch die zwei offenen Fragen.
check("erreicht zaehlt nicht mehr mit",
  beantwortet({ erreicht: "a", liegengeblieben: "", morgen: "c" }), 1);
check("beide offenen Fragen",
  beantwortet({ erreicht: "", liegengeblieben: "b", morgen: "c" }), 2);

const f = (e: Record<string, string>) => ausFormular((n) => (n in e ? e[n] : null));
check("fehlende Felder werden leer", f({}), LEER);
check("getrimmt", f({ erreicht: "  10 km gelaufen  " }).erreicht, "10 km gelaufen");
check("gekuerzt", f({ morgen: "x".repeat(900) }).morgen.length, MAX_ZEICHEN);

check("ohne Rueckblick", zusammenfassung(null), "Heute noch nichts festgehalten.");
check("leerer Rueckblick zaehlt als nichts",
  zusammenfassung({ datum: "2026-08-16", ...LEER }), "Heute noch nichts festgehalten.");
check("Zusammenfassung nennt Zahl und Vorsatz",
  zusammenfassung({ datum: "2026-08-16", erreicht: "10 km gelaufen", liegengeblieben: "", morgen: "Backtest" }),
  "1 von 2 beantwortet · Backtest");
check("langer Text wird gekuerzt",
  zusammenfassung({ datum: "2026-08-16", erreicht: "y".repeat(200), liegengeblieben: "", morgen: "" })
    .endsWith("…"), true);
check("faellt auf liegengeblieben zurueck, wenn morgen leer ist",
  zusammenfassung({ datum: "2026-08-16", erreicht: "", liegengeblieben: "Journal", morgen: "" }),
  "1 von 2 beantwortet · Journal");
check("Altbestand bleibt lesbar, wenn sonst nichts dasteht",
  zusammenfassung({ datum: "2026-08-16", erreicht: "10 km gelaufen", liegengeblieben: "", morgen: "" }),
  "0 von 2 beantwortet · 10 km gelaufen");

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
