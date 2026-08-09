"use server";
import { revalidatePath } from "next/cache";
import { createTradingClient } from "@/lib/supabase/trading";

/**
 * Server Actions für das native Backtest-Journal unter /trading/backtest.
 * Eigene Datei statt trading-actions.ts - anderes Thema, gleiche Konvention
 * wie garmin-actions.ts.
 */

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string): number | null => {
  const v = text(fd, k);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function addBacktestTrade(fd: FormData) {
  const occurred_on = text(fd, "occurred_on");
  const pair = text(fd, "pair").toUpperCase().replace(/[^A-Z]/g, "");
  const direction = text(fd, "direction");
  const result = text(fd, "result");
  if (!occurred_on || !pair || !direction || !result) {
    throw new Error("Datum, Pair, Richtung und Ergebnis sind Pflicht");
  }

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { data: trade, error } = await supabase
    .from("backtest_trades")
    .insert({
      occurred_on, pair, direction, result,
      r_multiple: num(fd, "r_multiple"),
      rr_geplant: num(fd, "rr_geplant"),
      notiz: text(fd, "notiz") || null,
      tradingview_link: text(fd, "tradingview_link") || null,
      screenshot_url: text(fd, "screenshot_url") || null,
    })
    .select("id")
    .single();
  if (error || !trade) throw new Error(`Trade anlegen: ${error?.message ?? "unbekannt"}`);

  // Tags einsammeln: Single-Selects (gva_typ, skip_grund) und Mehrfachauswahl
  // (confluence, anmerkung) landen alle als Checkbox-/Select-Werte im FormData.
  const tagIds = [
    ...fd.getAll("gva_typ"),
    ...fd.getAll("confluence"),
    ...fd.getAll("anmerkung"),
    ...fd.getAll("skip_grund"),
  ].map(String).filter(Boolean);

  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("backtest_trade_tags")
      .insert(tagIds.map((tag_id) => ({ trade_id: trade.id, tag_id })));
    if (tagError) throw new Error(`Tags verknüpfen: ${tagError.message}`);
  }

  revalidatePath("/trading/backtest");
}

export async function deleteBacktestTrade(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("backtest_trades").delete().eq("id", id);
  if (error) throw new Error(`Trade löschen: ${error.message}`);

  revalidatePath("/trading/backtest");
}

export async function addBacktestTag(fd: FormData) {
  const category_id = text(fd, "category_id");
  const label = text(fd, "label");
  if (!category_id || !label) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { data: max } = await supabase
    .from("backtest_tags").select("sort_order")
    .eq("category_id", category_id).order("sort_order", { ascending: false }).limit(1);
  const sort_order = (max?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase
    .from("backtest_tags").insert({ category_id, label, sort_order });
  if (error) throw new Error(`Tag anlegen: ${error.message}`);

  revalidatePath("/trading/backtest");
}

export async function renameBacktestTag(fd: FormData) {
  const id = text(fd, "id");
  const label = text(fd, "label");
  if (!id || !label) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("backtest_tags").update({ label }).eq("id", id);
  if (error) throw new Error(`Tag umbenennen: ${error.message}`);

  revalidatePath("/trading/backtest");
}

/**
 * Tags werden archiviert statt gelöscht: bestehende Trades behalten ihre
 * Verknüpfung und Historie, das Archiv-Flag blendet den Tag nur aus dem
 * Formular für neue Trades aus (fetchBacktestCategories(false)).
 */
export async function archiveBacktestTag(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("backtest_tags").update({ archived: true }).eq("id", id);
  if (error) throw new Error(`Tag archivieren: ${error.message}`);

  revalidatePath("/trading/backtest");
}

export async function reaktiviereBacktestTag(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("backtest_tags").update({ archived: false }).eq("id", id);
  if (error) throw new Error(`Tag reaktivieren: ${error.message}`);

  revalidatePath("/trading/backtest");
}
