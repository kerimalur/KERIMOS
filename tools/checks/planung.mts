// Kontrollwerte für den Kalender der Planung.
// Aufruf:  npx -y tsx tools/checks/planung.mts
//
// Datumsrechnung ist der Ort, an dem selbstgebauter Code still falsch wird:
// ein Monat, der am falschen Wochentag beginnt, ein Februar mit 28 Tagen im
// Schaltjahr, ein Jahreswechsel, der ins Leere zeigt. Auffallen würde das
// erst, wenn eine Aufgabe am falschen Tag steht — und dann glaubt man dem
// Kalender nicht mehr.
import {
  tagPlus, monatsStart, monatPlus, monatsLabel, wochentagMo0, baueMonat,
  baueWoche, wochenStart, dringlichkeit,
} from "../../src/lib/planung-kalender";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}` +
    (ok ? "" : ` (erwartet ${JSON.stringify(expected)})`)
  );
}

const HEUTE = "2026-09-09"; // Mittwoch

/* ------------------------------------------------------------ Einzeltage */

check("ein Tag vor", tagPlus("2026-09-09", 1), "2026-09-10");
check("ein Tag zurueck", tagPlus("2026-09-09", -1), "2026-09-08");
check("ueber den Monatswechsel", tagPlus("2026-08-31", 1), "2026-09-01");
check("ueber den Jahreswechsel", tagPlus("2026-12-31", 1), "2027-01-01");
check("in den Februar eines Schaltjahres", tagPlus("2028-02-28", 1), "2028-02-29");
check("kein 29. Februar 2027", tagPlus("2027-02-28", 1), "2027-03-01");

/* --------------------------------------------------------------- Monate */

check("Monatsstart", monatsStart("2026-09-09"), "2026-09-01");
check("ein Monat zurueck", monatPlus("2026-09-01", -1), "2026-08-01");
check("Jahreswechsel zurueck", monatPlus("2026-01-01", -1), "2025-12-01");
check("Jahreswechsel vor", monatPlus("2026-12-01", 1), "2027-01-01");
check("Beschriftung", monatsLabel("2026-02-01"), "Februar 2026");

/* ---------------------------------------------------------- Wochentage */

// 7. September 2026 ist ein Montag.
check("Montag ist 0", wochentagMo0("2026-09-07"), 0);
check("Sonntag ist 6", wochentagMo0("2026-09-13"), 6);
check("Mittwoch ist 2", wochentagMo0(HEUTE), 2);

/* ------------------------------------------------------------- Raster */

const sep = baueMonat("2026-09-01", HEUTE);
check("Raster beginnt am Montag", wochentagMo0(sep[0].datum), 0);
check("September beginnt am Dienstag, also ein Vorlauftag",
  sep[0].datum, "2026-08-31");
check("volle Wochen", sep.length % 7, 0);
check("September hat 30 Tage", sep.filter((t) => !t.ausserhalb).length, 30);
check("heute ist markiert", sep.filter((t) => t.heute).map((t) => t.datum), [HEUTE]);

// Der 1. Februar 2027 ist ein Montag — dann darf KEIN Vorlauftag entstehen.
const feb27 = baueMonat("2027-02-01", HEUTE);
check("Monat, der am Montag beginnt, hat keinen Vorlauf",
  feb27[0].datum, "2027-02-01");
check("Februar 2027 hat 28 Tage",
  feb27.filter((t) => !t.ausserhalb).length, 28);
check("Februar 2028 hat 29 Tage",
  baueMonat("2028-02-01", HEUTE).filter((t) => !t.ausserhalb).length, 29);

// Ein Monat mit 31 Tagen, der an einem Sonntag beginnt, braucht sechs Zeilen.
const nov26 = baueMonat("2026-11-01", HEUTE);
check("November 2026 beginnt an einem Sonntag", wochentagMo0("2026-11-01"), 6);
check("und passt nur in sechs Zeilen", nov26.length / 7, 6);
check("November hat 30 Tage",
  nov26.filter((t) => !t.ausserhalb).length, 30);

/* --------------------------------------------------------------- Woche */

check("Wochenstart am Mittwoch", wochenStart(HEUTE), "2026-09-07");
check("Wochenstart am Montag bleibt", wochenStart("2026-09-07"), "2026-09-07");
check("Wochenstart am Sonntag geht zurueck",
  wochenStart("2026-09-13"), "2026-09-07");
// Ueber den Monatswechsel: der 1. September 2026 ist ein Dienstag.
check("Wochenstart ueber den Monatswechsel",
  wochenStart("2026-09-01"), "2026-08-31");

const woche = baueWoche(HEUTE, HEUTE);
check("sieben Tage", woche.length, 7);
check("beginnt am Montag", woche[0].datum, "2026-09-07");
check("endet am Sonntag", woche[6].datum, "2026-09-13");
check("kein Tag ist ausserhalb", woche.filter((t) => t.ausserhalb).length, 0);
check("heute ist markiert", woche.filter((t) => t.heute).map((t) => t.datum), [HEUTE]);

// Eine Woche ueber den Jahreswechsel darf nicht zerfallen.
const silvester = baueWoche("2026-12-31", HEUTE);
check("Woche ueber den Jahreswechsel",
  [silvester[0].datum, silvester[6].datum], ["2026-12-28", "2027-01-03"]);

/* -------------------------------------------------------- Dringlichkeit */

check("gestern ist ueberfaellig", dringlichkeit("2026-09-08", HEUTE), "ueberfaellig");
check("heute ist heute", dringlichkeit(HEUTE, HEUTE), "heute");
check("morgen ist spaeter", dringlichkeit("2026-09-10", HEUTE), "spaeter");
check("ohne Datum ist ohne", dringlichkeit(null, HEUTE), "ohne");

console.log(fails === 0 ? "\nAlles grün." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
