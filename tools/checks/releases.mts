// Kontrollwerte für Erwartung gegen Ist (lib/makro/releases.ts).
// Aufruf:  npx -y tsx tools/checks/releases.mts
//
// Die Beispiele sind echte Termine aus trading.calendar_events (Stand
// 29.09.2026). Wer die Rekonstruktion ändert, sieht hier sofort, ob NFP,
// der deutsche Flash-PMI und die BoJ noch stimmen.
import {
  parseWert, serieVon, kategorieVon, istInvertiert, releasesAusKalender, mitAbweichung,
  indexBis, szenario, entscheidUrteil, mitMt5, type KalenderZeile, type Mt5Zeile,
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

/* MT5: Zuordnung über den Vorwert, Faktor, Historie */
const m5 = (value_id: number, event_id: number, ccy: string, name: string, event_time: string,
  actual: number | null, forecast: number | null, previous: number | null, importance = "CALENDAR_IMPORTANCE_HIGH"): Mt5Zeile =>
  ({ value_id, event_id, ccy, name, importance, event_time, actual, forecast, previous, multiplier: "CALENDAR_MULTIPLIER_THOUSANDS", unit: "CALENDAR_UNIT_JOB" });
const jetzt = Date.parse("2026-09-29T12:00:00Z");
const { releases: mitM, bericht } = mitMt5(rel, [
  // NFP Sep: MT5 in Einzelwerten (162000), Forex Factory in K (162)
  m5(1, 840030016, "USD", "Nonfarm Payrolls", "2026-09-04T12:30:00Z", 158000, 60000, -23000),
  // Claims 24.09 mit echtem Ist, eine Stunde Zeitversatz (Sommerzeit)
  m5(2, 840030020, "USD", "Initial Jobless Claims", "2026-09-24T13:30:00Z", 198, 203, 196),
  // Historie derselben NFP-Reihe vor dem Forex-Factory-Fenster
  m5(3, 840030016, "USD", "Nonfarm Payrolls", "2024-05-03T12:30:00Z", 175000, 240000, 315000),
  // Reihe, die Forex Factory nicht führt
  m5(4, 554500001, "NZD", "Business NZ PMI", "2026-09-11T22:30:00Z", 49.1, null, 48.8, "CALENDAR_IMPORTANCE_MODERATE"),
  // unwichtige Reihe ohne Partner: bleibt draussen
  m5(5, 554500002, "NZD", "Visitor Arrivals", "2026-09-10T22:45:00Z", 1.2, null, 0.8, "CALENDAR_IMPORTANCE_LOW"),
], jetzt);
const mr = (id: string) => mitM.find((x) => x.id === id);
check("MT5 NFP zugeordnet, Faktor 1e-3", [mr("nfp1")?.ist, mr("nfp1")?.ist_quelle], [158, "mt5"]);
check("MT5 Claims trotz 1h Versatz", [mr("cl2")?.ist, mr("cl2")?.ist_quelle], [198, "mt5"]);
check("MT5 Historie unter FF-Titel", [mr("mt5:3")?.titel, mr("mt5:3")?.ist, mr("mt5:3")?.erwartung], ["Non-Farm Employment Change", 175, 240]);
check("MT5 Business NZ dazu", [mr("mt5:4")?.serie, mr("mt5:4")?.kategorie], ["Business NZ PMI", "wachstum"]);
check("MT5 Unwichtiges draussen", mr("mt5:5"), undefined);
check("MT5 Bericht", [bericht.zugeordnet, bericht.istGesetzt, bericht.historie, bericht.ohneZuordnung], [2, 2, 1, 1]);

/* Doppelung: MT5-Reihe ohne Zuordnung, aber zur Zeit eines FF-Termins derselben Kategorie */
const { bericht: b2 } = mitMt5(rel, [
  // Anträge zur selben Minute wie die FF-Claims, aber anderer Vorwert: nicht zuordenbar, trotzdem doppelt
  m5(10, 840099999, "USD", "Erstanträge auf Arbeitslosenhilfe", "2026-09-17T12:30:00Z", 196, 207, 999, "CALENDAR_IMPORTANCE_HIGH"),
], jetzt);
check("MT5 Doppelung bleibt draussen", b2.ohneZuordnung, 0);
check("Deutsch: Arbeitslosenrate", [kategorieVon("Arbeitslosenrate"), istInvertiert("Arbeitslosenrate")], ["arbeit", true]);
check("Deutsch: Kern-VPI", kategorieVon("Kern-VPI n.s.b. m/m"), "inflation");
check("Deutsch: EZB-Zins", kategorieVon("ECB Einlagenzinsentscheid"), "notenbank");
check("Deutsch: BIP", kategorieVon("BIP m/m"), "wachstum");

console.log(fails === 0 ? "\nAlles gut." : `\n${fails} Fehler.`);
process.exit(fails === 0 ? 0 : 1);
