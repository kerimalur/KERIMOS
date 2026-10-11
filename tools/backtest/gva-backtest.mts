/**
 * Objektiver GVA-Backtest im Terminal (11.10.2026) — derselbe Code wie das
 * Strategie-Labor in KerimOS (src/lib/strategie/lauf.ts).
 *
 * Aufruf:
 *   npx -y tsx tools/backtest/gva-backtest.mts                 → 1h und 4h, BOS Schluss und Docht
 *   npx -y tsx tools/backtest/gva-backtest.mts --speichern     → zusätzlich ins Labor (Supabase)
 *   … --tf 1h --bos schluss                                    → nur diese Variante
 *   … --wochen                                                 → mit Wochen-GVAs
 *   … --struktur impuls4h|4h|chart  --atr 0.75                 → Art der Struktur (Standard: Impuls-Ursprung 4h)
 *
 * Kerzen-Cache: tools/backtest/.cache (Yahoo, je Tag einmal geladen).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { yahooStunden } from "../../src/lib/strategie/kerzen";
import { datenquelle, speichereLauf } from "../../src/lib/strategie/daten";
import { fuehreLaufAus, LAUF_STANDARD, type LaufEinstellung } from "../../src/lib/strategie/lauf";
import type { Bar } from "../../src/lib/strategie/setup";

const env: Record<string, string> = {};
for (const z of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = z.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.TRADING_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.TRADING_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase-URL oder Service-Key fehlt in .env.local");
const db = createClient(url, key, { auth: { persistSession: false }, db: { schema: env.TRADING_SUPABASE_SCHEMA || "trading" } });

const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const speichern = args.includes("--speichern");

const CACHE = "tools/backtest/.cache";
mkdirSync(CACHE, { recursive: true });
async function stundenMitCache(paar: string): Promise<Bar[]> {
  const datei = `${CACHE}/${paar}_1h_${new Date().toISOString().slice(0, 10)}.json`;
  if (existsSync(datei)) return JSON.parse(readFileSync(datei, "utf8")) as Bar[];
  const b = await yahooStunden(paar);
  writeFileSync(datei, JSON.stringify(b));
  return b;
}
const quelle = datenquelle(db as any, stundenMitCache);

const varianten: LaufEinstellung[] = [];
for (const tf of (arg("--tf") ? [arg("--tf")] : ["1h", "4h"]) as ("1h" | "4h")[]) {
  for (const bos of (arg("--bos") ? [arg("--bos")] : ["schluss", "docht"]) as ("schluss" | "docht")[]) {
    varianten.push({ ...LAUF_STANDARD, tf, bos, wochen: args.includes("--wochen"), strukturTf: (arg("--struktur") as "impuls4h" | "4h" | "chart" | undefined) ?? "impuls4h", impulsAtr: Number(arg("--atr") ?? 0.75) });
  }
}

const tabelle: Record<string, unknown>[] = [];
for (const v of varianten) {
  const name = `${v.tf} · Struktur ${v.strukturTf === "impuls4h" ? `Impuls ${v.impulsAtr}×ATR` : v.strukturTf === "4h" ? "4h-Swing" : `${v.tf}-Swing`} · BOS ${v.bos === "schluss" ? "Schluss" : "Docht"}${v.wochen ? " · mit W-GVA" : ""} · GVA ${v.gvaTol}/${v.gvaK2}`;
  const start = Date.now();
  const r = await fuehreLaufAus(v, quelle);
  const dauer = Math.round((Date.now() - start) / 100) / 10;
  const k = r.kennzahlen;
  tabelle.push({
    Variante: name, Treffer: r.zaehler.treffer, BOS: r.zaehler.mitBos, "○": r.zaehler.verfallen,
    "kein Einstieg": r.zaehler.kein_einstieg, "×": r.zaehler.ungueltig, Trades: k.trades, TP: k.tp, SL: k.sl,
    Quote: k.trefferquote, "R netto": k.rNetto, "Ø R": k.schnittNetto, PF: k.profitFaktor, DD: k.maxDrawdownR, t: k.t,
  });
  if (r.fehler.length) console.log(`${name} — Fehler:`, r.fehler);
  if (speichern) console.log(`gespeichert: ${await speichereLauf(db as any, name, v, r, dauer, "terminal")}`);
}
console.table(tabelle);
