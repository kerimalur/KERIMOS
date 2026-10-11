import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCandles } from "@/lib/marktdaten/quellen/oanda";
import { fetchYahooCandles } from "@/lib/marktdaten/quellen/yahoo";
import { INSTRUMENTS } from "@/lib/marktdaten/konstanten/instruments";
import { chunkUpsert } from "./util";

/**
 * Alle Instrumente parallel fetchen.
 * Erster Lauf: max 500 Kerzen (~2 Jahre). Folgelaeufe: nur Delta seit letztem Datum.
 */
export async function updatePrices(
  db: SupabaseClient,
  opts: { only?: string[] } = {},
): Promise<Record<string, unknown>> {
  const instruments = INSTRUMENTS.filter(
    (i) => !opts.only || opts.only.includes(i.instrument),
  );

  // Letztes Datum je Instrument aus DB (parallel)
  const lastDates = await Promise.all(
    instruments.map(async (inst) => {
      const { data } = await db
        .from("price_daily")
        .select("date")
        .eq("instrument", inst.instrument)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.date ?? null;
    }),
  );

  let ersatz = 0;
  // OANDA-Candles parallel fetchen (Yahoo als Ersatz)
  const results = await Promise.allSettled(
    instruments.map(async (inst, i) => {
      const lastDate = lastDates[i];
      const optionen = lastDate ? { from: lastDate } : { count: 500 };
      let candles;
      try {
        candles = await fetchCandles(inst.instrument, optionen);
      } catch (e) {
        // OANDA antwortet nicht (Schlüssel, Konto, Host): Ersatz über Yahoo, damit die Kurse nicht stehen bleiben.
        try {
          candles = await fetchYahooCandles(inst.instrument, optionen);
          ersatz++;
        } catch (e2) {
          throw new Error(`${e instanceof Error ? e.message : e} · Yahoo: ${e2 instanceof Error ? e2.message : e2}`);
        }
      }
      const rows = candles.map((c) => ({ instrument: inst.instrument, ...c }));
      const written = await chunkUpsert(db, "price_daily", rows, "instrument,date");
      return written;
    }),
  );

  const errors: string[] = [];
  let totalRows = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      totalRows += r.value;
    } else {
      errors.push(
        `${instruments[i].instrument}: ${r.reason instanceof Error ? r.reason.message : r.reason}`,
      );
    }
  }

  if (errors.length === instruments.length) {
    throw new Error(`alle Instrumente fehlgeschlagen: ${errors[0]}`);
  }
  return { instruments: instruments.length, rows: totalRows, yahooErsatz: ersatz, errors };
}
