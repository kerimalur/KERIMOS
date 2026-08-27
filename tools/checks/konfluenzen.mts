// Kontrollwerte für die frei anlegbaren Konfluenzen (ab 27.08.2026).
// Aufruf:  npx -y tsx tools/checks/konfluenzen.mts
import {
  konfluenzListe, saubereName, STANDARD_KONFLUENZEN, type Konfluenz,
} from "../../src/lib/trading/konfluenzen";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const k = (name: string, sortOrder = 0): Konfluenz => ({ id: name, name, sortOrder });

// Ohne eigene gelten die Standardwerte — NICHT eine leere Liste. Ein Formular
// ohne einen einzigen Haken waere kein leeres Blatt, sondern ein kaputtes.
check("ohne eigene gelten die Standardwerte",
  konfluenzListe([]), [...STANDARD_KONFLUENZEN]);
check("eine eigene ersetzt die Standardwerte komplett",
  konfluenzListe([k("Orderflow")]), ["Orderflow"]);
check("nach sort_order sortiert",
  konfluenzListe([k("B", 2), k("A", 1)]), ["A", "B"]);
check("bei gleicher Nummer alphabetisch",
  konfluenzListe([k("Zeta", 1), k("Alpha", 1)]), ["Alpha", "Zeta"]);

/* ------------------------------------------------------- Nachzuegler */
//
// Der Wert, auf den es ankommt: ein Name, den ein ALTER Trade traegt, der
// aber nicht mehr in der Liste steht, muss trotzdem im Formular auftauchen.
// Sonst verschwindet er beim Bearbeiten stillschweigend — und beim Speichern
// ist er weg, ohne dass jemand darauf gedrueckt hat.
check("benutzter Name kommt hinten dazu",
  konfluenzListe([k("Orderflow")], ["Saisonal"]), ["Orderflow", "Saisonal"]);
check("schon vorhanden wird nicht gedoppelt",
  konfluenzListe([k("Orderflow")], ["Orderflow"]), ["Orderflow"]);
check("Gross- und Kleinschreibung zaehlt als dasselbe",
  konfluenzListe([k("Orderflow")], ["orderflow"]), ["Orderflow"]);
check("mehrere Nachzuegler alphabetisch",
  konfluenzListe([k("A")], ["Zeta", "Beta", "Zeta"]), ["A", "Beta", "Zeta"]);
check("leere Namen fallen weg",
  konfluenzListe([k("A")], ["", "B"]), ["A", "B"]);
check("auch bei den Standardwerten greift es",
  konfluenzListe([], ["Orderflow"]), [...STANDARD_KONFLUENZEN, "Orderflow"]);

/* ------------------------------------------------------------- Namen */
check("getrimmt", saubereName("  COT  "), "COT");
check("gekuerzt", saubereName("x".repeat(60)).length, 40);
check("leer bleibt leer", saubereName("   "), "");
check("null ist leer", saubereName(null), "");
check("Zahl ist leer", saubereName(42), "");

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
