/**
 * Datenquelle und Speicher des Strategie-Labors (11.10.2026). Arbeitet mit
 * einem übergebenen Supabase-Client (Schema trading), damit Server und
 * Terminal denselben Weg gehen.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kerze } from "../trading/zeitrahmen";
import { yahooStunden } from "./kerzen";
import type { Datenquelle, LaufEinstellung, LaufErgebnis } from "./lauf";

/** OANDA-Tageskerzen (price_daily). OANDA beschriftet mit dem Sitzungsbeginn (So–Do) → Handelstag +1. */
export async function ladeTage(db: SupabaseClient, paar: string): Promise<Kerze[]> {
  const inst = `${paar.slice(0, 3)}_${paar.slice(3)}`;
  const out: Kerze[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db.from("price_daily").select("date, open, high, low, close")
      .eq("instrument", inst).order("date").range(off, off + 999);
    if (error) throw new Error(`price_daily ${paar}: ${error.message}`);
    for (const r of (data ?? []) as { date: string; open: number; high: number; low: number; close: number }[]) {
      const tag = new Date(Date.parse(`${r.date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      out.push({ zeit: tag, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

export function datenquelle(db: SupabaseClient, stunden: (paar: string) => Promise<import("./setup").Bar[]> = yahooStunden): Datenquelle {
  return { tage: (p) => ladeTage(db, p), stunden };
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** Lauf und alle Ereignisse speichern. Gibt die id zurück. */
export async function speichereLauf(
  db: SupabaseClient, name: string, e: LaufEinstellung, r: LaufErgebnis, dauerS: number, quelle: string,
): Promise<string> {
  const { data, error } = await db.from("strategie_laeufe").insert({
    name, einstellungen: e, kennzahlen: r.kennzahlen, zaehler: r.zaehler, fenster: r.fenster,
    fehler: r.fehler.length ? r.fehler.join(" | ") : null, dauer_s: dauerS, quelle,
  }).select("id").single();
  if (error || !data) throw new Error(`Lauf speichern: ${error?.message ?? "keine id"}`);
  const id = String((data as { id: string }).id);
  const zeilen = r.ereignisse.map((x) => ({
    lauf_id: id, paar: x.paar, seite: x.seite, level: x.level, gva_tf: x.gvaTf, b_start: x.bStart, b_ende: x.bEnde, status: x.status,
    treffer_t: iso(x.trefferT), struktur_t: iso(x.strukturT), struktur: x.struktur, bos_t: iso(x.bosT),
    hoch_t: iso(x.hochT), hoch: x.hoch, tief_t: iso(x.tiefT), tief: x.tief,
    einstieg_t: iso(x.einstiegT), einstieg: x.einstieg, sl: x.sl, tp: x.tp, ausstieg_t: iso(x.ausstiegT),
    r_brutto: x.r, r_netto: x.rNetto, risiko_pips: x.risikoPips, neue_hochs: x.neueHochs,
  }));
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error: e2 } = await db.from("strategie_ereignisse").insert(zeilen.slice(i, i + 500));
    if (e2) throw new Error(`Ereignisse speichern: ${e2.message}`);
  }
  return id;
}
