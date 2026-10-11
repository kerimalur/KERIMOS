import { readFileSync, readdirSync } from "node:fs";
import { zu4h, tageAusBars } from "../../src/lib/strategie/kerzen";
import { spiegeln, type Bar } from "../../src/lib/strategie/setup";
const paar = process.argv[2] ?? "NZDUSD"; const touchIso = process.argv[3] ?? "2026-09-22T01:00:00Z"; const long = (process.argv[4] ?? "long") === "long";
const f = readdirSync("tools/backtest/.cache").filter((x) => x.startsWith(`${paar}_1h`)).sort().pop()!;
const h1: Bar[] = JSON.parse(readFileSync(`tools/backtest/.cache/${f}`, "utf8"));
const tage = tageAusBars(h1);
const atr = new Map<string, number>(); let tr: number[] = [];
tage.forEach((d, i) => { if (i) { const p = tage[i - 1].close; tr.push(Math.max(d.high - d.low, Math.abs(d.high - p), Math.abs(d.low - p))); if (tr.length > 14) tr.shift(); } atr.set(d.zeit, tr.reduce((a, b) => a + b, 0) / Math.max(1, tr.length)); });
const h4 = long ? spiegeln(zu4h(h1)) : zu4h(h1);
const touch = Date.parse(touchIso);
console.log("ATR", (atr.get(h4.find((b) => b.t >= touch)!.tag)! * 10000).toFixed(1), "Pips");
for (const k of [0.5, 0.75, 1, 1.25, 1.5]) {
  let dir = 0, ext = 0, extT = 0; const tiefs: string[] = [];
  for (const b of h4) {
    if (b.t >= touch) break;
    const th = k * (atr.get(b.tag) ?? 0);
    if (dir === 0) { dir = 1; ext = b.h; extT = b.t; continue; }
    if (dir === 1) { if (b.h > ext) { ext = b.h; extT = b.t; } else if (b.l < ext - th) { dir = -1; ext = b.l; extT = b.t; } }
    else { if (b.l < ext) { ext = b.l; extT = b.t; } else if (b.h > ext + th) { tiefs.push(`${new Date(extT).toISOString().slice(5, 13)} ${(long ? -ext : ext).toFixed(5)}`); dir = 1; ext = b.h; extT = b.t; } }
  }
  console.log(k, tiefs.slice(-2).join(" | "));
}
