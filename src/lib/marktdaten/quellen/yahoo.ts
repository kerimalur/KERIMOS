import type { Candle } from "./oanda";

/**
 * Ersatzquelle für Tageskerzen, wenn OANDA nicht antwortet (Kurse standen seit
 * dem 27.09.2026 still). Yahoo Finance braucht keinen Schlüssel. Die
 * Tagesgrenze weicht leicht von OANDA ab (Yahoo: Londoner Mitternacht), für
 * Rückblick, Messungen und Hit-Auswertung reicht das — OANDA bleibt die erste
 * Wahl und überschreibt beim nächsten erfolgreichen Lauf dieselben Tage.
 */

const SONDER: Record<string, string> = {
  XAU_USD: "GC=F", WTICO_USD: "CL=F", BCO_USD: "BZ=F", XCU_USD: "HG=F",
  SPX500_USD: "^GSPC", BTC_USD: "BTC-USD",
};

export function yahooSymbol(instrument: string): string {
  if (SONDER[instrument]) return SONDER[instrument];
  return `${instrument.replace("_", "")}=X`;
}

interface YahooAntwort {
  chart?: {
    result?: {
      meta?: { gmtoffset?: number };
      timestamp?: number[];
      indicators?: { quote?: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
}

/** Abgeschlossene Tageskerzen (der heutige, noch offene Tag wird weggelassen). */
export async function fetchYahooCandles(instrument: string, opts: { from?: string; count?: number } = {}): Promise<Candle[]> {
  const symbol = yahooSymbol(instrument);
  const range = opts.from
    ? (Date.now() - Date.parse(`${opts.from}T00:00:00Z`) > 150 * 86_400_000 ? "2y" : "6mo")
    : (opts.count && opts.count > 200 ? "2y" : "6mo");
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) kerimos" }, cache: "no-store", signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  const json = (await res.json()) as YahooAntwort;
  const r = json.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q || !r.timestamp) throw new Error(`Yahoo ${symbol}: ${json.chart?.error?.description ?? "keine Daten"}`);

  const versatz = (r.meta?.gmtoffset ?? 0) * 1000;
  const heute = new Date().toISOString().slice(0, 10);
  const out: Candle[] = [];
  const gesehen = new Set<string>();
  r.timestamp.forEach((t, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) return;
    const date = new Date(t * 1000 + versatz).toISOString().slice(0, 10);
    if (date >= heute) return;
    if (opts.from && date < opts.from) return;
    // Yahoo hängt eine Live-Zeile mit eigenem Zeitstempel an: gleicher Tag zweimal bräche den Upsert.
    if (gesehen.has(date)) return;
    gesehen.add(date);
    out.push({ date, open: o, high: h, low: l, close: c, volume: q.volume[i] ?? 0 });
  });
  return out;
}

export interface YahooStunde { t: number; close: number }

/** Stundenkerzen der letzten ~2 Jahre (Yahoo erlaubt für 1h bis zu 730 Tage). t = Beginn in ms (UTC). */
export async function fetchYahooStunden(instrument: string): Promise<YahooStunde[]> {
  const symbol = yahooSymbol(instrument);
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1h`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) kerimos" }, cache: "no-store", signal: AbortSignal.timeout(25_000) },
  );
  if (!res.ok) throw new Error(`Yahoo ${symbol} 1h: HTTP ${res.status}`);
  const json = (await res.json()) as YahooAntwort;
  const r = json.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q || !r.timestamp) throw new Error(`Yahoo ${symbol} 1h: ${json.chart?.error?.description ?? "keine Daten"}`);
  const out: YahooStunde[] = [];
  const gesehen = new Set<number>();
  r.timestamp.forEach((t, i) => {
    const c = q.close[i];
    if (c == null || gesehen.has(t)) return;
    gesehen.add(t);
    out.push({ t: t * 1000, close: c });
  });
  return out.sort((a, b) => a.t - b.t);
}
