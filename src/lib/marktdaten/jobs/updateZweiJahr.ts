import type { SupabaseClient } from "@supabase/supabase-js";
import { holeChf2J, holeGbp2J, type ZinsPunkt } from "@/lib/marktdaten/quellen/zweijahr";
import { chunkUpsert } from "./util";

/**
 * 2-Jahres-Renditen GBP und CHF in fred_series schreiben (05.10.2026).
 * Gleiche IDs wie die übrigen Währungen (Y2_<CCY>), damit Confluence,
 * Makro-Urteil und Rückrechnung sie ohne Änderung finden.
 *
 * CHF: rollierend 60 Tage (heilt Lücken selbst). GBP: der laufende Monat aus
 * der BoE-Datei. Die Geschichte ab 2022 wurde einmalig nachgeladen.
 */
export async function updateZweiJahr(db: SupabaseClient): Promise<Record<string, unknown>> {
  const von = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const jetzt = new Date().toISOString();
  const quellen: [string, () => Promise<ZinsPunkt[]>][] = [
    ["Y2_CHF", () => holeChf2J(von)],
    ["Y2_GBP", () => holeGbp2J()],
  ];
  const bericht: Record<string, unknown> = {};
  let fehler = 0;
  let zeilen = 0;
  for (const [id, holen] of quellen) {
    try {
      const punkte = await holen();
      zeilen += await chunkUpsert(db, "fred_series", punkte.map((p) => ({ series_id: id, date: p.date, value: p.value })), "series_id,date");
      const letztes = punkte[punkte.length - 1]?.date ?? null;
      const alterTage = letztes ? (Date.now() - Date.parse(`${letztes}T00:00:00Z`)) / 86_400_000 : Infinity;
      await db.from("fred_series_meta").upsert(
        { series_id: id, ...(letztes ? { last_date: letztes } : {}), last_fetched: jetzt, is_stale: alterTage > 7 },
        { onConflict: "series_id" },
      );
      bericht[id] = { punkte: punkte.length, letztes };
    } catch (e) {
      fehler++;
      bericht[id] = { fehler: e instanceof Error ? e.message : String(e) };
      await db.from("fred_series_meta").upsert({ series_id: id, last_fetched: jetzt, is_stale: true }, { onConflict: "series_id" });
    }
  }
  if (fehler === quellen.length) throw new Error(`2J-Renditen: keine Quelle erreichbar ${JSON.stringify(bericht)}`);
  return { rows: zeilen, ...bericht };
}
