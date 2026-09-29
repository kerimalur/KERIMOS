// Kontrollwerte für Erwartung gegen Ist (lib/makro/releases.ts).
// Aufruf:  npx -y tsx tools/checks/releases.mts
//
// Die Beispiele sind echte Termine aus trading.calendar_events (Stand
// 29.09.2026). Wer die Rekonstruktion ändert, sieht hier sofort, ob NFP,
// der deutsche Flash-PMI und die BoJ noch stimmen.
import {
  parseWert, serieVon, kategorieVon, istInvertiert, releasesAusKalender, mitAbweichung,
  indexBis, szenario, entscheidUrteil, type KalenderZeile,
} from "../../src/lib/makro/releases";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

/* Parsen */
check("PMI", parseWert("54.6"), { wert: 54.6, einheit: "" });
check("NFP", parseWert("162K"), { wert: 162, einheit: "K" });
check("negativ %", parseWert("-0.1%"), { wert: -0.1, einheit: "%" });
check("BoJ Spanne", parseWert("<1.25%"), { wert: 1.25, einheit: "%" });
check("MPC-Stimmen", parseWert("2-0-7"), null);
check("leer", parseWert(""), null);
check("Milliarden", parseWert("-3.4B"), { wert: -3.4, einheit: "B" });

/* Serien und Kategorien */
check("Flash weg", serieVon("German Flash Manufacturing PMI"), "German Manufacturing PMI");
check("Final weg", serieVon("German Final Manufacturing PMI"), "German Manufacturing PMI");
check("Prelim weg", serieVon("Prelim GDP q/q"), "GDP q/q");
check("Kat PMI", kategorieVon("ISM Manufacturing PMI"), "wachstum");
check("Kat Preise", kategorieVon("ISM Manufacturing Prices"), "inflation");
check("Kat CPI", kategorieVon("Trimmed Mean CPI m/m"), "inflation");
check("Kat Quote", kategorieVon("Unemployment Rate"), "arbeit");
check("Kat NFP", kategorieVon("Non-Farm Employment Change"), "arbeit");
check("Kat Fed", kategorieVon("Federal Funds Rate"), "notenbank");
check("Kat BoJ", kategorieVon("BOJ Policy Rate"), "notenbank");
check("Kat Stimmen", kategorieVon("MPC Official Bank Rate Votes"), "sonstiges");
check("Invertiert Claims", istInvertiert("Unemployment Claims"), true);
check("Invertiert PMI", istInvertiert("Manufacturing PMI"), false);

/* Rekonstruktion mit echten Zeilen */
const z = (id: string, title: string, currency: string, event_time: string, forecast: string | null, previous: string | null, impact = "High"): KalenderZeile =>
  ({ id, title, currency, event_time, impact, forecast, previous });

const kalender: KalenderZeile[] = [
  z("nfp1", "Non-Farm Employment Change", "USD", "2026-09-04T12:30:00Z", "55K", "-23K"),
  z("nfp2", "Non-Farm Employment Change", "USD", "2026-10-02T12:30:00Z", "90K", "162K"),
  z("de1", "German Flash Manufacturing PMI", "EUR", "2026-08-21T07:30:00Z", "52.1", "52.2", "Medium"),
  z("de2", "German Final Manufacturing PMI", "EUR", "2026-09-01T07:55:00Z", "54.1", "54.1", "Low"),
  z("de3", "German Flash Manufacturing PMI", "EUR", "2026-09-23T07:30:00Z", "53.8", "54.3", "Medium"),
  z("boj1", "BOJ Policy Rate", "JPY", "2026-07-31T03:00:00Z", "<1.00%", "<1.00%"),
  z("boj1b", "BOJ Policy Rate", "JPY", "2026-07-31T03:00:00Z", "<1.00%", "<1.00%"),
  z("boj2", "BOJ Policy Rate", "JPY", "2026-09-18T03:00:00Z", "<1.25%", "<1.00%"),
  z("cl1", "Unemployment Claims", "USD", "2026-09-17T12:30:00Z", "207K", "206K"),
  z("cl2", "Unemployment Claims", "USD", "2026-09-24T12:30:00Z", "201K", "196K"),
  z("fremd", "Non-Farm Employment Change", "MXN", "2026-09-04T12:30:00Z", "1K", "2K"),
];
const rel = mitAbweichung(releasesAusKalender(kalender, ["USD", "EUR", "JPY"]));
const r = (id: string) => rel.find((x) => x.id === id)!;

check("NFP Ist rekonstruiert", [r("nfp1").erwartung, r("nfp1").ist, r("nfp1").ist_quelle], [55, 162, "rekonstruiert"]);
check("NFP z (+107K / 50K, gedeckelt 3)", r("nfp1").z, 2.14);
check("NFP Okt noch ohne Ist", [r("nfp2").ist, r("nfp2").z], [null, null]);
check("DE Flash Aug: Ist aus Final", [r("de1").ist, r("de1").abweichung], [54.1, 2]);
check("DE Final Sep: Ist aus nächstem Flash", r("de2").ist, 54.3);
check("BoJ Doppel nur einmal", rel.filter((x) => x.serie === "BOJ Policy Rate").length, 2);
check("BoJ Juli wie erwartet", [r("boj1").ist, entscheidUrteil(r("boj1")).text], [1, "Halten wie erwartet"]);
check("BoJ Sep Ist fehlt", entscheidUrteil(r("boj2")).text, "Ist fehlt");
check("Claims weniger = gut", r("cl1").z, 1.1);
check("Fremdwährung raus", rel.some((x) => x.ccy === "MXN"), false);

/* Index */
const idx = indexBis(rel.filter((x) => x.ccy === "USD"), new Date("2026-09-29T00:00:00Z"));
check("USD-Index positiv", idx.wert !== null && idx.wert > 0, true);

/* Szenario */
check("Szenario Claims", szenario(r("cl2")).startsWith("Ist unter 201K"), true);
check("Szenario BoJ", szenario(r("boj2")).startsWith("Erhöhung auf 1.25 %"), true);

console.log(fails === 0 ? "\nAlles gut." : `\n${fails} Fehler.`);
process.exit(fails === 0 ? 0 : 1);
