
export interface Candle {
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OandaCandle {
  complete: boolean;
  volume: number;
  time: string;
  mid: { o: string; h: string; l: string; c: string };
}

function baseUrl(): string {
  return process.env.OANDA_URL ?? "https://api-fxpractice.oanda.com/v3";
}

function headers(): HeadersInit {
  const key = process.env.OANDA_API_KEY;
  if (!key) throw new Error("OANDA_API_KEY fehlt");
  return {
    Authorization: `Bearer ${key}`,
    "Accept-Datetime-Format": "RFC3339",
  };
}

/**
 * Tageskerzen (Mid). Entweder `count` (max 5000) oder `from` (ISO-Datum,
 * inkrementell). Liefert nur abgeschlossene Kerzen, chronologisch.
 */
export async function fetchCandles(
  instrument: string,
  opts: { count?: number; from?: string } = {},
): Promise<Candle[]> {
  const params = new URLSearchParams({ granularity: "D", price: "M" });
  if (opts.from) {
    params.set("from", `${opts.from}T00:00:00Z`);
    // OANDA verlangt count ODER from+to/count; from+count=5000 deckt alles ab
    params.set("count", String(opts.count ?? 5000));
  } else {
    params.set("count", String(opts.count ?? 5000));
  }

  const res = await fetch(
    `${baseUrl()}/instruments/${instrument}/candles?${params}`,
    { headers: headers(), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`OANDA ${instrument}: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { candles: OandaCandle[] };

  return json.candles
    .filter((c) => c.complete)
    .map((c) => ({
      date: c.time.slice(0, 10),
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: c.volume,
    }));
}

export interface IntradayKerze {
  zeit: string; // ISO, Beginn der Kerze (UTC)
  open: number;
  close: number;
  complete: boolean;
}

/**
 * Intraday-Kerzen (Mid) ab einem Zeitpunkt — für den Markt-Check nach
 * Kalenderzahlen (lib/makro/marktcheck.ts, 02.10.2026). Liefert auch die
 * noch offene letzte Kerze, damit ein Check kurz nach der Zahl schon
 * etwas zeigt.
 */
export async function fetchIntraday(
  instrument: string,
  granularity: "M15" | "H1",
  fromIso: string,
  count: number,
): Promise<IntradayKerze[]> {
  const params = new URLSearchParams({ granularity, price: "M", from: fromIso, count: String(count) });
  const res = await fetch(`${baseUrl()}/instruments/${instrument}/candles?${params}`, {
    headers: headers(), cache: "no-store", signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`OANDA ${instrument} ${granularity}: HTTP ${res.status}`);
  const json = (await res.json()) as { candles: OandaCandle[] };
  return json.candles.map((c) => ({
    zeit: new Date(c.time).toISOString(),
    open: parseFloat(c.mid.o),
    close: parseFloat(c.mid.c),
    complete: c.complete,
  }));
}
