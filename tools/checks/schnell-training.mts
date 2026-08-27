// Kontrollwerte für „Push oder Pull antippen" (ab 24.08.2026).
// Aufruf:  npx -y tsx tools/checks/schnell-training.mts
//
// Der Punkt dieser Datei ist der Tag, an dem der Eintrag landet. Ein Knopf,
// der lautlos ins falsche Datum schreibt, sieht wie ein funktionierender
// Knopf aus — und die falsche Zahl steht dann in der Wochenzählung.
import {
  erlaubtesDatum, zeitstempel, istSplit, NACHTRAG_TAGE,
  ausDatumUndZeit, zonenVersatz,
} from "../../src/lib/schnell-training";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const HEUTE = "2026-08-24";

check("heute bleibt heute", erlaubtesDatum(HEUTE, HEUTE), HEUTE);
check("gestern ist erlaubt", erlaubtesDatum("2026-08-23", HEUTE), "2026-08-23");
check("genau an der Grenze noch erlaubt", erlaubtesDatum("2026-08-17", HEUTE), "2026-08-17");
check("einen Tag zu weit zurueck faellt auf heute",
  erlaubtesDatum("2026-08-16", HEUTE), HEUTE);
check("Zukunft faellt auf heute", erlaubtesDatum("2026-08-25", HEUTE), HEUTE);
check("weite Zukunft auch", erlaubtesDatum("2027-01-01", HEUTE), HEUTE);
check("Unsinn faellt auf heute", erlaubtesDatum("morgen", HEUTE), HEUTE);
check("leer faellt auf heute", erlaubtesDatum("", HEUTE), HEUTE);
check("null faellt auf heute", erlaubtesDatum(null, HEUTE), HEUTE);
check("Zahl faellt auf heute", erlaubtesDatum(20260824, HEUTE), HEUTE);
check("Zeitstempel wird auf den Tag gekuerzt",
  erlaubtesDatum("2026-08-23T22:15:00Z", HEUTE), "2026-08-23");
check("Nachtragsfenster ist eine Woche", NACHTRAG_TAGE, 7);

/* --------------------------------------------------------- Zeitstempel */
//
// Warum mittags und nicht Mitternacht. Beim Schreiben stand hier zuerst „in
// der Schweiz faellt Mitternacht UTC auf den Vortag" — das ist falsch, die
// Schweiz liegt VOR UTC, dort wird daraus 02:00 desselben Tages. Der Test
// hat den Denkfehler gefunden, nicht das Nachdenken.
//
// Der echte Grund: Mittag haelt den groesstmoeglichen Abstand zu beiden
// Tagesgrenzen. Er bleibt in jedem Versatz von −11 bis +11 Stunden auf
// demselben Tag — das deckt die Schweiz mit +1/+2 mit riesigem Spielraum.
// „In JEDER Zeitzone" waere trotzdem gelogen, und auch das hat der Test
// gefunden: Auckland liegt bei +12, dort ist 12:00 UTC schon der naechste
// Tag. Die Zeile steht unten drin, damit die Grenze dokumentiert ist und
// niemand die Behauptung ein drittes Mal zu gross macht.
const JETZT = "2026-08-24T19:42:11.000Z";
const tagIn = (iso: string, zone: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: zone });

check("heute nimmt die echte Uhrzeit", zeitstempel(HEUTE, HEUTE, JETZT), JETZT);
check("nachgetragen wird mittags",
  zeitstempel("2026-08-23", HEUTE, JETZT), "2026-08-23T12:00:00.000Z");

const mittags = zeitstempel("2026-08-23", HEUTE, JETZT);
for (const zone of ["Europe/Zurich", "UTC", "America/New_York", "Pacific/Honolulu"]) {
  check(`Mittag bleibt der 23. in ${zone}`, tagIn(mittags, zone), "2026-08-23");
}
check("bei +12 kippt auch der Mittag — bekannte Grenze, nicht Kerims Zeitzone",
  tagIn(mittags, "Pacific/Auckland"), "2026-08-24");
// Und der Gegenbeweis: mit Mitternacht waere es westlich von Greenwich
// reproduzierbar der Vortag.
check("Mitternacht UTC waere in New York der 22.",
  tagIn("2026-08-23T00:00:00.000Z", "America/New_York"), "2026-08-22");

/* ------------------------------------------------------------- Splits */
check("push gilt", istSplit("push"), true);
check("pull gilt", istSplit("pull"), true);
check("Grossschreibung gilt nicht — das Formular schickt klein",
  istSplit("Push"), false);
check("Beine gibt es nicht als eigenen Knopf", istSplit("beine"), false);
check("leer gilt nicht", istSplit(""), false);
check("null gilt nicht", istSplit(null), false);


/* --------------------------------------- Datum + Uhrzeit (27.08.2026) */
//
// Kerim tippt „gestern, 19:30". Gemeint ist halb acht BEI IHM. Die Schweiz
// steht im Sommer +2 und im Winter +1 — eine fest verdrahtete Verschiebung
// waere ein halbes Jahr lang eine Stunde daneben.
check("Sommerzeit: 19:30 in Zuerich sind 17:30 UTC",
  ausDatumUndZeit("2026-08-26", "19:30"), "2026-08-26T17:30:00.000Z");
check("Winterzeit: dieselbe Uhrzeit ist 18:30 UTC",
  ausDatumUndZeit("2026-12-15", "19:30"), "2026-12-15T18:30:00.000Z");
check("Versatz im Sommer sind 120 Minuten",
  zonenVersatz(Date.parse("2026-08-26T12:00:00Z")), 120);
check("und im Winter 60",
  zonenVersatz(Date.parse("2026-12-15T12:00:00Z")), 60);

// Frueh am Morgen: die Ortszeit faellt dann auf den Vortag in UTC.
check("07:00 Ortszeit im Sommer sind 05:00 UTC am selben Tag",
  ausDatumUndZeit("2026-08-26", "07:00"), "2026-08-26T05:00:00.000Z");
check("01:00 Ortszeit im Sommer ist der Vortag in UTC",
  ausDatumUndZeit("2026-08-26", "01:00"), "2026-08-25T23:00:00.000Z");

// Unsinn faellt auf Mittag zurueck — den Wert, der die Tagesgrenze am
// weitesten meidet.
for (const kaputt of ["", "25:00", "7:5", "abends", null, undefined, 1930]) {
  check(`ungueltige Zeit ${JSON.stringify(kaputt)} wird Mittag`,
    ausDatumUndZeit("2026-08-26", kaputt).slice(11, 16),
    // Mittag ORTSZEIT, also im Sommer 10:00 UTC. Beim Schreiben stand hier
    // "Mittag als UTC gemeint" — falsch, der Test hat es gezeigt. Fuer den
    // Zweck reicht es: der Tag haelt, und mehr soll der Rueckfall nicht.
    "10:00");
}

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
