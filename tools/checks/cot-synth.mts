// Kontrollwerte für die synthetische COT-Rechnung (ab 26.08.2026).
// Aufruf:  npx -y tsx tools/checks/cot-synth.mts
//
// Der wichtigste Wert steht ganz unten: Kerims echtes Panel vom 26.08.2026
// (EURCHF, Commercials 95.83, Retail 57.37, Impuls 82.37) muss Score 38.46
// und Bias 1.03 ergeben. Wer diese Zeile ändert, ändert den Nachbau weg von
// dem, was sein Chart zeigt.
import {
  ausrichten, synthReihe, aenderungen, rangImFenster, biasVon, synthBild,
  synthRaengeReihe, SYNTH, BIAS_WORT,
} from "../../src/lib/confluence/cot-synth";
import type { Punkt } from "../../src/lib/confluence/reihen";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

/** Wochenreihe ab einem Dienstag, ein Wert je Woche. */
function reihe(werte: number[], start = "2023-01-03"): Punkt[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return werte.map((wert, i) => ({
    datum: new Date(t0 + i * 7 * 86400000).toISOString().slice(0, 10), wert,
  }));
}

/* ---------------------------------------------------------- Ausrichten */
const a = [{ datum: "2026-01-06", wert: 1 }, { datum: "2026-01-13", wert: 2 },
           { datum: "2026-01-20", wert: 3 }];
const b = [{ datum: "2026-01-06", wert: 10 }, { datum: "2026-01-20", wert: 30 }];

check("nur gemeinsame Termine bleiben",
  ausrichten([a, b]).map((z) => z.datum), ["2026-01-06", "2026-01-20"]);
check("und die Werte stehen in der Reihenfolge der Eingabe",
  ausrichten([a, b]).map((z) => z.werte), [[1, 10], [3, 30]]);
check("eine Reihe allein bleibt vollstaendig", ausrichten([a]).length, 3);
check("keine Reihe gibt nichts", ausrichten([]), []);
check("ohne Ueberschneidung gibt es nichts",
  ausrichten([a, [{ datum: "2020-01-01", wert: 1 }]]).length, 0);

// Der Fall, den es zu verhindern gilt: eine fehlende Woche darf NICHT alles
// Folgende um eine Position verschieben — der Impuls rechnet ueber Positionen.
check("Luecke verschiebt nichts, sie faellt raus",
  synthReihe(a, b), [{ datum: "2026-01-06", wert: -9 },
                     { datum: "2026-01-20", wert: -27 }]);

/* ---------------------------------------------------------- Aenderungen */
const r5 = reihe([10, 12, 15, 14, 20]);
check("Zwei-Wochen-Aenderungen", aenderungen(r5, 2).map((p) => p.wert), [5, 2, 5]);
check("Datum ist das des juengeren Werts",
  aenderungen(r5, 2)[0].datum, r5[2].datum);
check("Abstand groesser als die Reihe gibt nichts", aenderungen(r5, 9), []);
check("Abstand eins", aenderungen(r5, 1).map((p) => p.wert), [2, 3, -1, 6]);

/* --------------------------------------------------------------- Rang */
// 156 aufsteigende Werte: der letzte ist der hoechste.
const auf = reihe(Array.from({ length: SYNTH.wochen }, (_, i) => i));
const letzterTermin = auf[auf.length - 1].datum;
const spaeter = (d: string, tage: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + tage * 86400000).toISOString().slice(0, 10);

const rAuf = rangImFenster(auf, spaeter(letzterTermin, 3));
check("volles Fenster wird erkannt", rAuf?.n, SYNTH.wochen);
check("hoechster Wert steht ganz oben",
  rAuf === null ? null : Number(rAuf.rang.toFixed(2)), 99.68);
// Und zwar (n - 0.5)/n, nicht (n-1)/n: der eigene Wert zaehlt als Gleichstand
// mit sich selbst und geht zur Haelfte ein. Beim ersten Schreiben stand hier
// (n-1)/n und der Test schlug fehl — der Code hatte recht.
check("naemlich (n - 0.5)/n",
  Number(((SYNTH.wochen - 0.5) / SYNTH.wochen * 100).toFixed(2)), 99.68);

// Ein Wert weniger als das Fenster: kein Rang. Ein Rang aus dreissig Wochen
// saehe genauso aus wie einer aus drei Jahren.
check("ein Wert zu wenig gibt keinen Rang",
  rangImFenster(auf.slice(1), spaeter(letzterTermin, 3)), null);

// Gleichstand: alle Werte gleich -> Mittelrang ist genau 50.
const flach = reihe(Array.from({ length: SYNTH.wochen }, () => 7));
check("bei lauter gleichen Werten liegt der Mittelrang bei 50",
  rangImFenster(flach, spaeter(flach[flach.length - 1].datum, 3))?.rang, 50);

// Der Verzug: der Bericht vom Dienstag gilt erst ab Freitag. Dafuer braucht
// es einen Wert MEHR als das Fenster — sonst faellt der Rang bei
// abgezogenem letzten Bericht unter die Mindestlaenge und es kommt null
// statt des Vorgaengers zurueck. Auch das hat der Test gezeigt.
const auf157 = reihe(Array.from({ length: SYNTH.wochen + 1 }, (_, i) => i));
const letzter157 = auf157[auf157.length - 1].datum;
check("am Berichtstag selbst zaehlt er noch nicht",
  rangImFenster(auf157, letzter157)?.datum, auf157[auf157.length - 2].datum);
check("drei Tage spaeter schon",
  rangImFenster(auf157, spaeter(letzter157, 3))?.datum, letzter157);
check("und das Fenster bleibt bei 156, obwohl 157 da sind",
  rangImFenster(auf157, spaeter(letzter157, 3))?.n, SYNTH.wochen);

/* ------------------------------------------------------- Score und Bias */
//
// DER Kontrollwert dieser Datei: Kerims Panel vom 26.08.2026, EURCHF 12h.
// Commercials 95.83, Retail 57.37, Impuls-Rang 82.37 — daraus muss
// Score 38.46 und Bias 1.03 STARK LONG werden. Weicht das ab, rechnet
// KerimOS etwas anderes als sein Chart, und der ganze Nachbau ist wertlos.
const echt = biasVon(95.83, 57.37, 82.37);
check("Panel 26.08.: Score", Number(echt.score.toFixed(2)), 38.46);
check("Panel 26.08.: Bias", Number(echt.bias.toFixed(2)), 1.03);
check("Panel 26.08.: Stufe", BIAS_WORT[echt.stufe], "STARK LONG");
// Und die Aufteilung, weil sie der eigentliche Befund war: zwei Drittel des
// Bias kommen aus dem Impuls, nicht aus dem Niveau.
check("Niveau-Anteil", Number(echt.niveau.toFixed(4)), 0.3846);
check("Impuls-Anteil", Number((echt.impuls ?? 0).toFixed(4)), 0.6474);

// Schwellen
check("genau auf der starken Schwelle zaehlt als stark",
  biasVon(100, 0, 50).stufe, "stark-long");
check("Spiegelbild nach unten", biasVon(0, 100, 50).stufe, "stark-short");
check("in der Mitte neutral", biasVon(50, 50, 50).stufe, "neutral");
check("knapp unter 0.4 ist neutral", biasVon(39, 0, 50).stufe, "neutral");
check("ab 0.4 ist es Long", biasVon(40, 0, 50).stufe, "long");

// Ohne Impuls zaehlt nur das Niveau — so macht es sein Skript auch.
check("fehlender Impuls faellt weg statt auf 0.5 zu raten",
  biasVon(95.83, 57.37, null).bias, biasVon(95.83, 57.37, 50).bias);
check("und ergibt dann nur den Niveau-Anteil",
  Number(biasVon(95.83, 57.37, null).bias.toFixed(4)), 0.3846);

// Geklemmt: ein Niveau kann nie mehr als 1 beitragen.
check("Niveau ist geklemmt", biasVon(100, 0, 100).bias, 2);
check("und nach unten auch", biasVon(0, 100, 0).bias, -2);

/* --------------------------------------------------------- Ganzes Bild */
// Ein Paar, bei dem die Basis stetig steigt und die Quote stetig faellt:
// die synthetische Reihe steht damit am oberen Extrem.
const n = SYNTH.wochen + 4;
const steigend = reihe(Array.from({ length: n }, (_, i) => i / 100));
const fallend  = reihe(Array.from({ length: n }, (_, i) => -i / 100));
const stich = spaeter(steigend[n - 1].datum, 3);

const bild = synthBild("EURCHF", stich, steigend, fallend, fallend, steigend);
check("Commercials am oberen Rand",
  bild.kommRang === null ? null : Number(bild.kommRang.toFixed(2)), 99.68);
check("Retail am unteren Rand",
  bild.retailRang === null ? null : Number(bild.retailRang.toFixed(2)), 0.32);
check("das ist ein Extrem long", bild.extrem, 1);
check("Berichtstermin ist der juengste", bild.datum, steigend[n - 1].datum);
check("Fenstergroesse", bild.n, SYNTH.wochen);

// Gespiegelt: dasselbe Paar andersherum muss ein Extrem short geben.
check("gespiegelt ist es short",
  synthBild("EURCHF", stich, fallend, steigend, steigend, fallend).extrem, -1);

// Zu kurze Historie: keine Raenge, aber auch kein erfundenes Extrem.
const kurz = reihe(Array.from({ length: 40 }, (_, i) => i));
const kurzBild = synthBild("EURCHF", spaeter(kurz[39].datum, 3), kurz, kurz, kurz, kurz);
check("zu kurze Historie gibt keine Raenge", kurzBild.kommRang, null);
check("und kein Extrem", kurzBild.extrem, 0);
check("die Laenge steht trotzdem da", kurzBild.n, 40);

// Ohne gemeinsame Termine gar nichts.
check("ohne Ueberschneidung leeres Bild",
  synthBild("EURCHF", stich, steigend, [{ datum: "1999-01-05", wert: 1 }],
    steigend, steigend).n, 0);

/* ------------------------------------------------------- Rangreihe */
//
// Zwei Wege, eine Wahrheit: `synthBild` rechnet EINEN Stichtag,
// `synthRaengeReihe` die ganze Historie fuer die Kalibrierung. Der letzte
// Wert der Reihe MUSS dem Bild entsprechen — sonst misst die Kalibrierung
// etwas anderes als die Anzeige, und das faellt sonst nie auf.
const reiheSynth = synthRaengeReihe(steigend, fallend, fallend, steigend);
const letzte = reiheSynth[reiheSynth.length - 1];
check("Rangreihe endet beim juengsten Termin",
  letzte.datum, spaeter(steigend[n - 1].datum, 3));
check("Commercials stimmen mit dem Einzelbild ueberein",
  Number(letzte.komm.toFixed(6)), Number((bild.kommRang ?? 0).toFixed(6)));
check("Retail auch",
  Number(letzte.retail.toFixed(6)), Number((bild.retailRang ?? 0).toFixed(6)));
check("die Reihe beginnt erst beim vollen Fenster",
  reiheSynth.length, n - SYNTH.wochen + 1);
check("zu kurze Historie gibt gar keine Reihe",
  synthRaengeReihe(kurz, kurz, kurz, kurz).length, 0);

// Daten, bei denen das Quote-Bein WIRKLICH etwas aendert.
//
// Die Reihen oben waren zu gutmuetig: beide streng monoton, da bleibt der
// letzte Wert auch ohne Quote-Bein der hoechste — ein Nachbau, der die
// Quote einfach weglaesst, lief gruen durch. Aufgefallen erst beim
// absichtlichen Kaputtmachen.
//
// Hier schwankt die Basis um fast nichts und die Quote faellt stetig. Die
// Basis ALLEIN steht damit im Mittelfeld, die Differenz am oberen Extrem.
const wellig  = reihe(Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0 : 0.001)));
const sinkend = reihe(Array.from({ length: n }, (_, i) => -i / 100));

const bildW  = synthBild("EURCHF", stich, wellig, sinkend, sinkend, wellig);
const reiheW = synthRaengeReihe(wellig, sinkend, sinkend, wellig);
const letzteW = reiheW[reiheW.length - 1];

check("mit Quote-Bein steht die Differenz am Extrem",
  bildW.kommRang === null ? null : Number(bildW.kommRang.toFixed(2)), 99.68);
check("die Basis allein laege im Mittelfeld — 75, nicht 99.68",
  Number((rangImFenster(wellig, stich)?.rang ?? 0).toFixed(2)), 75);
check("und beide Wege stimmen auch hier ueberein",
  Number(letzteW.komm.toFixed(6)), Number((bildW.kommRang ?? 0).toFixed(6)));
check("Retail ebenso",
  Number(letzteW.retail.toFixed(6)), Number((bildW.retailRang ?? 0).toFixed(6)));

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
