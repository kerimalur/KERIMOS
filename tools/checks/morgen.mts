// Kontrollwerte für den Morgen-Anstoss.
// Aufruf:  npx -y tsx tools/checks/morgen.mts
//
// Zwei Dinge werden hier festgenagelt, weil beide leicht falsch gebaut werden:
// dass ein leerer Rückblick KEINE Nachricht erzeugt (eine Ermahnung dafür,
// abends nichts geschrieben zu haben, macht die Gewohnheit nicht besser), und
// dass der Spruch des Tages sich reproduzieren lässt — der Cron kann doppelt
// feuern, und ein Probelauf muss zeigen, was tatsächlich rausgeht.
import {
  baueMorgenNachricht, motivationFuer, SPRUECHE, MAX_ZEILE,
} from "../../src/lib/morgen";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const r = (p: Partial<{ erreicht: string; liegengeblieben: string; morgen: string }>) => ({
  datum: "2026-08-19", erreicht: "", liegengeblieben: "", morgen: "", ...p,
});

/* ------------------------------------------------------------- Vorsätze */

const beides = baueMorgenNachricht(r({
  erreicht: "Sechs Backtest-Trades",
  liegengeblieben: "Journal nicht nachgetragen",
  morgen: "GBPAUD-Session abschliessen",
}));
check("Nachricht wird gebaut", beides.leer, false);
check("das Wichtigste steht zuerst",
  beides.text.indexOf("GBPAUD") < beides.text.indexOf("Journal"), true);
check("das Erreichte kommt NICHT vor", beides.text.includes("Backtest-Trades"), false);
check("Titel nennt den Vorsatz", beides.titel, "Das hast du dir vorgenommen");

check("nur Liegengebliebenes reicht auch",
  baueMorgenNachricht(r({ liegengeblieben: "Journal" })).titel, "Von gestern offen");

/* --- Der wichtigste Fall: kein Rückblick heisst keine Nachricht. */
check("ohne Rückblick keine Nachricht", baueMorgenNachricht(null).leer, true);
check("leerer Rückblick erzeugt nichts", baueMorgenNachricht(r({})).leer, true);
// Nur das Erreichte ausgefüllt: gestern erledigt, heute nichts vorgenommen.
// Es gibt nichts zu erinnern — also auch keine Nachricht.
check("nur Erreichtes erzeugt nichts",
  baueMorgenNachricht(r({ erreicht: "Alles fertig" })).leer, true);
check("Leerzeichen zählen nicht als Inhalt",
  baueMorgenNachricht(r({ morgen: "   " })).leer, true);

const lang = "x".repeat(MAX_ZEILE + 80);
const gekuerzt = baueMorgenNachricht(r({ morgen: lang }));
check("zu lange Zeilen werden gekürzt", gekuerzt.text.length <= MAX_ZEILE + 40, true);
check("und enden mit Auslassung", gekuerzt.text.endsWith("…"), true);

check("Zeilenumbrüche im Eintrag werden zusammengezogen",
  baueMorgenNachricht(r({ morgen: "a\n\n   b" })).text.includes("a b"), true);

/* ------------------------------------------------------------ Motivation */

check("Spruchliste ist nicht leer", SPRUECHE.length > 0, true);
check("keine Dubletten in der Liste", new Set(SPRUECHE).size, SPRUECHE.length);

// Reproduzierbar: derselbe Tag muss denselben Satz liefern. Mit Math.random()
// stünde im Probelauf etwas anderes als in der echten Nachricht.
check("derselbe Tag, derselbe Satz",
  motivationFuer("2026-08-20") === motivationFuer("2026-08-20"), true);
check("aufeinanderfolgende Tage sind verschieden",
  motivationFuer("2026-08-20") === motivationFuer("2026-08-21"), false);

// Über die Länge der Liste läuft sie einmal komplett durch, bevor sie sich
// wiederholt — sonst hätte man nach einer Woche vier Sätze gesehen.
const durchlauf = Array.from({ length: SPRUECHE.length }, (_, i) => {
  const d = new Date("2026-08-20T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + i);
  return motivationFuer(d.toISOString().slice(0, 10));
});
check("ein voller Umlauf zeigt jeden Satz genau einmal",
  new Set(durchlauf).size, SPRUECHE.length);

check("Datum vor 1970 kippt den Index nicht ins Negative",
  SPRUECHE.includes(motivationFuer("1969-05-01") ?? ""), true);
check("unlesbares Datum liefert null", motivationFuer("Unsinn"), null);
check("leere Liste liefert null", motivationFuer("2026-08-20", []), null);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
