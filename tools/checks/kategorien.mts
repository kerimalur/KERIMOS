/**
 * Kontrollwerte für die Kategorie-Gruppierung der aktiven Trades.
 *
 * Die zwei Tests, auf die es ankommt, stehen unten: dass eine Zeile mit einer
 * GELÖSCHTEN Kategorie nicht verschwindet, sondern unter „ohne" auftaucht,
 * und dass leere Kategorien keine Überschrift bekommen. Beides sind Fälle,
 * die man beim Bauen nicht sieht und beim Benutzen als Datenverlust erlebt.
 *
 * Aufruf: npm run check:kategorien
 */
import {
  gruppiereNachKategorie, sortiereKategorien, farbPunkt, FARBEN,
  type Kategorie,
} from "../../src/lib/trading/kategorien";

let fehler = 0;
const pruefe = (name: string, ist: unknown, soll: unknown) => {
  const a = JSON.stringify(ist), b = JSON.stringify(soll);
  if (a === b) { console.log(`  ok   ${name}`); return; }
  console.log(`  FEHL ${name}\n       ist  ${a}\n       soll ${b}`);
  fehler++;
};

const kat = (id: string, name: string, sort = 0, farbe = "accent"): Kategorie =>
  ({ id, name, farbe, sortOrder: sort });

const zeile = (pair: string, kategorie_id: string | null) => ({ pair, kategorie_id });

console.log("Reihenfolge");
const drei = [kat("b", "Beta", 2), kat("a", "Alpha", 1), kat("c", "Gamma", 1)];
pruefe("erst sort_order, dann Name",
  sortiereKategorien(drei).map((k) => k.name), ["Alpha", "Gamma", "Beta"]);

console.log("\nFarben");
pruefe("bekannte Farbe", farbPunkt("good"), "bg-good");
pruefe("unbekannte faellt auf grau zurueck", farbPunkt("magenta"), "bg-ink-faint");
pruefe("null faellt auf grau zurueck", farbPunkt(null), "bg-ink-faint");
pruefe("jede Farbe hat eine Klasse",
  FARBEN.every((f) => f.punkt.startsWith("bg-")), true);

console.log("\nGruppierung");
const kats = [kat("w", "Diese Woche", 1), kat("s", "Später", 2)];

const g1 = gruppiereNachKategorie(
  [zeile("EURUSD", "w"), zeile("GBPUSD", "s"), zeile("AUDUSD", null)], kats);
pruefe("drei Gruppen in Sortier-Reihenfolge",
  g1.map((g) => g.kategorie?.name ?? "ohne"), ["Diese Woche", "Später", "ohne"]);
pruefe("Zeilen landen in ihrer Gruppe",
  g1.map((g) => g.zeilen.map((z) => z.pair)), [["EURUSD"], ["GBPUSD"], ["AUDUSD"]]);

const g2 = gruppiereNachKategorie([zeile("EURUSD", "w")], kats);
pruefe("leere Kategorie bekommt keine Ueberschrift",
  g2.map((g) => g.kategorie?.name ?? "ohne"), ["Diese Woche"]);

// Der wichtige Fall: die Kategorie wurde geloescht, die Spalte zeigt ins Leere.
// Die Datenbank setzt sie per "on delete set null" zwar auf null — aber wenn
// das je danebengeht, darf die Zeile nicht unsichtbar werden.
const g3 = gruppiereNachKategorie(
  [zeile("EURUSD", "weg"), zeile("GBPUSD", "w")], kats);
pruefe("Zeile mit unbekannter Kategorie steht unter ohne",
  g3.map((g) => [g.kategorie?.name ?? "ohne", g.zeilen.map((z) => z.pair)]),
  [["Diese Woche", ["GBPUSD"]], ["ohne", ["EURUSD"]]]);
pruefe("keine Zeile geht verloren",
  g3.reduce((n, g) => n + g.zeilen.length, 0), 2);

const g4 = gruppiereNachKategorie([zeile("EURUSD", null)], []);
pruefe("ohne Kategorien genau eine Gruppe",
  g4.map((g) => g.kategorie), [null]);

pruefe("leere Eingabe ergibt keine Gruppe", gruppiereNachKategorie([], kats), []);

console.log(fehler === 0 ? "\nAlles grün." : `\n${fehler} Abweichung(en).`);
process.exit(fehler === 0 ? 0 : 1);
