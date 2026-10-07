import { inflateRawSync } from "node:zlib";

/**
 * Minimaler ZIP- und XLSX-Leser (05.10.2026), ohne Zusatzpaket.
 *
 * Gebraucht für die Zinskurve der Bank of England, die nur als ZIP mit
 * Excel-Dateien veröffentlicht wird. Eine XLSX-Datei ist selbst ein ZIP mit
 * XML darin. Unterstützt nur, was diese Dateien brauchen: Methode 0
 * (gespeichert) und 8 (Deflate), Zellen mit Zahl oder geteiltem Text.
 * Formeln werden nicht gerechnet — gelesen wird der gespeicherte Wert.
 */

const EOCD = 0x06054b50;
const ZENTRAL = 0x02014b50;

/** Liest einen Eintrag aus einem ZIP; null, wenn es ihn nicht gibt. */
export function zipEintrag(zip: Buffer, name: string): Buffer | null {
  return zipEintraege(zip, (n) => n === name).get(name) ?? null;
}

/** Namen aller Einträge (ohne zu entpacken). */
export function zipNamen(zip: Buffer): string[] {
  return [...zipVerzeichnis(zip).keys()];
}

/** Entpackt alle Einträge, deren Name `filter` erfüllt. */
export function zipEintraege(zip: Buffer, filter: (name: string) => boolean = () => true): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const [name, e] of zipVerzeichnis(zip)) {
    if (!filter(name)) continue;
    const nameLen = zip.readUInt16LE(e.lokal + 26);
    const extraLen = zip.readUInt16LE(e.lokal + 28);
    const start = e.lokal + 30 + nameLen + extraLen;
    const roh = zip.subarray(start, start + e.groesse);
    if (e.methode === 0) out.set(name, Buffer.from(roh));
    else if (e.methode === 8) out.set(name, inflateRawSync(roh));
    else throw new Error(`ZIP: Methode ${e.methode} nicht unterstützt (${name})`);
  }
  return out;
}

function zipVerzeichnis(zip: Buffer): Map<string, { methode: number; groesse: number; lokal: number }> {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP: Inhaltsverzeichnis nicht gefunden");
  const anzahl = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out = new Map<string, { methode: number; groesse: number; lokal: number }>();
  for (let n = 0; n < anzahl; n++) {
    if (zip.readUInt32LE(p) !== ZENTRAL) throw new Error("ZIP: Verzeichniseintrag beschädigt");
    const methode = zip.readUInt16LE(p + 10);
    const groesse = zip.readUInt32LE(p + 20); // komprimierte Grösse
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const kommLen = zip.readUInt16LE(p + 32);
    const lokal = zip.readUInt32LE(p + 42);
    out.set(zip.toString("utf8", p + 46, p + 46 + nameLen), { methode, groesse, lokal });
    p += 46 + nameLen + extraLen + kommLen;
  }
  return out;
}

/* ------------------------------------------------------------------ XLSX */

export type Zelle = number | string;
/** Zeilennummer → (Spaltenbuchstabe → Wert). */
export type Blatt = Map<number, Map<string, Zelle>>;

const ENTITAETEN: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'" };
const entschluesseln = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITAETEN[m]);

/** Namen der Blätter einer XLSX-Datei, in Reihenfolge. */
export function xlsxBlattNamen(xlsx: Buffer): string[] {
  const wb = zipEintrag(xlsx, "xl/workbook.xml")?.toString("utf8") ?? "";
  return [...wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => entschluesseln(m[1]));
}

/** Ein Blatt nach Namen; `passt` wählt das erste passende Blatt. */
export function xlsxBlatt(xlsx: Buffer, passt: (name: string) => boolean): Blatt | null {
  const teile = zipEintraege(xlsx, (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml");
  const wb = teile.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = teile.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const blatt = [...wb.matchAll(/<sheet\b([^>]*)\/?>/g)]
    .map((m) => ({ name: entschluesseln(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? ""), rid: /\br:id="([^"]*)"/.exec(m[1])?.[1] ?? "" }))
    .find((s) => passt(s.name));
  if (!blatt) return null;
  const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => m[1])
    .find((a) => new RegExp(`\\bId="${blatt.rid}"`).test(a));
  const ziel = rel ? /\bTarget="([^"]*)"/.exec(rel)?.[1] : null;
  if (!ziel) return null;
  const pfad = ziel.startsWith("/") ? ziel.slice(1) : `xl/${ziel.replace(/^\.\//, "")}`;
  const xml = zipEintrag(xlsx, pfad)?.toString("utf8");
  if (!xml) return null;
  const geteilt = geteilteTexte(teile.get("xl/sharedStrings.xml")?.toString("utf8") ?? "");
  return blattAusXml(xml, geteilt);
}

/** Geteilte Texte (sharedStrings.xml) als Liste. */
export function geteilteTexte(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => entschluesseln(t[1])).join(""));
}

/** Blatt-XML → Zellen. Rein, damit es ohne Datei prüfbar ist. */
export function blattAusXml(xml: string, geteilt: string[]): Blatt {
  const blatt: Blatt = new Map();
  for (const m of xml.matchAll(/<c\b r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, spalte, zeileText, attr, inhalt] = m;
    const v = inhalt ? /<v>([\s\S]*?)<\/v>/.exec(inhalt)?.[1] : undefined;
    if (v === undefined) continue;
    const typ = /\bt="([^"]*)"/.exec(attr)?.[1];
    let wert: Zelle;
    if (typ === "s") wert = geteilt[Number(v)] ?? "";
    else if (typ === "str" || typ === "inlineStr" || typ === "e") wert = entschluesseln(v);
    else {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      wert = n;
    }
    const zeile = Number(zeileText);
    if (!blatt.has(zeile)) blatt.set(zeile, new Map());
    blatt.get(zeile)!.set(spalte, wert);
  }
  return blatt;
}

/** Excel-Seriennummer (Tage seit 30.12.1899) → 'YYYY-MM-DD'. */
export function excelDatum(serie: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serie) * 86_400_000).toISOString().slice(0, 10);
}
