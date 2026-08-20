// Kontrollwerte für die Saisonalität.
// Aufruf:  npx -y tsx tools/checks/saison.mts
//
// Die zwei Tests, auf die es ankommt, stehen unten: dass eine Luecke in der
// Kurshistorie NICHT als Monatsrendite durchgeht, und dass `saisonZum` nur
// Jahre vor dem Stichtag benutzt. Ohne den zweiten weiss ein Rueckblick, wie
// der Monat ausging, den er gerade beurteilt — genau der Fehler, der den
// Labor-Backfill unbrauchbar macht.
import {
  monatsRenditen, saisonBild, saisonZum, MAX_JAHRE, MIN_JAHRE, FENSTER,
  type Kurspunkt,
} from "../../src/lib/confluence/saison";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

/** Ein Kurspunkt am Monatsende. */
const k = (monat: string, schluss: number): Kurspunkt => ({ datum: `${monat}-28`, schluss });

/* ------------------------------------------------------- Monatsrenditen */

check("Rendite gegen den Vormonat",
  monatsRenditen([k("2020-01", 100), k("2020-02", 110)]).map((m) => Math.round(m.ret)),
  [10]);
check("ein einzelner Monat ergibt nichts",
  monatsRenditen([k("2020-01", 100)]).length, 0);
check("der letzte Kurs im Monat zaehlt",
  monatsRenditen([
    { datum: "2020-01-05", schluss: 100 }, { datum: "2020-01-28", schluss: 100 },
    { datum: "2020-02-03", schluss: 50 }, { datum: "2020-02-27", schluss: 200 },
  ]).map((m) => Math.round(m.ret)), [100]);

// Der wichtige Fall: zwischen Januar und Dezember fehlen zehn Monate. Ohne
// die Luecken-Pruefung stuende hier eine Jahresrendite als Monatsrendite.
check("eine Luecke ueberspringt den Monat, statt ihn zu erfinden",
  monatsRenditen([k("2020-01", 100), k("2020-12", 300)]).length, 0);
check("nach der Luecke geht es normal weiter",
  monatsRenditen([k("2020-01", 100), k("2020-12", 300), k("2021-01", 330)])
    .map((m) => Math.round(m.ret)), [10]);
check("unbrauchbare Kurse fliegen raus",
  monatsRenditen([k("2020-01", 0), k("2020-02", 110), k("2020-03", 121)])
    .map((m) => Math.round(m.ret)), [10]);
check("unsortierte Eingabe wird sortiert",
  monatsRenditen([k("2020-02", 110), k("2020-01", 100)]).map((m) => Math.round(m.ret)),
  [10]);

/* ---------------------------------------------------------- Saisonbild */

/** 12 Jahre, in denen der Maerz immer steigt und der Rest flach ist. */
function reihe(jahre: number, maerzPlus: number): Kurspunkt[] {
  const out: Kurspunkt[] = [];
  let kurs = 100;
  for (let j = 0; j < jahre; j++) {
    for (let m = 1; m <= 12; m++) {
      kurs = m === 3 ? kurs * (1 + maerzPlus / 100) : kurs;
      out.push(k(`${2010 + j}-${String(m).padStart(2, "0")}`, kurs));
    }
  }
  return out;
}

const bild = saisonBild("EURUSD", reihe(12, 2), 20, "2022-06-15");
const maerz = bild.monate.find((m) => m.monat === 3)!;
const april = bild.monate.find((m) => m.monat === 4)!;

check("Maerz wird als belegt erkannt", maerz.belegt, true);
check("und zeigt nach oben", maerz.richtung, 1);
check("Trefferquote ist 100 %", maerz.quote.quote, 1);
check("flacher April ist nicht belegt", april.belegt, false);
check("und bekommt keine Richtung", april.richtung, 0);
check("Jahre je Monat werden gezaehlt", maerz.jahre >= 10, true);
// Ein Monat, der sich historisch NIE bewegt hat, darf keine Richtung bekommen.
// Vor dem Fix zaehlten die Nullen als Verluste und der April stand auf
// "belegt nach unten" — mit 0 % Trefferquote und einem sauberen Intervall.
check("flache Jahre landen nicht im Nenner", april.quote.n, 0);
check("werden aber ausgewiesen", april.flach, april.jahre);
check("belegte Monate werden zusammengezaehlt", bild.belegte, 1);
check("zwoelf Monate, immer", bild.monate.length, 12);

// Median neben Durchschnitt: ein einzelner Ausreisser darf nicht als Muster
// durchgehen. Elf flache Jahre, ein Jahr mit +50 % im Juli.
const ausreisser: Kurspunkt[] = [];
let kurs = 100;
for (let j = 0; j < 12; j++) {
  for (let m = 1; m <= 12; m++) {
    if (m === 7 && j === 5) kurs *= 1.5;
    ausreisser.push(k(`${2010 + j}-${String(m).padStart(2, "0")}`, kurs));
  }
}
const juli = saisonBild("X", ausreisser, 20, "2022-06-15").monate.find((m) => m.monat === 7)!;
check("Ausreisser hebt den Durchschnitt", (juli.schnitt ?? 0) > 3, true);
check("laesst den Median aber kalt", juli.median, 0);
check("und der Monat gilt nicht als belegt", juli.belegt, false);

check("zu wenig Jahre ergibt nichts Belegtes",
  saisonBild("X", reihe(3, 5), 20, "2022-06-15").belegte, 0);
check("leere Kurse sind kein Fehler",
  saisonBild("X", [], 20, "2022-06-15").belegte, 0);

/* ------------------------------------------------------------- Rueckblick */

// Der Lookahead-Test. Der Maerz 2021 war nach oben; fragt man am 01.03.2021,
// darf dieses Jahr NICHT mitzaehlen — sonst kennt der Rueckblick sein eigenes
// Ergebnis. Also: die Jahre-Zahl muss kleiner sein als bei einer Abfrage
// nach dem Monat.
const vorher = saisonZum(reihe(12, 2), "2021-03-01", 20)!;
const nachher = saisonZum(reihe(12, 2), "2021-04-01", 20)!;
check("Rueckblick trifft den richtigen Monat", [vorher.monat, nachher.monat], [3, 4]);
check("und laesst den laufenden Monat draussen",
  vorher.jahre < saisonBild("X", reihe(12, 2), 20, "2022-06-15")
    .monate.find((m) => m.monat === 3)!.jahre, true);
check("ohne Historie kein Rueckblick", saisonZum([], "2021-03-01", 20), null);

/* ---------------------------------------------------------- Grenzwerte */

check("Fenster enthaelt kein 25", FENSTER.includes(25 as never), false);
check("und keines ueberschreitet die Datentiefe",
  FENSTER.every((f) => f <= MAX_JAHRE), true);
check("Mindestjahre sind gesetzt", MIN_JAHRE >= 5, true);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
