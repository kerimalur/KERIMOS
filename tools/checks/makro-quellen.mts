// Kontrollwerte für Perioden, Veraltet-Logik und Links der Makro-Daten.
// Aufruf:  npx -y tsx tools/checks/makro-quellen.mts
const { periodeZuDatum } = await import("../../src/lib/makro/perioden.ts");
const { alterMonate, istVeraltet, markiere } = await import("../../src/lib/makro/bewertung.ts");
const { manuellerLink } = await import("../../src/lib/makro/links.ts");

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}`
    + `${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const heute = new Date("2026-09-26T12:00:00Z");
check("Monat", periodeZuDatum("2026-08"), "2026-08-01");
check("Quartal", periodeZuDatum("2026-Q2"), "2026-04-01");
check("Jahr", periodeZuDatum("2025"), "2025-01-01");
check("Datum", periodeZuDatum("2026-09-24"), "2026-09-24");
check("Unsinn", periodeZuDatum("abc"), null);

check("Alter Monat Aug im Sept", alterMonate("2026-08-01", 1, heute), 1);
check("Alter Q2 im Sept (ab Periodenende)", alterMonate("2026-04-01", 3, heute), 3);
check("Alter Jahr 2025 im Sept 26", alterMonate("2025-01-01", 12, heute), 9);

const h = (stand: string, periode = 1) => ({ wert: 1, vorwert: null, stand, quelle: "x", periode });
check("CLI 01/2024 veraltet", istVeraltet("fruehindikator", h("2024-01-01"), heute), true);
check("CLI 08/2026 frisch", istVeraltet("fruehindikator", h("2026-08-01"), heute), false);
check("BIP Q2 frisch", istVeraltet("bip_yoy", h("2026-04-01", 3), heute), false);
check("BIP Q4/2025 veraltet", istVeraltet("bip_yoy", h("2025-10-01", 3), heute), true);
check("Leistungsbilanz 2025 frisch", istVeraltet("handelsbilanz", h("2025-01-01", 12), heute), false);
check("Leistungsbilanz 2024 veraltet", istVeraltet("handelsbilanz", h("2024-01-01", 12), heute), true);
check("PMI von Hand vor 4 Monaten veraltet", istVeraltet("pmi_industrie", h("2026-05-20"), heute), true);

const teil = { key: "fruehindikator", label: "CLI", wert: 99, einheit: "", score: 0.5, text: "t" };
const alt = markiere(teil, "fruehindikator", h("2024-01-01"), heute);
check("veraltet: Score fällt weg", [alt.status, alt.score], ["veraltet", null]);
check("fehlt", markiere({ ...teil, wert: null }, "fruehindikator",
  { wert: null, vorwert: null, stand: null, quelle: null }, heute).status, "fehlt");
check("frisch bleibt", markiere(teil, "fruehindikator", h("2026-08-01"), heute).score, 0.5);

check("Link PMI EUR", manuellerLink("EUR", "pmi_industrie")?.url, "https://tradingeconomics.com/euro-area/manufacturing-pmi");
check("Link CLI CHF → KOF", manuellerLink("CHF", "fruehindikator")?.text, "KOF-Konjunkturbarometer");
check("jedes Feld hat einen Link", ["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"].every((c) =>
  ["fruehindikator","pmi_industrie","pmi_dienste","bip_yoy","arbeitslos","handelsbilanz",
   "rendite_10j","anleihe_nachfrage","staatsschulden"].every((f) => manuellerLink(c, f))), true);

if (fails > 0) { console.log(`\n${fails} Fehler`); process.exit(1); }
console.log("\nalles OK");
