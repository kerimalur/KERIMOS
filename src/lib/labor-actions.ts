"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTradingClient } from "@/lib/supabase/trading";
import { datenquelle, speichereLauf } from "@/lib/strategie/daten";
import { fuehreLaufAus, LAUF_STANDARD, type LaufEinstellung } from "@/lib/strategie/lauf";

/**
 * Strategie-Labor (11.10.2026): einen Durchlauf mit den Einstellungen aus dem
 * Formular rechnen und speichern. Dauert je nach Yahoo 30–90 Sekunden; die
 * Seite hat dafür maxDuration = 300.
 */

const zahl = (fd: FormData, k: string, std: number, min: number, max: number) => {
  const n = Number(String(fd.get(k) ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std;
};

function db(): SupabaseClient {
  const c = createTradingClient();
  if (!c) throw new Error("Trading-Datenbank nicht verbunden");
  return c as unknown as SupabaseClient;
}

export async function starteLaborLauf(fd: FormData) {
  const e: LaufEinstellung = {
    gvaTol: zahl(fd, "gvaTol", LAUF_STANDARD.gvaTol, 0.5, 100),
    gvaK2: zahl(fd, "gvaK2", LAUF_STANDARD.gvaK2, 0, 500),
    wochen: fd.get("wochen") !== null,
    strukturTf: fd.get("strukturTf") === "chart" ? "chart" : fd.get("strukturTf") === "4h" ? "4h" : "impuls4h",
    impulsAtr: zahl(fd, "impulsAtr", LAUF_STANDARD.impulsAtr, 0.1, 5),
    tf: fd.get("tf") === "4h" ? "4h" : "1h",
    bos: fd.get("bos") === "docht" ? "docht" : "schluss",
    swingN: Math.round(zahl(fd, "swingN", LAUF_STANDARD.swingN, 1, 20)),
    dailyOpen: fd.get("dailyOpen") !== null,
    tolPips: zahl(fd, "tolPips", LAUF_STANDARD.tolPips, 0, 100),
    maxTage: zahl(fd, "maxTage", LAUF_STANDARD.maxTage, 0.5, 60),
    einstiegFib: zahl(fd, "einstiegFib", LAUF_STANDARD.einstiegFib, 0.1, 0.95),
    tpFib: zahl(fd, "tpFib", LAUF_STANDARD.tpFib, -5, 0),
    kostenMajors: zahl(fd, "kostenMajors", LAUF_STANDARD.kostenMajors, 0, 20),
    kostenCrosses: zahl(fd, "kostenCrosses", LAUF_STANDARD.kostenCrosses, 0, 20),
  };
  const name = String(fd.get("name") ?? "").trim()
    || `${e.tf} · Struktur ${e.strukturTf === "impuls4h" ? `Impuls ${e.impulsAtr}×ATR` : e.strukturTf === "4h" ? "4h-Swing" : `${e.tf}-Swing`} · BOS ${e.bos === "schluss" ? "Schluss" : "Docht"} · Swing ${e.swingN}${e.wochen ? " · mit W-GVA" : ""}${e.dailyOpen ? "" : " · ohne Daily Open"}`;
  const c = db();
  const start = Date.now();
  const r = await fuehreLaufAus(e, datenquelle(c));
  const id = await speichereLauf(c, name, e, r, Math.round((Date.now() - start) / 100) / 10, "labor");
  revalidatePath("/trading/labor");
  redirect(`/trading/labor?lauf=${id}`);
}

export async function loescheLaborLauf(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const { error } = await db().from("strategie_laeufe").delete().eq("id", id);
  if (error) throw new Error(`Löschen: ${error.message}`);
  revalidatePath("/trading/labor");
  redirect("/trading/labor");
}
