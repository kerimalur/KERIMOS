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

/** "eurusd", "EUR/USD", " eurusd " -> "EURUSD". */
function normalisierePair(roh: string): string {
  return roh.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Neue Session starten: Pair einmal festlegen, damit man es beim Erfassen
 * einzelner Trades nicht jedes Mal eintippen muss. Neue Sessions starten
 * immer "aktiv" und stehen sofort im Trade-Formular zur Auswahl.
 */
export async function startBacktestSession(fd: FormData) {
  const pair = normalisierePair(text(fd, "pair"));
  if (pair.length < 6) throw new Error("Pair fehlt oder ist zu kurz (z. B. GBPAUD)");

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase
    .from("backtest_journal_sessions")
    .insert({ pair, status: "aktiv" });
  if (error) throw new Error(`Session starten: ${error.message}`);

  revalidatePath("/trading/backtest");
}

/** Session abschliessen = auswerten. Trades und ihre Zahlen bleiben erhalten. */
export async function closeBacktestSession(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase
    .from("backtest_journal_sessions")
    .update({ status: "abgeschlossen", closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Session abschliessen: ${error.message}`);

  revalidatePath("/trading/backtest");
}

/** Eine abgeschlossene Session weiterführen: wieder aktiv, wieder wählbar. */
export async function reaktiviereBacktestSession(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase
    .from("backtest_journal_sessions")
    .update({ status: "aktiv", closed_at: null })
    .eq("id", id);
  if (error) throw new Error(`Session reaktivieren: ${error.message}`);

  revalidatePath("/trading/backtest");
}

export async function addBacktestTrade(fd: FormData) {
  const occurred_on = text(fd, "occurred_on");
  const session_id = text(fd, "session_id");
  const direction = text(fd, "direction");
  const result = text(fd, "result");
  if (!occurred_on || !session_id || !direction || !result) {
    throw new Error("Datum, Session, Richtung und Ergebnis sind Pflicht");
  }

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  // Pair kommt aus der Session, nicht mehr aus dem Formular - genau das
  // war der Punkt einer Session: einmal festlegen, nicht jedes Mal eintippen.
  const { data: session, error: sessionError } = await supabase
    .from("backtest_journal_sessions")
    .select("pair")
    .eq("id", session_id)
    .single();
  if (sessionError || !session) throw new Error("Session nicht gefunden");

  const { data: trade, error } = await supabase
    .from("backtest_trades")
    .insert({
      occurred_on, session_id, direction, result,
      pair: session.pair,
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

/**
 * Bestehenden Trade ändern, inklusive Tags.
 *
 * Die Tag-Verknüpfungen werden ersetzt statt abgeglichen: bei höchstens
 * neun Zeilen pro Trade ist Löschen-und-neu-Anlegen einfacher und weniger
 * fehleranfällig als ein Diff.
 */
export async function updateBacktestTrade(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase
    .from("backtest_trades")
    .update({
      occurred_on: text(fd, "occurred_on"),
      direction: text(fd, "direction"),
      result: text(fd, "result"),
      r_multiple: num(fd, "r_multiple"),
      rr_geplant: num(fd, "rr_geplant"),
      notiz: text(fd, "notiz") || null,
      tradingview_link: text(fd, "tradingview_link") || null,
      screenshot_url: text(fd, "screenshot_url") || null,
    })
    .eq("id", id);
  if (error) throw new Error(`Trade ändern: ${error.message}`);

  const tagIds = [
    ...fd.getAll("gva_typ"), ...fd.getAll("confluence"),
    ...fd.getAll("anmerkung"), ...fd.getAll("skip_grund"),
  ].map(String).filter(Boolean);

  await supabase.from("backtest_trade_tags").delete().eq("trade_id", id);
  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("backtest_trade_tags")
      .insert(tagIds.map((tag_id) => ({ trade_id: id, tag_id })));
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

/* ------------------------------------------------------------- Checkliste */

export async function addChecklistPunkt(fd: FormData) {
  const label = text(fd, "label");
  if (!label) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { data: max } = await supabase
    .from("backtest_checklist").select("sort_order")
    .order("sort_order", { ascending: false }).limit(1);

  const { error } = await supabase.from("backtest_checklist")
    .insert({ label, sort_order: (max?.[0]?.sort_order ?? 0) + 1 });
  if (error) throw new Error(`Punkt anlegen: ${error.message}`);

  revalidatePath("/trading/backtest");
  revalidatePath("/trading/backtest/kategorien");
}

export async function renameChecklistPunkt(fd: FormData) {
  const id = text(fd, "id");
  const label = text(fd, "label");
  if (!id || !label) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("backtest_checklist")
    .update({ label }).eq("id", id);
  if (error) throw new Error(`Punkt umbenennen: ${error.message}`);

  revalidatePath("/trading/backtest");
  revalidatePath("/trading/backtest/kategorien");
}

/** Wie bei den Tags: archivieren statt löschen. */
export async function archiveChecklistPunkt(fd: FormData) {
  const id = text(fd, "id");
  if (!id) return;

  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const { error } = await supabase.from("backtest_checklist")
    .update({ archived: fd.get("wieder") ? false : true }).eq("id", id);
  if (error) throw new Error(`Punkt archivieren: ${error.message}`);

  revalidatePath("/trading/backtest");
  revalidatePath("/trading/backtest/kategorien");
}
