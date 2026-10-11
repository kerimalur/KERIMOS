/**
 * Objektiver GVA-Backtest (11.10.2026).
 *
 * Erkennt GVAs wie „GVA Linien — Pur v1.1" auf 3D, sucht den ersten Treffer
 * und rechnet danach Kerims Einstieg als feste Regel (src/lib/strategie/setup.ts):
 * BOS unter/über dem Daily Open, Limit bei Fib 0.618, SL am Hoch/Tief, TP bei Fib −1.
 *
 * Varianten: BOS-Zeitrahmen 15m / 1h / 4h × BOS per Schlusskurs oder Docht.
 *
 * Daten:
 *  - Tageskerzen: trading.price_daily (OANDA, ab 2007) für die GVA-Bildung,
 *    ab dem letzten Tag ergänzt aus Stundenkerzen.
 *  - Intraday: Yahoo Finance (1h ≈ 2 Jahre, 15m ≈ 60 Tage). 4h = aus 1h gebaut.
 *    Für eine längere Historie braucht es OANDA-Intraday (Phase 2).
 *
 * Aufruf:  npx -y tsx tools/backtest/gva-backtest.mts
 * Ergebnis: tools/backtest/ergebnisse/<datum>.json + Zusammenfassung in der Konsole.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { INSTRUMENTS } from "../../src/lib/marktdaten/konstanten/instruments";
import type { Kerze } from "../../src/lib/trading/zeitrahmen";
import { baue3D, beruehrt, findeGvas, zuFrueh, GVA_STANDARD, type Gva } from "../../src/lib/strategie/gva";
import { handelstag, sitzungsEnde, vierStundenBlock } from "../../src/lib/strategie/zeit";
import {
  SETUP_STANDARD, simuliereShort, spiegeln, swingTiefs, tagesOpen,
  type Bar, type SetupEinstellung, type SetupErgebnis,
} from "../../src/lib/strategie/setup";
import { kennzahlen, type TradeZeile } from "../../src/lib/strategie/auswertung";

/* ------------------------------------------------------------------ Umgebung */
const env: Record<string, string> = {};
for (const z of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = z.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SB_URL = env.TRADING_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.TRADING_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const SB_SCHEMA = env.TRADING_SUPABASE_SCHEMA || "trading";
if (!SB_URL || !SB_KEY) throw new Error("Supabase-URL oder Service-Key fehlt in .env.local");

async function sbAlle<T>(tabelle: string, abfrage: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${tabelle}?${abfrage}&offset=${off}&limit=1000`, {
      headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, "Accept-Profile": SB_SCHEMA },
    });
    if (!r.ok) throw new Error(`${tabelle}: HTTP ${r.status} ${await r.text()}`);
    const l = (await r.json()) as T[];
    out.push(...l);
    if (l.length < 1000) break;
  }
  return out;
}

/* -------------------------------------------------------------------- Yahoo */
const CACHE = "tools/backtest/.cache";
mkdirSync(CACHE, { recursive: true });

async function yahoo(paar: string, intervall: "1h" | "15m"): Promise<Bar[]> {
  const sym = `${paar}=X`;
  const heute = new Date().toISOString().slice(0, 10);
  const datei = `${CACHE}/${paar}_${intervall}_${heute}.json`;
  if (existsSync(datei)) return JSON.parse(readFileSync(datei, "utf8")) as Bar[];
  const range = intervall === "1h" ? "730d" : "60d";
  let json: any = null;
  for (let versuch = 0; versuch < 3 && !json; versuch++) {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${intervall}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) kerimos-backtest" } });
    if (r.ok) json = await r.json(); else await new Promise((s) => setTimeout(s, 1500));
  }
  const res = json?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  if (!res?.timestamp || !q) throw new Error(`Yahoo ${sym} ${intervall}: keine Daten`);
  const bars: Bar[] = [];
  const gesehen = new Set<number>();
  res.timestamp.forEach((t: number, i: number) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((x) => x == null) || gesehen.has(t)) return;
    if (h < l || h <= 0) return;
    gesehen.add(t);
    const ms = t * 1000;
    bars.push({ t: ms, o, h, l, c, tag: handelstag(ms) });
  });
  bars.sort((a, b) => a.t - b.t);
  // Die letzte Kerze ist meist noch offen: weglassen.
  if (bars.length) bars.pop();
  writeFileSync(datei, JSON.stringify(bars));
  return bars;
}

function zu4h(stunden: Bar[]): Bar[] {
  const m = new Map<number, Bar>();
  for (const b of stunden) {
    const k = vierStundenBlock(b.t);
    const x = m.get(k);
    if (!x) m.set(k, { ...b });
    else { x.h = Math.max(x.h, b.h); x.l = Math.min(x.l, b.l); x.c = b.c; }
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

function tageAusBars(bars: Bar[]): Kerze[] {
  const m = new Map<string, Kerze>();
  for (const b of bars) {
    const x = m.get(b.tag);
    if (!x) m.set(b.tag, { zeit: b.tag, open: b.o, high: b.h, low: b.l, close: b.c });
    else { x.high = Math.max(x.high, b.h); x.low = Math.min(x.low, b.l); x.close = b.c; }
  }
  return [...m.values()].filter((k) => { const wt = new Date(`${k.zeit}T12:00:00Z`).getUTCDay(); return wt >= 1 && wt <= 5; })
    .sort((a, b) => a.zeit.localeCompare(b.zeit));
}

/* --------------------------------------------------------------- Varianten */
type Tf = "15m" | "1h" | "4h";
interface Variante { name: string; tf: Tf; bos: SetupEinstellung["bos"] }
const VARIANTEN: Variante[] = (["15m", "1h", "4h"] as Tf[]).flatMap((tf) =>
  (["schluss", "docht"] as const).map((bos) => ({ name: `${tf} · BOS ${bos === "schluss" ? "Schluss" : "Docht"}`, tf, bos })));

/** Frist bis zum Einstieg: 10 Handelstage, in Kerzen des jeweiligen Zeitrahmens. */
const FRIST_KERZEN: Record<Tf, number> = { "15m": 10 * 96, "1h": 10 * 24, "4h": 10 * 6 };

const MAJORS = new Set(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"]);
/** Annahme Kosten (Spread + Kommission) in Pips. */
const kostenPips = (paar: string) => (MAJORS.has(paar) ? 1.2 : 2.2);
const pip = (paar: string) => (paar.endsWith("JPY") ? 0.01 : 0.0001);

/* -------------------------------------------------------------------- Lauf */
interface Ereignis {
  variante: string; paar: string; seite: "long" | "short"; level: number; bStart: string;
  ergebnis: SetupErgebnis; rNetto: number | null; risikoPips: number | null;
}

const PAARE = INSTRUMENTS.filter((i) => i.kind === "fx").map((i) => i.instrument.replace("_", ""));
const ereignisse: Ereignis[] = [];
const verworfen: Record<string, number> = {};
const fehler: string[] = [];
const fenster: Record<string, { von: string; bis: string }> = {};

for (const paar of PAARE) {
  const inst = `${paar.slice(0, 3)}_${paar.slice(3)}`;
  process.stdout.write(`${paar} … `);
  try {
    const roh = await sbAlle<{ date: string; open: number; high: number; low: number; close: number }>(
      "price_daily", `select=date,open,high,low,close&instrument=eq.${inst}&order=date.asc`);
    // OANDA beschriftet den Tag mit dem Sitzungsbeginn (So–Do) → Handelstag ist +1.
    const tage: Kerze[] = roh.map((r) => {
      const d = new Date(Date.parse(`${r.date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      return { zeit: d, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) };
    });
    const h1 = await yahoo(paar, "1h");
    const m15 = await yahoo(paar, "15m").catch(() => [] as Bar[]);
    const h4 = zu4h(h1);
    // Tage nach dem letzten OANDA-Tag aus den Stundenkerzen ergänzen.
    const letzter = tage[tage.length - 1]?.zeit ?? "0000";
    const ergaenzt = [...tage, ...tageAusBars(h1).filter((k) => k.zeit > letzter)];
    const d3 = baue3D(ergaenzt);
    const gvas = findeGvas(d3, GVA_STANDARD);

    const reihen: Record<Tf, Bar[]> = { "15m": m15, "1h": h1, "4h": h4 };
    for (const tf of ["15m", "1h", "4h"] as Tf[]) {
      const bars = reihen[tf];
      if (bars.length < 50) continue;
      fenster[`${paar} ${tf}`] = { von: bars[0].tag, bis: bars[bars.length - 1].tag };
      const gespiegelt = spiegeln(bars);
      const vor = {
        short: { bars, tiefs: swingTiefs(bars, SETUP_STANDARD.swingN), open: tagesOpen(bars) },
        long: { bars: gespiegelt, tiefs: swingTiefs(gespiegelt, SETUP_STANDARD.swingN), open: tagesOpen(gespiegelt) },
      };
      const ersterVollerTag = bars.find((b, i) => i > 0 && b.tag !== bars[i - 1].tag)?.tag ?? bars[0].tag;

      for (const g of gvas) {
        // Vor dem Intraday-Fenster schon getroffen? Dann für diesen Lauf ohne Belang.
        let schonVorher = false;
        let fruehAbgeraeumt = false;
        for (const k of ergaenzt) {
          if (k.zeit <= g.bEnde) continue;
          if (k.zeit >= ersterVollerTag) break;
          if (beruehrt(g, k.high, k.low)) {
            schonVorher = true;
            if (zuFrueh(d3, g, k.zeit)) fruehAbgeraeumt = true;
            break;
          }
        }
        if (schonVorher) continue;

        const bEndeMs = sitzungsEnde(g.bEnde);
        let start = -1;
        for (let i = 0; i < bars.length; i++) {
          if (bars[i].t < bEndeMs || bars[i].tag < ersterVollerTag) continue;
          if (beruehrt(g, bars[i].h, bars[i].l)) { start = i; break; }
        }
        if (start < 0) continue;
        if (zuFrueh(d3, g, bars[start].tag)) {
          verworfen[tf] = (verworfen[tf] ?? 0) + 1;
          continue;
        }
        void fruehAbgeraeumt;
        for (const v of VARIANTEN.filter((x) => x.tf === tf)) {
          const s = vor[g.seite];
          const e: SetupEinstellung = { ...SETUP_STANDARD, bos: v.bos, maxKerzenBisEinstieg: FRIST_KERZEN[tf] };
          const r0 = simuliereShort(s.bars, start, s.tiefs, s.open, e);
          // Für Long die gespiegelten Preise zurückdrehen.
          const r: SetupErgebnis = g.seite === "long"
            ? { ...r0, hoch: r0.tief === null ? null : -r0.tief, tief: r0.hoch === null ? null : -r0.hoch,
                einstieg: r0.einstieg === null ? null : -r0.einstieg, sl: r0.sl === null ? null : -r0.sl, tp: r0.tp === null ? null : -r0.tp }
            : r0;
          const risikoPips = r0.risiko === null ? null : r0.risiko / pip(paar);
          const rNetto = r0.r === null || risikoPips === null || risikoPips <= 0 ? null : r0.r - kostenPips(paar) / risikoPips;
          ereignisse.push({ variante: v.name, paar, seite: g.seite, level: g.level, bStart: g.bStart, ergebnis: r, rNetto, risikoPips });
        }
      }
    }
    console.log(`${gvas.length} GVAs, ${h1.length} h1, ${m15.length} m15`);
  } catch (e) {
    const t = e instanceof Error ? e.message : String(e);
    fehler.push(`${paar}: ${t}`);
    console.log(`Fehler: ${t}`);
  }
}

/* -------------------------------------------------------------- Auswertung */
const zusammenfassung = VARIANTEN.map((v) => {
  const alle = ereignisse.filter((x) => x.variante === v.name);
  const trades: TradeZeile[] = alle
    .filter((x) => x.ergebnis.r !== null && x.rNetto !== null && ["tp", "sl", "zeit"].includes(x.ergebnis.status))
    .map((x) => ({
      paar: x.paar, seite: x.seite, trefferT: x.ergebnis.trefferT, einstiegT: x.ergebnis.einstiegT!, ausstiegT: x.ergebnis.ausstiegT!,
      status: x.ergebnis.status as TradeZeile["status"], rBrutto: x.ergebnis.r!, rNetto: x.rNetto!,
    }));
  const zaehle = (s: string) => alle.filter((x) => x.ergebnis.status === s).length;
  return {
    variante: v.name, tf: v.tf, bos: v.bos,
    treffer: alle.length, keinBos: zaehle("kein_bos"), keinEinstieg: zaehle("kein_einstieg"), offen: zaehle("offen"),
    ...kennzahlen(trades),
    risikoPipsMedian: (() => { const l = alle.map((x) => x.risikoPips).filter((x): x is number => x !== null).sort((a, b) => a - b); return l.length ? Math.round(l[Math.floor(l.length / 2)] * 10) / 10 : null; })(),
  };
});

/* ---------------------------------------------- Vergleich mit Kerims Backtest */
const manuell = await sbAlle<{ occurred_on: string; pair: string; direction: string; result: string; r_multiple: number | null }>(
  "backtest_trades", "select=occurred_on,pair,direction,result,r_multiple&order=occurred_on.asc").catch(() => []);
const vergleich = VARIANTEN.filter((v) => v.tf !== "15m").map((v) => {
  const eigene = ereignisse.filter((x) => x.variante === v.name);
  const imFenster = manuell.filter((m) => {
    const p = m.pair.toUpperCase().replace(/[^A-Z]/g, "");
    const f = fenster[`${p} ${v.tf}`];
    return f && m.occurred_on >= f.von && m.occurred_on <= f.bis;
  });
  let gefunden = 0, gleichesErgebnis = 0;
  for (const m of imFenster) {
    const p = m.pair.toUpperCase().replace(/[^A-Z]/g, "");
    const seite = /long|buy/i.test(m.direction) ? "long" : "short";
    const t = Date.parse(`${m.occurred_on}T12:00:00Z`);
    const kandidat = eigene.find((x) => x.paar === p && x.seite === seite && Math.abs(x.ergebnis.trefferT - t) <= 5 * 86_400_000);
    if (!kandidat) continue;
    gefunden++;
    const manuellWin = /tp/.test(m.result) ? "tp" : m.result === "sl" ? "sl" : m.result;
    if (kandidat.ergebnis.status === manuellWin || (manuellWin === "skip" && kandidat.ergebnis.status !== "tp" && kandidat.ergebnis.status !== "sl")) gleichesErgebnis++;
  }
  return { variante: v.name, manuellImFenster: imFenster.length, auchVomRegelwerkGefunden: gefunden, gleichesErgebnis };
});

mkdirSync("tools/backtest/ergebnisse", { recursive: true });
const datei = `tools/backtest/ergebnisse/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
writeFileSync(datei, JSON.stringify({
  erstellt: new Date().toISOString(), einstellungen: { gva: GVA_STANDARD, setup: SETUP_STANDARD, fristKerzen: FRIST_KERZEN },
  fenster, verworfenNachbarFilter: verworfen, fehler, zusammenfassung, vergleich, ereignisse,
}, null, 1));

console.log("\n=== Zusammenfassung ===");
console.table(zusammenfassung.map((z) => ({
  Variante: z.variante, Treffer: z.treffer, "ohne BOS": z.keinBos, "ohne Einstieg": z.keinEinstieg, offen: z.offen,
  Trades: z.trades, TP: z.tp, SL: z.sl, Quote: z.trefferquote, "R netto": z.rNetto, "Ø R": z.schnittNetto,
  PF: z.profitFaktor, "max DD R": z.maxDrawdownR, t: z.t, "Risiko Pips (Median)": z.risikoPipsMedian,
})));
console.log("\n=== Vergleich mit deinem manuellen Backtest ===");
console.table(vergleich);
if (fehler.length) console.log("\nFehler:", fehler);
console.log(`\nGespeichert: ${datei}`);
