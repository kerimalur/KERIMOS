// Kontrollwerte für die Zählung der Gewohnheiten.
// Aufruf:  npx -y tsx tools/checks/gewohnheiten.mts
//
// Der wichtigste Test steht unten: die Serie darf NICHT auf null fallen, nur
// weil heute noch nichts abgehakt ist. Genau das würde man erst am Abend
// merken, wenn die Zahl seit dem Morgen falsch dasteht — und es ist die eine
// Zahl, wegen der man den Tracker überhaupt anschaut.
import {
  streakBis, baueRaster, zaehleZeitraum, RASTER_WOCHEN,
} from "../../src/lib/gewohnheiten-zaehlung";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}` +
    (ok ? "" : ` (erwartet ${JSON.stringify(expected)})`)
  );
}

/* ------------------------------------------------------------- Die Serie */

// Mittwoch, 9. September 2026. Montag dieser Woche ist der 7.
const HEUTE = "2026-09-09";
const MONTAG = "2026-09-07";

const tage = (...d: string[]) => new Set(d);

check("heute abgehakt, davor zwei Tage → 3",
  streakBis(tage("2026-09-09", "2026-09-08", "2026-09-07"), HEUTE), 3);

// Der Kernfall: heute noch offen, gestern und vorgestern getan.
check("heute offen, gestern getan → 2 (nicht 0)",
  streakBis(tage("2026-09-08", "2026-09-07"), HEUTE), 2);

check("gestern ausgelassen → 0",
  streakBis(tage("2026-09-07", "2026-09-06"), HEUTE), 0);

check("nie getan → 0", streakBis(tage(), HEUTE), 0);

check("nur heute → 1", streakBis(tage("2026-09-09"), HEUTE), 1);

// Über den Monatswechsel: der 1. September folgt auf den 31. August.
check("Serie über den Monatswechsel → 3",
  streakBis(tage("2026-09-01", "2026-08-31", "2026-08-30"), "2026-09-01"), 3);

/* -------------------------------------------------------------- Zeitraum */

const woche = tage("2026-09-07", "2026-09-09", "2026-09-14");
check("diese Woche zählt nur bis heute",
  zaehleZeitraum(woche, MONTAG, HEUTE), 2);

check("leerer Zeitraum → 0",
  zaehleZeitraum(tage("2026-01-01"), MONTAG, HEUTE), 0);

/* ---------------------------------------------------------------- Raster */

const raster = baueRaster(tage("2026-09-08"), HEUTE, MONTAG);

check("Raster hat vier volle Wochen", raster.length, RASTER_WOCHEN * 7);
check("Raster beginnt drei Wochen vor dem Montag", raster[0].datum, "2026-08-17");
check("Raster endet am Sonntag dieser Woche",
  raster[raster.length - 1].datum, "2026-09-13");

// Die Spalten müssen Wochentage sein: jedes siebte Feld ist wieder ein Montag.
check("jede Zeile beginnt am Montag",
  [raster[0].datum, raster[7].datum, raster[14].datum, raster[21].datum],
  ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"]);

check("der abgehakte Tag ist markiert",
  raster.find((t) => t.datum === "2026-09-08")?.getan, true);

check("heute ist noch keine Zukunft",
  raster.find((t) => t.datum === HEUTE)?.zukunft, false);

check("morgen zählt als Zukunft",
  raster.find((t) => t.datum === "2026-09-10")?.zukunft, true);

check("kein vergangener Tag ist Zukunft",
  raster.filter((t) => t.datum <= HEUTE && t.zukunft).length, 0);

console.log(fails === 0 ? "\nAlles grün." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
