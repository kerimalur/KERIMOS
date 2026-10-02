// Kontrollwerte für Erwartung gegen Ist (lib/makro/releases.ts).
// Aufruf:  npx -y tsx tools/checks/releases.mts
//
// Die Beispiele sind echte Termine aus trading.calendar_events (Stand
// 29.09.2026). Wer die Rekonstruktion ändert, sieht hier sofort, ob NFP,
// der deutsche Flash-PMI und die BoJ noch stimmen.
import {
  parseWert, serieVon, kategorieVon, istInvertiert, releasesAusKalender, mitAbweichung,
  indexBis, szenario, entscheidUrteil, mitMt5, istNotenbankTon, type KalenderZeile, type Mt5Zeile,
} from "../../src/lib/makro/releases";
import { urteilFuer, urteilWort } from "../../src/lib/makro/urteil";
import { ersatzAusMt5 } from "../../src/lib/makro/pmi";
import { messe, montagVon } from "../../src/lib/makro/wochenideen-rechnen";
import { paarKlasse } from "../../src/lib/makro/urteil";
import { ideenAm, montage, zufallsBand } from "../../src/lib/makro/rueckrechnung-rechnen";
import { gesamtScore } from "../../src/lib/makro/urteil";

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

/* Urteil */
{
  const tagMs = 86_400_000;
  const heute = Date.parse("2026-09-29T12:00:00Z");
  const mk = (id: string, titel: string, tageZurueck: number, erwartung: number, ist: number, vorwert: number, kategorie: "wachstum" | "inflation" | "arbeit" | "notenbank", z: number, einheit = "") => ({
    id, ccy: "USD", titel, serie: titel, kategorie, event_time: new Date(heute - tageZurueck * tagMs).toISOString(),
    impact: "High", einheit, erwartung, ist, vorwert, ist_quelle: "mt5" as const, abweichung: ist - erwartung, z,
  });
  const rel2 = [
    mk("a", "ISM Manufacturing PMI", 28, 55.2, 54.6, 55.6, "wachstum", -0.6),
    mk("b", "ISM Services PMI", 26, 53.5, 54.1, 54.0, "wachstum", 0.6),
    mk("c", "Non-Farm Employment Change", 25, 55, 162, -23, "arbeit", 2.14, "K"),
    mk("d", "CPI y/y", 18, 3.0, 3.2, 3.1, "inflation", 2, "%"),
    mk("e", "Core CPI m/m", 18, 0.3, 0.4, 0.3, "inflation", 1, "%"),
    mk("f", "PPI m/m", 60, 0.2, 0.4, 0.1, "inflation", 2, "%"),
    mk("g", "Core PCE Price Index m/m", 34, 0.2, 0.3, 0.2, "inflation", 1, "%"),
    mk("h", "Federal Funds Rate", 13, 4.0, 4.0, 3.75, "notenbank", 0, "%"),
  ];
  const u = urteilFuer(null, rel2, heute);
  check("Urteil ohne Niveau: nur Überraschung zählt", u.teile.zentralbank === null && u.teile.ueberraschung !== null && u.score !== null && u.score > 0, true);
  check("Kern PMI Industrie", [u.kern.find((k) => k.key === "pmi_industrie")?.wert, u.kern.find((k) => k.key === "pmi_industrie")?.niveau, u.kern.find((k) => k.key === "pmi_industrie")?.trend], ["54.6", "Expansion, schwächer", "↓"]);
  check("Kern Jobs klar höher", u.kern.find((k) => k.key === "jobs")?.vergleich, "klar höher als erwartet");
  check("Kern Leitzins", [u.kern.find((k) => k.key === "leitzins")?.wert, u.kern.find((k) => k.key === "leitzins")?.vergleich], ["4 %", "Schritt wie erwartet"]);
  check("Nachricht nur 14 Tage, grosse 30 Tage", [u.nachricht?.id ?? null, u.grosse[0]?.id], [null, "c"]);
  check("Grund Inflation-Serie", u.gruende.some((g) => g.text.startsWith("Inflation 4×")), true);
  check("Höchstens 5 Gründe", u.gruende.length <= 5, true);
  check("Urteilswort", [urteilWort(0.5), urteilWort(0.2), urteilWort(0), urteilWort(-0.2), urteilWort(-0.5)],
    ["bullish", "leicht bullish", "neutral", "leicht bearish", "bearish"]);
}

/* MT5-Ersatz: Monatszuordnung */
{
  const e = ersatzAusMt5([
    { ccy: "JPY", name: "au Jibun Bank Japan Einkaufsmanagerindex (PMI) Dienstleistungen", event_time: "2026-08-21T00:30:00Z", actual: 52.0 },
    { ccy: "JPY", name: "au Jibun Bank Japan Einkaufsmanagerindex (PMI) Dienstleistungen", event_time: "2026-09-03T00:30:00Z", actual: 52.4 },
    { ccy: "NZD", name: "BusinessNZ Herstellerindex", event_time: "2026-09-10T22:30:00Z", actual: 48.8 },
    { ccy: "CHF", name: "KOF Konjunkturbarometer", event_time: "2026-08-28T07:00:00Z", actual: 101.3 },
  ]);
  const f = (ccy: string, feld: string) => e.find((x) => x.ccy === ccy && x.feld === feld)?.werte;
  check("JPY Dienste: Final (03.09) überschreibt Flash (21.08) für August", f("JPY", "pmi_dienste"), [{ datum: "2026-08-01", wert: 52.4 }]);
  check("NZD PMI: Mitte September = August", f("NZD", "pmi_industrie"), [{ datum: "2026-08-01", wert: 48.8 }]);
  check("CHF KOF: Ende August = August", f("CHF", "fruehindikator"), [{ datum: "2026-08-01", wert: 101.3 }]);
}
check("Notenbank-Ton erkannt", [istNotenbankTon("Fed Chair Powell Speaks"), istNotenbankTon("FOMC Meeting Minutes"), istNotenbankTon("CPI y/y")], [true, true, false]);

/* Wochenaussicht */
check("Montag von Mittwoch", montagVon(new Date("2026-09-30T10:00:00Z")), "2026-09-28");
check("Montag von Sonntag", montagVon(new Date("2026-10-04T10:00:00Z")), "2026-09-28");
{
  // OANDA-Tageskerzen öffnen Sonntag 21:00 UTC für den Montag.
  const k = (zeit: string, open: number, close: number) => ({ zeit, open, close });
  const kerzen = [
    k("2026-09-25T21:00:00Z", 1.1690, 1.1700), // Freitag davor — darf nicht zählen
    k("2026-09-27T21:00:00Z", 1.1700, 1.1720), // Montag Woche 1
    k("2026-10-01T21:00:00Z", 1.1750, 1.1760), // Freitag Woche 1
    k("2026-10-08T21:00:00Z", 1.1640, 1.1650), // Freitag Woche 2
  ];
  const m = messe(kerzen, "2026-09-28", "long", "EURUSD", Date.parse("2026-10-11T12:00:00Z"));
  check("Einstieg = Eröffnung Montag", m.einstieg, 1.17);
  check("1W long", [m.prozent[1], m.pips[1]], [0.513, 60]);
  check("2W long", [m.prozent[2], m.pips[2]], [-0.427, -50]);
  check("3W noch nicht messbar", m.prozent[3], undefined);
  const s = messe(kerzen, "2026-09-28", "short", "EURUSD", Date.parse("2026-10-11T12:00:00Z"));
  check("2W short umgekehrt", s.pips[2], 50);
}
check("Klasse A", paarKlasse(0.4, -0.3), "A");
check("Klasse B (gegen neutral)", paarKlasse(0.5, 0.05), "B");
check("Keine Idee unter 0.40", paarKlasse(0.3, 0), null);

/* Rückrechnung */
{
  check("Gesamt 40/35/25", gesamtScore(1, -1, 0), 0.05);
  check("Gesamt ohne Überraschung", gesamtScore(1, 0, null), 0.533);
  check("Montage", montage("2024-03-01", "2024-03-20"), ["2024-03-04", "2024-03-11", "2024-03-18"]);
  const ideen = ideenAm("2024-03-04", { NZD: 0.5, CAD: -0.3, GBP: 0.05, USD: 0 }, ["NZDCAD", "GBPNZD", "NZDUSD", "USDCAD", "GBPCAD"]);
  check("Rück-Ideen", ideen.map((i) => `${i.paar} ${i.seite} ${i.klasse}`), ["NZDCAD long A", "NZDUSD long B", "GBPNZD short B"]);
  check("Zufallsband 100 Ideen", zufallsBand(100), 10);
}

console.log(fails === 0 ? "\nAlles gut." : `\n${fails} Fehler.`);
process.exit(fails === 0 ? 0 : 1);
