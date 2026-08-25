// Kontrollwerte für den Abgleich (Tagesrückblick, ab 24.08.2026).
// Aufruf:  npx -y tsx tools/checks/abgleich.mts
import {
  baueAbgleich, abgleichStand, haengeAn, VERSCHOBEN,
} from "../../src/lib/abgleich";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const staende = (v: string, e: string[], g: Record<string, string>) =>
  baueAbgleich(v, e, g).map((p) => p.stand);

// --- Grundfälle
check("leerer Vorsatz gibt nichts", baueAbgleich("", [], {}), []);
check("ohne Antwort ist alles offen",
  staende("Gym\nBacktest", [], {}), ["offen", "offen"]);
check("Haken", staende("Gym\nBacktest", ["Gym"], {}), ["erledigt", "offen"]);
check("Grund", staende("Gym", [], { Gym: "Schicht zu lang" }), ["nicht"]);
check("Grundtext kommt mit",
  baueAbgleich("Gym", [], { Gym: "  Schicht zu lang  " })[0].grund, "Schicht zu lang");
check("verschoben", staende("Gym", [], { Gym: VERSCHOBEN }), ["verschoben"]);

// --- Der Fall, der den Vorrang festlegt. Ohne ihn könnte ein Grund den Haken
//     überschreiben, und eine erledigte Zeile stünde als „nicht geschafft" da.
check("Haken schlaegt Grund",
  staende("Gym", ["Gym"], { Gym: "keine Zeit" }), ["erledigt"]);
check("Haken schlaegt verschoben",
  staende("Gym", ["Gym"], { Gym: VERSCHOBEN }), ["erledigt"]);

// --- Leerer Grund ist keine Antwort. Sonst sähe ein versehentlich geleertes
//     Feld aus wie ein beantworteter Punkt.
check("leerer Grund laesst offen", staende("Gym", [], { Gym: "   " }), ["offen"]);

// --- Aufzählungszeichen gehören zur Schreibweise, nicht zum Inhalt.
//     Der Haken haengt am gesaeuberten Text.
check("Bindestrich wird abgeschnitten",
  staende("- Gym\n2. Backtest", ["Gym", "Backtest"], {}), ["erledigt", "erledigt"]);
check("Komma trennt NICHT",
  baueAbgleich("Chart durchgehen, dann Journal", [], {}).length, 1);
check("doppelte Zeilen einmal",
  baueAbgleich("Gym\nGym", [], {}).length, 1);

// --- Stand
const gemischt = baueAbgleich("a\nb\nc\nd", ["a"], { b: "krank", c: VERSCHOBEN });
check("Stand zaehlt richtig", abgleichStand(gemischt),
  { gesamt: 4, erledigt: 1, nicht: 1, verschoben: 1, offen: 1, vollstaendig: false });
check("vollstaendig erst ohne offene",
  abgleichStand(baueAbgleich("a\nb", ["a"], { b: "krank" })).vollstaendig, true);
check("leere Liste ist nicht vollstaendig",
  abgleichStand([]).vollstaendig, false);

// --- Verschieben: die Zeile muss im Vorsatz von heute landen, sonst ist
//     „auf morgen" nur ein Status und die Absicht verschwindet.
check("haengt an", haengeAn("Gym", "Backtest"), "Gym\nBacktest");
check("leerer Vorsatz", haengeAn("", "Backtest"), "Backtest");
check("leere Zeile aendert nichts", haengeAn("Gym", "   "), "Gym");
check("schon drin bleibt einmal", haengeAn("Gym\nBacktest", "Gym"), "Gym\nBacktest");
check("auch mit Bindestrich schon drin", haengeAn("- Gym", "Gym"), "- Gym");

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
