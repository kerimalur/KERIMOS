/**
 * Prüft die eine Regel, an der `next build` scheitert und `tsc` schweigt:
 *
 *   In einer Datei mit `"use server"` darf NUR async Funktionen exportiert
 *   werden. Jeder andere Wert-Export bricht den Build — und zwar erst beim
 *   Bündeln, nicht beim Typecheck.
 *
 * Genau daran ist das Deployment am 22.08.2026 gescheitert: eine geteilte
 * Konstante (`GVA_NOTIZ`) stand in `journal-actions.ts`, weil sie dort
 * gebraucht wurde. Typecheck grün, Build rot, Fehler erst auf Vercel sichtbar.
 *
 * Typ-Exporte (`export type`, `export interface`) sind erlaubt: sie werden
 * beim Übersetzen entfernt und existieren zur Laufzeit gar nicht.
 *
 * Aufruf: npm run check:server-actions
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZELN = ["src"];

function dateien(pfad: string): string[] {
  const out: string[] = [];
  for (const eintrag of readdirSync(pfad)) {
    const voll = join(pfad, eintrag);
    if (statSync(voll).isDirectory()) {
      if (eintrag === "node_modules" || eintrag.startsWith(".")) continue;
      out.push(...dateien(voll));
    } else if (/\.(ts|tsx)$/.test(eintrag)) {
      out.push(voll);
    }
  }
  return out;
}

/** Erlaubt: async Funktion, Typ, Interface, Type-only-Re-Export. */
const ERLAUBT = [
  /^export\s+async\s+function\s/,
  /^export\s+(type|interface)\s/,
  /^export\s+type\s*\{/,
];

let fehler = 0;
let geprueft = 0;

for (const datei of WURZELN.flatMap(dateien)) {
  const inhalt = readFileSync(datei, "utf8");
  // "use server" gilt nur als Datei-Direktive, wenn es ganz oben steht.
  const kopf = inhalt.slice(0, 200);
  if (!/^\s*(\/\*[\s\S]*?\*\/\s*)?["']use server["']/.test(kopf)) continue;

  geprueft++;
  const zeilen = inhalt.split("\n");
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (!/^export\s/.test(z)) continue;
    if (ERLAUBT.some((r) => r.test(z))) continue;
    console.log(`FEHL ${datei}:${i + 1}`);
    console.log(`     ${z.trim()}`);
    console.log("     Nur async Funktionen dürfen aus einer \"use server\"-Datei "
      + "exportiert werden. Konstanten und Hilfsfunktionen gehören in ein eigenes Modul.");
    fehler++;
  }
}

console.log(`\n${geprueft} Server-Action-Dateien geprüft.`);
console.log(fehler === 0 ? "Alles grün." : `${fehler} unerlaubte(r) Export(e).`);
process.exit(fehler === 0 ? 0 : 1);
