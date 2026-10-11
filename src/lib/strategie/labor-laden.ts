import "server-only";
import { createTradingClient } from "@/lib/supabase/trading";
import type { Kennzahlen } from "./auswertung";
import type { LaufEinstellung } from "./lauf";

/** Ein Lauf des Strategie-Labors, wie er in der Tabelle steht. */
export interface LaborLauf {
  id: string;
  erstelltAm: string;
  name: string | null;
  einstellungen: LaufEinstellung;
  kennzahlen: Kennzahlen | null;
  zaehler: Record<string, number> | null;
  fenster: { von: string | null; bis: string | null } | null;
  fehler: string | null;
  dauerS: number | null;
  quelle: string | null;
}

export interface LaborEreignis {
  id: number;
  paar: string;
  seite: "long" | "short";
  level: number;
  gvaTf: string;
  bStart: string | null;
  bEnde: string | null;
  status: string;
  trefferT: string;
  strukturT: string | null;
  struktur: number | null;
  bosT: string | null;
  hochT: string | null;
  hoch: number | null;
  tiefT: string | null;
  tief: number | null;
  einstiegT: string | null;
  einstieg: number | null;
  sl: number | null;
  tp: number | null;
  ausstiegT: string | null;
  rBrutto: number | null;
  rNetto: number | null;
  risikoPips: number | null;
  neueHochs: number;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function ladeLaeufe(): Promise<{ laeufe: LaborLauf[]; tabelleFehlt: boolean }> {
  const db = createTradingClient();
  if (!db) return { laeufe: [], tabelleFehlt: false };
  const { data, error } = await db.from("strategie_laeufe").select("*").order("erstellt_am", { ascending: false }).limit(40);
  if (error) return { laeufe: [], tabelleFehlt: /does not exist|schema cache/i.test(error.message) };
  return {
    tabelleFehlt: false,
    laeufe: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), erstelltAm: String(r.erstellt_am), name: (r.name as string | null) ?? null,
      einstellungen: r.einstellungen as LaufEinstellung,
      kennzahlen: (r.kennzahlen as Kennzahlen | null) ?? null,
      zaehler: (r.zaehler as Record<string, number> | null) ?? null,
      fenster: (r.fenster as LaborLauf["fenster"]) ?? null,
      fehler: (r.fehler as string | null) ?? null, dauerS: num(r.dauer_s), quelle: (r.quelle as string | null) ?? null,
    })),
  };
}

export async function ladeEreignisse(laufId: string): Promise<LaborEreignis[]> {
  const db = createTradingClient();
  if (!db) return [];
  const out: LaborEreignis[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db.from("strategie_ereignisse").select("*").eq("lauf_id", laufId)
      .order("treffer_t").range(off, off + 999);
    if (error) break;
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.push({
        id: Number(r.id), paar: String(r.paar), seite: r.seite as "long" | "short", level: Number(r.level),
        gvaTf: String(r.gva_tf ?? "3D"), bStart: (r.b_start as string | null) ?? null, bEnde: (r.b_ende as string | null) ?? null, status: String(r.status), trefferT: String(r.treffer_t),
        strukturT: (r.struktur_t as string | null) ?? null, struktur: num(r.struktur), bosT: (r.bos_t as string | null) ?? null,
        hochT: (r.hoch_t as string | null) ?? null, hoch: num(r.hoch), tiefT: (r.tief_t as string | null) ?? null, tief: num(r.tief),
        einstiegT: (r.einstieg_t as string | null) ?? null, einstieg: num(r.einstieg), sl: num(r.sl), tp: num(r.tp),
        ausstiegT: (r.ausstieg_t as string | null) ?? null, rBrutto: num(r.r_brutto), rNetto: num(r.r_netto),
        risikoPips: num(r.risiko_pips), neueHochs: Number(r.neue_hochs ?? 0),
      });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}
