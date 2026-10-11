/**
 * Kerzen für das Strategie-Labor (11.10.2026): Yahoo-Intraday laden, zu 4h
 * bündeln, Tageskerzen bilden. Ohne `server-only`, damit der Backtest-Lauf
 * im Terminal (tools/backtest) dieselben Funktionen nutzt.
 */
import type { Kerze } from "../trading/zeitrahmen";
import type { Bar } from "./setup";
import { handelstag, vierStundenBlock } from "./zeit";

export type LaborTf = "1h" | "4h";

/** Yahoo-Stundenkerzen (rund 2 Jahre). Die letzte, offene Kerze fällt weg. */
export async function yahooStunden(paar: string): Promise<Bar[]> {
  const sym = `${paar}=X`;
  let json: any = null;
  let fehler = "";
  for (let versuch = 0; versuch < 3 && !json; versuch++) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=730d&interval=1h`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) kerimos-labor" },
        cache: "no-store", signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) json = await r.json(); else fehler = `HTTP ${r.status}`;
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
    if (!json) await new Promise((s) => setTimeout(s, 1200));
  }
  const res = json?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  if (!res?.timestamp || !q) throw new Error(`Yahoo ${sym}: ${fehler || "keine Daten"}`);
  const bars: Bar[] = [];
  const gesehen = new Set<number>();
  (res.timestamp as number[]).forEach((t, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((x: unknown) => x == null) || gesehen.has(t)) return;
    if (h < l || h <= 0) return;
    gesehen.add(t);
    const ms = t * 1000;
    bars.push({ t: ms, o, h, l, c, tag: handelstag(ms) });
  });
  bars.sort((a, b) => a.t - b.t);
  if (bars.length) bars.pop();
  return bars;
}

export function zu4h(stunden: Bar[]): Bar[] {
  const m = new Map<number, Bar>();
  for (const b of stunden) {
    const k = vierStundenBlock(b.t);
    const x = m.get(k);
    if (!x) m.set(k, { ...b });
    else { x.h = Math.max(x.h, b.h); x.l = Math.min(x.l, b.l); x.c = b.c; }
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

export function tageAusBars(bars: Bar[]): Kerze[] {
  const m = new Map<string, Kerze>();
  for (const b of bars) {
    const x = m.get(b.tag);
    if (!x) m.set(b.tag, { zeit: b.tag, open: b.o, high: b.h, low: b.l, close: b.c });
    else { x.high = Math.max(x.high, b.h); x.low = Math.min(x.low, b.l); x.close = b.c; }
  }
  return [...m.values()]
    .filter((k) => { const wt = new Date(`${k.zeit}T12:00:00Z`).getUTCDay(); return wt >= 1 && wt <= 5; })
    .sort((a, b) => a.zeit.localeCompare(b.zeit));
}

export const pipGroesse = (paar: string) => (paar.endsWith("JPY") ? 0.01 : 0.0001);
