// Kontrollwerte für die 2J-Renditen GBP (BoE) und CHF (SNB) — 05.10.2026.
// Aufruf:  npx -y tsx tools/checks/zweijahr.mts
// Optional mit echter Datei:  BOE_ZIP=pfad/latest-yield-curve-data.zip npx -y tsx tools/checks/zweijahr.mts
import fs from "node:fs";
import { deflateRawSync } from "node:zlib";
const { zipEintrag, zipNamen, xlsxBlattNamen, excelDatum } = await import("../../src/lib/marktdaten/quellen/zip-xlsx.ts");
const { snbCsvLesen, boe2JAusZip } = await import("../../src/lib/marktdaten/quellen/zweijahr.ts");

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

/** Kleiner ZIP-Schreiber nur für den Test (CRC wird vom Leser nicht geprüft). */
function zipBauen(dateien: [string, Buffer, boolean][]): Buffer {
  const teile: Buffer[] = [];
  const zentral: Buffer[] = [];
  let pos = 0;
  for (const [name, inhalt, packen] of dateien) {
    const daten = packen ? deflateRawSync(inhalt) : inhalt;
    const n = Buffer.from(name, "utf8");
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(20, 4); lokal.writeUInt16LE(packen ? 8 : 0, 8);
    lokal.writeUInt32LE(daten.length, 18); lokal.writeUInt32LE(inhalt.length, 22); lokal.writeUInt16LE(n.length, 26);
    const z = Buffer.alloc(46);
    z.writeUInt32LE(0x02014b50, 0); z.writeUInt16LE(20, 4); z.writeUInt16LE(20, 6); z.writeUInt16LE(packen ? 8 : 0, 10);
    z.writeUInt32LE(daten.length, 20); z.writeUInt32LE(inhalt.length, 24); z.writeUInt16LE(n.length, 28); z.writeUInt32LE(pos, 42);
    zentral.push(z, n);
    teile.push(lokal, n, daten);
    pos += 30 + n.length + daten.length;
  }
  const cd = Buffer.concat(zentral);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(dateien.length, 8); e.writeUInt16LE(dateien.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(pos, 16);
  return Buffer.concat([...teile, cd, e]);
}

/* ZIP */
{
  const zip = zipBauen([["a.txt", Buffer.from("hallo"), false], ["b/c.xml", Buffer.from("<x>gepackt</x>".repeat(20)), true]]);
  check("ZIP: Namen", zipNamen(zip), ["a.txt", "b/c.xml"]);
  check("ZIP: gespeichert", zipEintrag(zip, "a.txt")?.toString(), "hallo");
  check("ZIP: Deflate", zipEintrag(zip, "b/c.xml")?.toString().slice(0, 14), "<x>gepackt</x>");
  check("ZIP: fehlt → null", zipEintrag(zip, "nix"), null);
}

/* Excel-Datum */
check("Excel 46296 → 01.10.2026", excelDatum(46296), "2026-10-01");
check("Excel 44562 → 01.01.2022", excelDatum(44562), "2022-01-01");

/* BoE: XLSX im ZIP, Blatt nach Namen, Spalte 2 Jahre */
{
  const wb = `<workbook><sheets><sheet name="info" sheetId="7" r:id="rId1"/><sheet name="3. spot, short end" sheetId="3" r:id="rId4"/><sheet name="4. spot curve" sheetId="10" r:id="rId5"/></sheets></workbook>`;
  const rels = `<Relationships><Relationship Id="rId4" Type="x" Target="worksheets/sheet4.xml"/><Relationship Id="rId5" Type="x" Target="worksheets/sheet3.xml"/></Relationships>`;
  const ss = `<sst><si><t>UK nominal spot curve</t></si><si><t>years:</t></si><si><t>months:</t></si></sst>`;
  // Kurz-Ende: Kopf in Monaten — darf NICHT gewählt werden.
  const kurz = `<sheetData><row r="4"><c r="A4" t="s"><v>2</v></c><c r="B4"><v>2</v></c></row><row r="6"><c r="A6"><v>46296</v></c><c r="B6"><v>9.99</v></c></row></sheetData>`;
  const kurve = `<sheetData><row r="1"><c r="B1" t="s"><v>0</v></c></row>`
    + `<row r="4"><c r="A4" t="s"><v>1</v></c><c r="B4"><v>0.5</v></c><c r="C4"><v>1</v></c><c r="D4"><v>1.5</v></c><c r="E4"><v>2</v></c></row>`
    + `<row r="5"><c r="A5" t="e"><v>#VALUE!</v></c></row>`
    + `<row r="6"><c r="A6"><v>46295</v></c><c r="E6"><v>4.912345678</v></c></row>`
    + `<row r="7"><c r="A7"><v>46296</v></c><c r="B7"><v>4.4</v></c><c r="E7"><v>4.9351707299</v></c></row>`
    + `<row r="8"><c r="A8"/><c r="E8"/></row></sheetData>`;
  const xlsx = zipBauen([
    ["xl/workbook.xml", Buffer.from(wb), true], ["xl/_rels/workbook.xml.rels", Buffer.from(rels), true],
    ["xl/sharedStrings.xml", Buffer.from(ss), true], ["xl/worksheets/sheet3.xml", Buffer.from(kurve), true],
    ["xl/worksheets/sheet4.xml", Buffer.from(kurz), true],
  ]);
  check("XLSX: Blattnamen", xlsxBlattNamen(xlsx), ["info", "3. spot, short end", "4. spot curve"]);
  const aussen = zipBauen([["GLC Nominal daily data current month.xlsx", xlsx, false], ["GLC Real daily data current month.xlsx", Buffer.from("x"), false]]);
  check("BoE 2J aus Spot-Kurve (nicht Kurz-Ende, nur Nominal)", boe2JAusZip(aussen),
    [{ date: "2026-09-30", value: 4.9123 }, { date: "2026-10-01", value: 4.9352 }]);
}

/* SNB */
check("SNB-CSV", snbCsvLesen(`﻿"CubeId";"rendeiduebd"\n"PublishingDate";"2026-10-01 14:30"\n\n"Date";"D0";"D1";"Value"\n"2026-09-28";"CHF";"2J";"0.405"\n"2026-09-29";"CHF";"2J";""\n"2026-09-30";"CHF";"2J";"0.287"\n"2026-09-30";"CHF";"5J";"0.5"`),
  [{ date: "2026-09-28", value: 0.405 }, { date: "2026-09-30", value: 0.287 }]);

/* Optional: echte BoE-Datei */
if (process.env.BOE_ZIP) {
  const p = boe2JAusZip(fs.readFileSync(process.env.BOE_ZIP));
  console.log(`echte Datei: ${p.length} Punkte, erster ${JSON.stringify(p[0])}, letzter ${JSON.stringify(p[p.length - 1])}`);
  check("echte Datei liefert Punkte", p.length > 0, true);
}

console.log(fails ? `\n${fails} Fehler.` : "\nAlles gut.");
process.exit(fails ? 1 : 0);
