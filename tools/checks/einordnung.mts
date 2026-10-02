// Kontrollwerte für die Einordnung (lib/makro/einordnung.ts, ziele.ts).
// Aufruf:  npx -y tsx tools/checks/einordnung.mts
//
// Die Fälle stammen aus Kerims Makro-Lernen Modul 0 (01.10.2026).
import { mitAbweichung, entscheidUrteil, indexBis, type Release } from "../../src/lib/makro/releases";
import { mitPruefung, einordnung, stufeVon, andereSeite } from "../../src/lib/makro/einordnung";
import { marktCheck, paareFuer, reaktion } from "../../src/lib/makro/marktcheck";
import { zielLage, zielbandFaktor, istJahresrate, ZIELBAND_DAEMPFUNG } from "../../src/lib/makro/ziele";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const rel = (p: Partial<Release> & Pick<Release, "id" | "ccy" | "titel" | "kategorie">): Release => ({
  serie: p.titel, event_time: "2026-09-17T11:00:00.000Z", impact: "High", einheit: "%",
  erwartung: null, ist: null, vorwert: null, ist_quelle: "mt5", abweichung: null, z: null, ...p,
});

/* Zielband */
check("Jahresrate CPI y/y", istJahresrate("CPI y/y"), true);
check("keine Jahresrate m/m", istJahresrate("CPI m/m"), false);
check("CHF 0.8 im Band", zielLage("CHF", "CPI y/y", 0.8), "im_band");
check("CHF 2.4 über", zielLage("CHF", "CPI y/y", 2.4), "ueber");
check("EUR 2.1 am Ziel", zielLage("EUR", "CPI Flash Estimate y/y", 2.1), "im_band");
check("EUR 3.0 über", zielLage("EUR", "CPI Flash Estimate y/y", 3.0), "ueber");
check("JPY 1.9 am Ziel", zielLage("JPY", "National Core CPI y/y", 1.9), "im_band");
check("AUD 3.5 über", zielLage("AUD", "CPI y/y", 3.5), "ueber");
check("USD m/m nicht vergleichbar", zielLage("USD", "CPI m/m", 0.3), null);
check("Faktor im Band", zielbandFaktor("CHF", "CPI y/y", "inflation", 0.8), ZIELBAND_DAEMPFUNG);
check("Faktor über Ziel", zielbandFaktor("GBP", "CPI y/y", "inflation", 3.8), 1);
check("Faktor nur Inflation", zielbandFaktor("CHF", "GDP q/q", "wachstum", 0.8), 1);

/* Stufe */
check("Stufe 0.4", stufeVon(0.4), "im Rahmen");
check("Stufe -0.9", stufeVon(-0.9), "Überraschung");
check("Stufe 2", stufeVon(2), "starke Überraschung");
check("Stufe null", stufeVon(null), null);

/* BoE 17.09.2026: falsch gelesener Wert */
const boe = rel({ id: "boe", ccy: "GBP", titel: "Official Bank Rate", kategorie: "notenbank", erwartung: 3.75, ist: 4.0, vorwert: 3.75 });
const ohne = mitPruefung(mitAbweichung([boe]), [])[0];
check("BoE ohne Prüfung unbestätigt", ohne.pruefung?.status, "unbestaetigt");
check("BoE ohne Prüfung z null", ohne.z, null);
check("BoE ohne Prüfung Urteil", entscheidUrteil(ohne).ton, "fehlt");
const mit = mitPruefung(mitAbweichung([boe]), [{ release_id: "boe", ist: 3.75, stimmen: "6–3", ton: "falkenhaft", notiz: null, quelle: null }])[0];
check("BoE geprüft Ist", mit.ist, 3.75);
check("BoE geprüft z", mit.z, 0);
check("BoE geprüft Urteil", entscheidUrteil(mit), { text: "Halten wie erwartet, Ton falkenhaft", ton: "gut" });
check("BoE Einordnung Richtung", einordnung(mit).richtung, 1);
const wieErwartet = mitPruefung([rel({ id: "fed", ccy: "USD", titel: "Federal Funds Rate", kategorie: "notenbank", erwartung: 4.0, ist: 4.0, vorwert: 3.75 })], [])[0];
check("Fed wie erwartet ohne Prüfung bleibt", wieErwartet.pruefung, undefined);
check("Fed Urteil", entscheidUrteil(wieErwartet).text, "Schritt wie erwartet");
check("Andere Kategorien unberührt", mitPruefung([rel({ id: "x", ccy: "USD", titel: "CPI y/y", kategorie: "inflation", erwartung: 3, ist: 3.2 })], [])[0].pruefung, undefined);

/* USD Unemployment Claims: Vorwert 197K, Konsens 201K, Ist 197K */
const claims = mitAbweichung([rel({ id: "c", ccy: "USD", titel: "Unemployment Claims", kategorie: "arbeit", einheit: "K", impact: "Medium", erwartung: 201, ist: 197, vorwert: 197 })])[0];
check("Claims z (invertiert, gegen Konsens)", claims.z, 0.4);
const ec = einordnung(claims);
check("Claims Stufe", ec.stufe, "im Rahmen");
check("Claims nicht 'unverändert' (Vorwert ignoriert)", ec.kette[0].text.includes("201K"), true);

/* CHF August 2026: 0.8 statt 0.5, im Band */
const lik = mitAbweichung([rel({ id: "lik", ccy: "CHF", titel: "CPI y/y", kategorie: "inflation", erwartung: 0.5, ist: 0.8, vorwert: 0.4 })])[0];
const el = einordnung(lik);
check("LIK stark", el.stufe, "starke Überraschung");
check("LIK stützt", el.richtung, 1);
check("LIK Zielband-Warnung", el.warnungen.some((w) => w.startsWith("Im Zielband")), true);
check("LIK SNB-Warnung", el.warnungen.some((w) => w.startsWith("CHF: Die SNB")), true);

/* Index: Inflation im Band zählt halb */
const s = new Date("2026-09-18T00:00:00Z");
const imBand = rel({ id: "a", ccy: "CHF", titel: "CPI y/y", kategorie: "inflation", ist: 0.8, z: 1 });
const pmi = rel({ id: "b", ccy: "CHF", titel: "Manufacturing PMI", kategorie: "wachstum", einheit: "", ist: 50, z: -1 });
check("Index mit Dämpfung", indexBis([imBand, pmi], s).wert, -0.333);

/* Andere Seite ±24 h */
const fed = rel({ id: "f", ccy: "USD", titel: "Federal Funds Rate", kategorie: "notenbank", event_time: "2026-09-16T18:00:00.000Z" });
const weit = rel({ id: "w", ccy: "EUR", titel: "CPI y/y", kategorie: "inflation", event_time: "2026-09-10T09:00:00.000Z" });
check("Andere Seite", andereSeite(boe, [boe, fed, weit]).map((x) => x.id), ["f"]);
check("Warnung andere Seite", einordnung(mit, [mit, fed]).warnungen.some((w) => w.includes("USD Federal Funds Rate")), true);

/* Markt-Check */
check("GBP hat 7 Paare", paareFuer("GBP").length, 7);
check("GBP vorne in GBP_USD", paareFuer("GBP").find((p) => p.instrument === "GBP_USD")?.vorne, true);
check("GBP hinten in EUR_GBP", paareFuer("GBP").find((p) => p.instrument === "EUR_GBP")?.vorne, false);
// M15-Kerzen ab 11:00, jede steigt um 0.1 % vom Startwert.
const kz = (startPreis: number, schritt: number) => Array.from({ length: 18 }, (_, i) => ({
  zeit: new Date(Date.parse("2026-09-17T11:00:00Z") + i * 15 * 60_000).toISOString(),
  open: startPreis * (1 + schritt * i), close: startPreis * (1 + schritt * (i + 1)),
}));
check("Reaktion 1h", reaktion(kz(100, 0.001), Date.parse("2026-09-17T11:00:00Z"), 60), 0.4);
const steigt: Record<string, ReturnType<typeof kz>> = {};
for (const p of paareFuer("GBP")) steigt[p.instrument] = p.vorne ? kz(1.3, 0.001) : kz(0.87, -0.001);
const mc = marktCheck("GBP", "2026-09-17T11:00:00.000Z", steigt, 1);
check("Check bestätigt", mc.urteil, "bestätigt");
check("Check 7/7", mc.fenster.find((f) => f.key === "1h")?.mitRichtung, 7);
check("Check widerspricht", marktCheck("GBP", "2026-09-17T11:00:00.000Z", steigt, -1).urteil, "widerspricht");
check("Check ohne Erwartung", marktCheck("GBP", "2026-09-17T11:00:00.000Z", steigt, 0).urteil, "keine Erwartung");
check("Check ohne Kerzen", marktCheck("GBP", "2026-09-17T11:00:00.000Z", {}, 1).urteil, "keine Daten");

console.log(fails === 0 ? "\nAlles gut." : `\n${fails} Fehler.`);
process.exit(fails === 0 ? 0 : 1);
