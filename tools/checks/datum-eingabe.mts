// Kontrollwerte für die Datumseingabe beim Backtesten.
// Aufruf:  npx -y tsx tools/checks/datum-eingabe.mts
//
// Der wichtigste Test steht unten bei den ungültigen Eingaben: ein Parser,
// der aus "31.2.2022" irgendetwas macht, ist schlimmer als gar keiner — dann
// steht ein falsches Datum im Journal und niemand sieht es je wieder an.
import {
  parseDatum, tageImMonat, ersterWochentag, istWochenende,
  verschiebeTage, alsDeutsch, alsIso,
} from "../../src/lib/datum-eingabe";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

/* ------------------------------------------------------- Alle Schreibweisen */

check("ISO bleibt ISO", parseDatum("2022-03-12", 2020), "2022-03-12");
check("deutsch mit vier Jahresziffern", parseDatum("12.03.2022", 2020), "2022-03-12");
check("deutsch ohne fuehrende Null", parseDatum("12.3.2022", 2020), "2022-03-12");
check("zweistelliges Jahr", parseDatum("12.3.22", 2020), "2022-03-12");
check("Zehnerblock achtstellig", parseDatum("12032022", 2020), "2022-03-12");
check("Zehnerblock sechsstellig", parseDatum("120322", 2020), "2022-03-12");
check("Zehnerblock vierstellig nimmt das Bezugsjahr", parseDatum("1203", 2022), "2022-03-12");
check("Schraegstrich geht auch", parseDatum("12/3/22", 2020), "2022-03-12");
check("Leerzeichen ebenso", parseDatum("12 3 22", 2020), "2022-03-12");
check("Tag und Monat allein nehmen das Bezugsjahr", parseDatum("12.3", 2022), "2022-03-12");
check("mit Punkt am Ende ebenso", parseDatum("12.3.", 2022), "2022-03-12");
check("Leerzeichen aussen stoeren nicht", parseDatum("  12.3.22 ", 2020), "2022-03-12");

/* ------------------------------------------------------ Zweistellige Jahre */

check("79 ist 2079", parseDatum("1.1.79", 2020), "2079-01-01");
check("80 ist 1980", parseDatum("1.1.80", 2020), "1980-01-01");

/* ------------------------------------------------------------- Was NICHT geht */

check("leere Eingabe", parseDatum("", 2022), null);
check("Buchstaben", parseDatum("Quatsch", 2022), null);
check("31. Februar gibt es nicht", parseDatum("31.2.2022", 2020), null);
check("29. Februar 2023 auch nicht", parseDatum("29.2.2023", 2020), null);
check("aber 2024 schon", parseDatum("29.2.2024", 2020), "2024-02-29");
check("Monat 13", parseDatum("12.13.2022", 2020), null);
check("Tag 0", parseDatum("0.3.2022", 2020), null);
check("halbe Eingabe", parseDatum("12.", 2022), null);
check("Jahr ausserhalb", parseDatum("12.3.1500", 2020), null);

/* --------------------------------------------------------------- Kalender */

check("Februar im Schaltjahr", tageImMonat(2024, 2), 29);
check("Februar sonst", tageImMonat(2023, 2), 28);
check("April hat 30", tageImMonat(2022, 4), 30);
check("Dezember hat 31", tageImMonat(2022, 12), 31);

// 1. Maerz 2022 war ein Dienstag -> Spalte 1 (Montag ist 0).
check("Monatsanfang faellt auf die richtige Spalte", ersterWochentag(2022, 3), 1);
// 1. Januar 2022 war ein Samstag -> Spalte 5.
check("und am Jahresanfang auch", ersterWochentag(2022, 1), 5);

// Genau die zwei Faelle, die im Journal als Wochenend-Trades stehen.
check("Sonntag ist Wochenende", istWochenende("2023-04-30"), true);
check("Samstag auch", istWochenende("2021-05-01"), true);
check("Dienstag nicht", istWochenende("2022-03-01"), false);

/* ------------------------------------------------------------- Verschieben */

check("ueber den Monatsanfang zurueck", verschiebeTage("2022-03-01", -1), "2022-02-28");
check("ueber den Jahreswechsel vor", verschiebeTage("2022-12-31", 1), "2023-01-01");
check("in den Schalttag", verschiebeTage("2024-02-28", 1), "2024-02-29");

/* --------------------------------------------------------------- Anzeige */

check("ISO wird deutsch", alsDeutsch("2022-03-12"), "12.03.2022");
check("Unfug bleibt leer", alsDeutsch("kaputt"), "");
check("ISO wird zusammengesetzt", alsIso(2022, 3, 5), "2022-03-05");

// Rundlauf: was angezeigt wird, muss auch wieder eingelesen werden koennen.
check("Anzeige und Parser passen zusammen",
  parseDatum(alsDeutsch("2021-08-30"), 1999), "2021-08-30");

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
