"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTradingClient } from "@/lib/supabase/trading";

/**
 * Server Actions für den Markt-Tab (11.10.2026).
 *
 * Linien anlegen und ändern, archivieren, Fokus setzen, den Drei-Punkte-Check
 * festhalten und die Pflicht-Entscheidung Trade oder Skip.
 *
 * Wichtig für die Alarme: der Treffer-Alarm meldet „einmal je Linie und Art —
 * endgültig" (alarm_log). Ändert sich das Level einer Linie, wäre sie damit
 * für immer stumm. Deshalb werden die Alarm-Einträge dieser Linie beim
 * Ändern des Levels gelöscht — dann meldet sie sich am neuen Level wieder.
 */

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const zahl = (fd: FormData, k: string): number | null => {
  const v = text(fd, k);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const pair = (roh: string) => roh.toUpperCase().replace(/[^A-Z]/g, "");
const seiteVon = (v: string) => (v === "long" || v === "short" ? v : null);
const dreiwert = (fd: FormData, k: string): boolean | null => {
  const v = text(fd, k);
  return v === "ja" ? true : v === "nein" ? false : null;
};

function neuLaden() {
  revalidatePath("/trading");
  revalidatePath("/");
}

function verbinde() {
  const db = createTradingClient();
  if (!db) throw new Error("Trading-Datenbank nicht verbunden");
  return db;
}

/** Linie anlegen (ohne id) oder ändern (mit id). */
export async function linieSpeichern(fd: FormData) {
  const db = verbinde();
  const id = text(fd, "id");
  const p = pair(text(fd, "pair"));
  if (p.length < 6) throw new Error("Pair unvollständig (z.B. EURUSD)");
  const level = zahl(fd, "line_level");
  const prio = Math.min(3, Math.max(1, Math.round(zahl(fd, "prioritaet") ?? 2)));
  const bias = text(fd, "bias_eigen");

  const werte = {
    pair: p,
    side: seiteVon(text(fd, "side")),
    line_level: level,
    warum: text(fd, "warum") || null,
    note: text(fd, "note") || null,
    bias_eigen: bias === "long" || bias === "short" || bias === "neutral" ? bias : null,
    prioritaet: prio,
    fokus: fd.get("fokus") !== null,
    chart_url: text(fd, "chart_url") || null,
    kategorie_id: text(fd, "kategorie_id") || null,
    alarm_on_hit: fd.get("alarm_on_hit") !== null,
    alarm_pips: zahl(fd, "alarm_pips") ?? 30,
    alarm_time: text(fd, "alarm_time") || null,
    show_until: text(fd, "show_until") || null,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data: alt } = await db.from("trading_watchlist").select("line_level").eq("id", id).maybeSingle();
    const { error } = await db.from("trading_watchlist").update(werte).eq("id", id);
    if (error) throw new Error(`Linie ändern: ${error.message}`);
    const altLevel = alt?.line_level === null || alt?.line_level === undefined ? null : Number(alt.line_level);
    if (altLevel !== level) {
      // Neues Level, neue Chance auf einen Alarm.
      await db.from("alarm_log").delete().eq("watchlist_id", id);
    }
  } else {
    // Gleiches Paar und gleiches Level gilt als dieselbe Linie (wie bisher).
    const suche = db.from("trading_watchlist").select("id").eq("pair", p).eq("archived", false);
    const { data: gleiche } = level === null
      ? await suche.is("line_level", null).limit(1)
      : await suche.eq("line_level", level).limit(1);
    const treffer = ((gleiche ?? []) as { id: string }[])[0];
    const { error } = treffer
      ? await db.from("trading_watchlist").update(werte).eq("id", treffer.id)
      : await db.from("trading_watchlist").insert({ ...werte, archived: false });
    if (error) {
      if (error.code === "23505") {
        throw new Error("Die Datenbank lässt weiterhin nur eine Zeile je Pair zu — die Migration „Mehrere Linien je Pair“ fehlt.");
      }
      throw new Error(`Linie speichern: ${error.message}`);
    }
  }
  neuLaden();
}

export async function fokusUmschalten(fd: FormData) {
  const db = verbinde();
  const id = text(fd, "id");
  if (!id) return;
  const jetzt = text(fd, "fokus") === "an";
  const { error } = await db.from("trading_watchlist").update({ fokus: jetzt, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Fokus: ${error.message}`);
  neuLaden();
}

/** Archivieren statt löschen: die Linie bleibt nachlesbar, der Alarm schweigt. */
export async function linieArchivieren(fd: FormData) {
  const db = verbinde();
  const id = text(fd, "id");
  if (!id) return;
  const { error } = await db.from("trading_watchlist").update({
    archived: true, archiv_grund: text(fd, "grund") || "von Hand archiviert",
    archiviert_am: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`Archivieren: ${error.message}`);
  neuLaden();
}

export async function linieWiederherstellen(fd: FormData) {
  const db = verbinde();
  const id = text(fd, "id");
  if (!id) return;
  const { error } = await db.from("trading_watchlist").update({
    archived: false, archiv_grund: null, archiviert_am: null, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`Wiederherstellen: ${error.message}`);
  // Wieder aktiv heisst: der Alarm darf wieder melden.
  await db.from("alarm_log").delete().eq("watchlist_id", id);
  neuLaden();
}

/** Endgültig löschen — nur aus dem Archiv heraus. */
export async function linieLoeschen(fd: FormData) {
  const db = verbinde();
  const id = text(fd, "id");
  if (!id) return;
  const { error } = await db.from("trading_watchlist").delete().eq("id", id).eq("archived", true);
  if (error) throw new Error(`Löschen: ${error.message}`);
  neuLaden();
}

/** Nur die drei Prüfpunkte einer Linie festhalten, ohne zu entscheiden. */
export async function pruefungSpeichern(fd: FormData) {
  const db = verbinde();
  const id = text(fd, "id");
  if (!id) return;
  const { error } = await db.from("trading_watchlist").update({
    check_abgeholt: dreiwert(fd, "abgeholt"), check_bos: dreiwert(fd, "bos"),
    check_confluence: dreiwert(fd, "confluence"), updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`Prüfung: ${error.message}`);
  neuLaden();
}

/**
 * Pflicht-Entscheidung: Trade oder Skip, mit Grund.
 *
 * Skip archiviert die Linie (mit dem Grund). Trade lässt sie stehen und führt
 * ins Journal-Formular; nach dem Speichern dort verschwindet die Linie von
 * selbst. Die Entscheidung bleibt in beiden Fällen als eigene Zeile erhalten
 * und zählt als Leistung — nicht nur der Trade.
 */
export async function entscheidungFesthalten(fd: FormData) {
  const db = verbinde();
  const id = text(fd, "id");
  const art = text(fd, "entscheidung");
  if (!id || (art !== "trade" && art !== "skip")) return;
  const grund = text(fd, "grund");
  if (art === "skip" && grund.length < 3) throw new Error("Skip braucht einen Grund (kurz reicht).");

  const { data: l } = await db.from("trading_watchlist").select("pair, side, line_level").eq("id", id).maybeSingle();
  if (!l) throw new Error("Linie nicht gefunden");

  const check = { abgeholt: dreiwert(fd, "abgeholt"), bos: dreiwert(fd, "bos"), confluence: dreiwert(fd, "confluence") };
  const { error } = await db.from("trading_entscheidungen").insert({
    watchlist_id: id, pair: l.pair, seite: seiteVon(String(l.side ?? "")),
    level: l.line_level === null ? null : Number(l.line_level),
    entscheidung: art, grund: grund || null,
    check_abgeholt: check.abgeholt, check_bos: check.bos, check_confluence: check.confluence,
    bias: text(fd, "bias") || null,
  });
  if (error) throw new Error(`Entscheidung: ${error.message}`);

  await db.from("trading_watchlist").update({
    check_abgeholt: check.abgeholt, check_bos: check.bos, check_confluence: check.confluence,
    ...(art === "skip"
      ? { archived: true, archiv_grund: `Skip: ${grund}`, archiviert_am: new Date().toISOString() }
      : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  neuLaden();
  if (art === "trade") redirect(`/trading/journal/trades?neu=${id}`);
}
