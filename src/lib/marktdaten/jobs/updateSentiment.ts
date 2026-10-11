import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSentiment, myfxbookKonfiguriert } from "@/lib/marktdaten/quellen/myfxbook";
import { chunkUpsert } from "./util";

/** Retail-Sentiment als Schnappschuss ablegen (eine Zeile je Symbol und Lauf). */
export async function updateSentiment(db: SupabaseClient): Promise<Record<string, unknown>> {
  if (!myfxbookKonfiguriert()) {
    return { skipped: true, reason: "MYFXBOOK_EMAIL / MYFXBOOK_PASSWORD nicht gesetzt" };
  }
  const zeilen = await fetchSentiment();
  if (zeilen.length === 0) return { skipped: true, reason: "Myfxbook lieferte keine Symbole" };
  const jetzt = new Date().toISOString();
  const geschrieben = await chunkUpsert(
    db, "sentiment_snapshots",
    zeilen.map((z) => ({ ...z, erfasst_am: jetzt, quelle: "myfxbook" })),
    "symbol,erfasst_am",
  );
  return { symbole: geschrieben };
}
