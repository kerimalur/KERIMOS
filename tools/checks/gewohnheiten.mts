// Kontrollwerte für die Zählung der Gewohnheiten.
// Aufruf:  npx -y tsx tools/checks/gewohnheiten.mts
//
// Drei Dinge stehen hier auf dem Prüfstand, und alle drei würde man im
// Betrieb erst merken, wenn die Zahl seit Tagen falsch ist:
//
//   1. Die Serie darf NICHT auf null fallen, nur weil heute noch nichts
//      eingetragen ist. Sie zählt Tage, nicht Einheiten.
//   2. Die Wochenzahl zählt Einheiten: Kraft am Morgen und Ausdauer am
//      Abend sind zwei, nicht eine.
//   3. Das Monatsraster beginnt am Montag und deckt den Monat vollständig
//      ab — auch den Februar und auch über den Jahreswechsel.
import {
  streakBis, zaehleZeitraum, zaehleVarianten, tageAus, baueMonatsRaster,
  monatPlus, monatsStart, monatsLabel, wochenKaestchen, type Eintrag,
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

/** Kurzschreibweise: "2026-09-08" oder "2026-09-08/Push". */
const e = (...roh: string[]): Eintrag[] =>
  roh.map((r) => {
    const [datum, variante] = r.split("/");
    return { datum, variante: variante ?? null };
  });

// Mittwoch, 9. September 2026. Montag dieser Woche ist der 7.
const HEUTE = "2026-09-09";
const MONTAG = "2026-09-07";

/* ------------------------------------------------------------- Die Serie */

check("heute eingetragen, davor zwei Tage → 3",
  streakBis(tageAus(e("2026-09-09", "2026-09-08", "2026-09-07")), HEUTE), 3);

// Der Kernfall: heute noch offen, gestern und vorgestern getan.
check("heute offen, gestern getan → 2 (nicht 0)",
  streakBis(tageAus(e("2026-09-08", "2026-09-07")), HEUTE), 2);

check("gestern ausgelassen → 0",
  streakBis(tageAus(e("2026-09-07", "2026-09-06")), HEUTE), 0);

check("nie getan → 0", streakBis(tageAus([]), HEUTE), 0);

check("Serie über den Monatswechsel → 3",
  streakBis(tageAus(e("2026-09-01", "2026-08-31", "2026-08-30")), "2026-09-01"), 3);

// Zwei Einheiten an einem Tag sind EIN Tag Serie, nicht zwei.
check("Push und Ausdauer am selben Tag → Serie 1",
  streakBis(tageAus(e("2026-09-09/Push", "2026-09-09/Ausdauer")), HEUTE), 1);

/* ------------------------------------------------ Zeitraum und Varianten */

check("diese Woche zählt nur bis heute",
  zaehleZeitraum(e("2026-09-07", "2026-09-09", "2026-09-14"), MONTAG, HEUTE), 2);

// Hier zählen Einheiten, nicht Tage — das ist der Unterschied zur Serie.
check("zwei Einheiten am selben Tag zählen doppelt",
  zaehleZeitraum(e("2026-09-09/Push", "2026-09-09/Ausdauer"), MONTAG, HEUTE), 2);

check("leerer Zeitraum → 0",
  zaehleZeitraum(e("2026-01-01"), MONTAG, HEUTE), 0);

const varianten = zaehleVarianten(
  e("2026-09-07/Push", "2026-09-08/Pull", "2026-09-09/Push", "2026-09-14/Push"),
  MONTAG, HEUTE);
check("Push zweimal diese Woche", varianten.get("Push"), 2);
check("Pull einmal diese Woche", varianten.get("Pull"), 1);
check("die Einheit von naechster Woche zaehlt nicht mit",
  [...varianten.values()].reduce((a, b) => a + b, 0), 3);

/* --------------------------------------------------------------- Monate */

check("Monatsstart", monatsStart("2026-09-09"), "2026-09-01");
check("ein Monat zurueck", monatPlus("2026-09-01", -1), "2026-08-01");
check("ueber den Jahreswechsel zurueck", monatPlus("2026-01-01", -1), "2025-12-01");
check("ueber den Jahreswechsel vor", monatPlus("2026-12-01", 1), "2027-01-01");
check("zwoelf Monate zurueck", monatPlus("2026-09-01", -12), "2025-09-01");
check("Beschriftung", monatsLabel("2026-09-01"), "September 2026");

/* --------------------------------------------------------- Monatsraster */

const raster = baueMonatsRaster(e("2026-09-08/Push", "2026-09-08/Ausdauer"),
  "2026-09-01", HEUTE);

// September 2026 beginnt an einem Dienstag → ein Vorlauftag (31. August).
check("Raster beginnt am Montag", raster[0].datum, "2026-08-31");
check("Vorlauftag ist ausserhalb", raster[0].ausserhalb, true);
check("volle Wochen", raster.length % 7, 0);

const drin = raster.filter((t) => !t.ausserhalb);
check("September hat 30 Tage", drin.length, 30);
check("erster im Monat", drin[0].datum, "2026-09-01");
check("letzter im Monat", drin[drin.length - 1].datum, "2026-09-30");

check("zwei Einheiten an einem Tag stehen beide im Raster",
  raster.find((t) => t.datum === "2026-09-08")?.eintraege.length, 2);

check("heute ist noch keine Zukunft",
  raster.find((t) => t.datum === HEUTE)?.zukunft, false);
check("morgen zaehlt als Zukunft",
  raster.find((t) => t.datum === "2026-09-10")?.zukunft, true);
check("kein vergangener Tag ist Zukunft",
  raster.filter((t) => t.datum <= HEUTE && t.zukunft).length, 0);

// Der Februar ist der Fall, an dem eine selbstgebaute Datumsrechnung scheitert.
const feb = baueMonatsRaster([], "2028-02-01", HEUTE)
  .filter((t) => !t.ausserhalb);
check("Februar 2028 ist ein Schaltjahr", feb.length, 29);

const feb27 = baueMonatsRaster([], "2027-02-01", HEUTE)
  .filter((t) => !t.ausserhalb);
check("Februar 2027 hat 28 Tage", feb27.length, 28);

/* -------------------------------------------------------- Wochenkaestchen */

// Der Kernfall: so viele Kaestchen wie das Ziel, nicht sieben.
check("Ziel 4, dreimal getan",
  wochenKaestchen(3, 4), { gesamt: 4, gefuellt: 3, ueber: 0 });

check("Ziel erreicht ist voll, nicht drei Siebtel leer",
  wochenKaestchen(4, 4), { gesamt: 4, gefuellt: 4, ueber: 0 });

// Ueberschuss wird nicht abgeschnitten, aber auch nicht als Kaestchen gezeigt.
check("mehr als das Ziel",
  wochenKaestchen(6, 4), { gesamt: 4, gefuellt: 4, ueber: 2 });

check("noch nichts getan",
  wochenKaestchen(0, 3), { gesamt: 3, gefuellt: 0, ueber: 0 });

// Ohne Ziel gibt es keine Reihe — eines zu erfinden waere eine Bewertung.
check("ohne Ziel keine Kaestchen",
  wochenKaestchen(5, 0), { gesamt: 0, gefuellt: 0, ueber: 0 });

check("taeglich: sieben Kaestchen",
  wochenKaestchen(7, 7), { gesamt: 7, gefuellt: 7, ueber: 0 });

console.log(fails === 0 ? "\nAlles grün." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
