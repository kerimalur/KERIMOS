/**
 * Prüft die Zeitrahmen-Gruppierung in `src/lib/trading/kerzen.ts`.
 *
 * Sie ist ein Nachbau von `Backend/data_pipeline.py` (gva_3d_block_ids,
 * resample_3d_bars, resample_weekly_bars). Läuft sie auseinander, zeichnet das
 * Cockpit-Popup einen Chart mit anderen Kerzen, als der Screener gerechnet hat
 * — und man sucht den Fehler dann in der Erkennung statt in der Anzeige.
 *
 * Aufruf: npm run check:kerzen
 */
import { werktage, block3d, wochenSchluessel, zu3D, zuWoche, type Kerze }
  from "../../src/lib/trading/zeitrahmen";

let fehler = 0;
const pruefe = (name: string, ist: unknown, soll: unknown) => {
  const a = JSON.stringify(ist), b = JSON.stringify(soll);
  if (a === b) { console.log(`  ok   ${name}`); return; }
  console.log(`  FEHL ${name}\n       ist  ${a}\n       soll ${b}`);
  fehler++;
};

console.log("Werktage (numpy busday_count)");
// 2026-07-09 ist ein Donnerstag.
pruefe("Do → Fr", werktage("2026-07-09", "2026-07-10"), 1);
pruefe("Do → Mo (Wochenende zählt nicht)", werktage("2026-07-09", "2026-07-13"), 2);
pruefe("gleicher Tag", werktage("2026-07-09", "2026-07-09"), 0);
pruefe("rückwärts ist negativ", werktage("2026-07-09", "2026-07-06"), -3);
pruefe("volle Woche = 5", werktage("2026-07-09", "2026-07-16"), 5);

console.log("\n3D-Blöcke, phasiert am Anker 2026-07-09");
pruefe("Anker ist Block 0", block3d("2026-07-09"), 0);
pruefe("Anker + 2 Werktage noch Block 0", block3d("2026-07-13"), 0);
pruefe("Anker + 3 Werktage ist Block 1", block3d("2026-07-14"), 1);
// numpy floort auch negativ: −1 // 3 = −1, nicht 0.
pruefe("ein Werktag davor ist Block −1", block3d("2026-07-08"), -1);
pruefe("drei Werktage davor ist Block −1", block3d("2026-07-06"), -1);
pruefe("vier Werktage davor ist Block −2", block3d("2026-07-03"), -2);

console.log("\nWochengruppierung (pandas W-FRI)");
pruefe("Montag gehört zum Freitag derselben Woche", wochenSchluessel("2026-07-06"), "2026-07-10");
pruefe("Freitag ist sein eigener Schlüssel", wochenSchluessel("2026-07-10"), "2026-07-10");
pruefe("Samstag zählt zur Folgewoche", wochenSchluessel("2026-07-11"), "2026-07-17");
pruefe("Sonntag zählt zur Folgewoche", wochenSchluessel("2026-07-12"), "2026-07-17");

console.log("\nZusammenfassen von Kerzen");
const k = (zeit: string, o: number, h: number, l: number, c: number): Kerze =>
  ({ zeit, open: o, high: h, low: l, close: c });

// Der Anker 2026-07-09 (Do) ist Werktag 0. Damit fallen Do/Fr/Mo in Block 0,
// Di/Mi/Do in Block 1 und der Freitag schon in Block 2 — ein Block läuft NICHT
// von Montag bis Mittwoch, sondern quer über das Wochenende. Genau deshalb
// steht das hier: die Phase ist nicht die, die man beim Hinschauen erwartet.
const woche = [
  k("2026-07-13", 1.10, 1.12, 1.09, 1.11),
  k("2026-07-14", 1.11, 1.15, 1.10, 1.14),
  k("2026-07-15", 1.14, 1.16, 1.13, 1.15),
  k("2026-07-16", 1.15, 1.18, 1.14, 1.17),
  k("2026-07-17", 1.17, 1.19, 1.05, 1.06),
];
const bloecke = zu3D(woche);
pruefe("3D: aus fünf Tagen werden drei Blöcke", bloecke.length, 3);
pruefe("3D: erster Block ist Mo (13.) allein", bloecke[0],
  k("2026-07-13", 1.10, 1.12, 1.09, 1.11));
pruefe("3D: zweiter Block fasst Di–Do zusammen", bloecke[1],
  k("2026-07-14", 1.11, 1.18, 1.10, 1.17));
pruefe("3D: dritter Block ist Fr (17.) allein", bloecke[2],
  k("2026-07-17", 1.17, 1.19, 1.05, 1.06));

const wochenKerzen = zuWoche(woche);
pruefe("W: eine Kerze für die Woche", wochenKerzen.length, 1);
pruefe("W: Open vom Montag, Close vom Freitag, High/Low über alles",
  wochenKerzen[0], k("2026-07-13", 1.10, 1.19, 1.05, 1.06));

console.log(fehler === 0 ? "\nAlles grün." : `\n${fehler} Abweichung(en).`);
process.exit(fehler === 0 ? 0 : 1);
