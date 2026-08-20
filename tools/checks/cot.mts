// Kontrollwerte für die COT-Auswertung Commercials gegen Retail.
// Aufruf:  npx -y tsx tools/checks/cot.mts
//
// Der wichtigste Test steht ganz unten: dass ein blosses Auseinanderzeigen
// von Commercials und Retail KEIN Signal ergibt. Das ist im COT-Bericht eine
// Buchhaltungsidentität — wer darauf filtert, baut einen Faktor, der immer
// zustimmt. Gemessen wird deshalb die Streckung beider Seiten, nicht ihr
// Vorzeichen.
import { plusTage, type Punkt } from "../../src/lib/confluence/reihen";
import {
  cotBildFuer, cotPaarUrteil, COT_GRENZE, COT_MINDESTENS,
  type CotRohdaten,
} from "../../src/lib/confluence/cot-divergenz";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const STICHTAG = "2026-08-14";

/**
 * 60 Wochenwerte. `ende` ist der letzte Wert, der Rest pendelt zwischen 0 und 9.
 * Ein Ende von 999 landet damit im obersten, −999 im untersten Perzentil.
 */
const reihe = (ende: number): Punkt[] =>
  Array.from({ length: 60 }, (_, i) => ({
    datum: plusTage("2025-01-06", i * 7),
    wert: i === 59 ? ende : i % 10,
  }));

const daten = (komm: number, retail: number): CotRohdaten => ({
  cotKomm: { EUR: reihe(komm) },
  cotRetail: { EUR: reihe(retail) },
});

const bild = (komm: number, retail: number) =>
  cotBildFuer(daten(komm, retail), "EUR", STICHTAG);

/* --------------------------------------------------------- Streckung */

check("Commercials oben, Retail unten -> spricht für die Währung",
  bild(999, -999).divergenz, 1);
check("umgekehrt -> spricht gegen sie", bild(-999, 999).divergenz, -1);
check("Ränge werden ausgewiesen",
  [bild(999, -999).kommRang! > COT_GRENZE.oben,
   bild(999, -999).retailRang! < COT_GRENZE.unten], [true, true]);

/* --- Der Kern: Vorzeichen allein reicht NICHT.
   Beide Reihen enden auf einem mittleren Wert (5 von 0…9), zeigen also
   durchaus in verschiedene Richtungen relativ zu ihrem Mittel — aber keine
   Seite ist gestreckt. Ohne diese Prüfung wäre der Faktor eine Tautologie. */
check("mittige Stände ergeben KEIN Signal", bild(5, 5).divergenz, 0);
check("und der Text sagt warum",
  bild(5, 5).text.includes("nicht am Rand"), true);

check("nur die Commercials gestreckt reicht nicht", bild(999, 5).divergenz, 0);
check("nur Retail gestreckt reicht auch nicht", bild(5, -999).divergenz, 0);
// Beide am OBEREN Rand: das ist keine Divergenz, sondern ein voller Markt.
check("beide oben ist keine Divergenz", bild(999, 999).divergenz, 0);
check("beide unten genauso", bild(-999, -999).divergenz, 0);

/* ------------------------------------------------------------ Historie */

const kurz: CotRohdaten = {
  cotKomm: { EUR: reihe(999).slice(-5) },
  cotRetail: { EUR: reihe(-999).slice(-5) },
};
check("zu wenig Historie ergibt kein Urteil",
  cotBildFuer(kurz, "EUR", STICHTAG).divergenz, 0);
check("und keinen Rang", cotBildFuer(kurz, "EUR", STICHTAG).kommRang, null);
check("ohne Daten ebenfalls nicht",
  cotBildFuer({}, "EUR", STICHTAG).kommRang, null);
check("Mindesthistorie ist gesetzt", COT_MINDESTENS >= 26, true);
check("Grenzen sind symmetrisch", COT_GRENZE.oben + COT_GRENZE.unten, 100);

/* ---------------------------------------------------------- Paar-Urteil */

const stark = cotPaarUrteil(bild(999, -999), bild(-999, 999));
check("Basis gestützt + Quote belastet = Long", stark.dir, 1);
check("und das ist das stärkste Urteil", stark.staerke, 1);

const halb = cotPaarUrteil(bild(999, -999), bild(5, 5));
check("nur eine Seite gestreckt = halbe Stärke", [halb.dir, halb.staerke], [1, 0.5]);

// Beide Währungen zeigen dasselbe: im Paar bleibt nichts übrig. Ohne diese
// Regel würde ein weltweiter Dollar-Extremstand jedes Paar gleichzeitig
// beleuchten.
const gleich = cotPaarUrteil(bild(999, -999), bild(999, -999));
check("beide Währungen gleich gestützt = keine Aussage", gleich.dir, 0);
check("und der Satz erklärt es",
  gleich.text.includes("hebt es sich auf"), true);
check("ohne Daten kein Paar-Urteil",
  cotPaarUrteil(cotBildFuer({}, "EUR", STICHTAG), cotBildFuer({}, "USD", STICHTAG)).dir, 0);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
