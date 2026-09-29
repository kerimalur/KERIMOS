import "server-only";
import { heuteISO, weekStart } from "@/lib/time";
import type { ZielStatus } from "@/lib/wochenziele/typen";
import { nutzerDb } from "./auth";

/**
 * Schreibzugriffe von Claude auf Kompass (MCP Stufe 2, 29.09.2026).
 *
 * Läuft mit dem Token des Benutzers — RLS entscheidet, nicht der Code. Jeder
 * Aufruf landet in `mcp_log`, auch wenn er scheitert. Bewusst NICHT dabei:
 * Löschen und alles am Trading-Journal.
 *
 * Die Regeln folgen den Server-Actions der App (lib/wochenziele/actions.ts,
 * lib/routinen/actions.ts, lib/essen-notizen/actions.ts), damit ein Eintrag
 * von Claude genauso aussieht wie einer von Hand.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const STATI: ZielStatus[] = ["offen", "angefangen", "fertig"];

type Db = ReturnType<typeof nutzerDb>;

async function protokoll(db: Db, clientId: string, werkzeug: string, eingabe: unknown, ergebnis: string) {
  await db.from("mcp_log").insert({
    werkzeug, eingabe: eingabe ?? {}, ergebnis: ergebnis.slice(0, 500), client_id: clientId,
  });
}

/** Führt eine Schreibaktion aus und protokolliert sie — Erfolg wie Fehler. */
async function mitProtokoll<T>(
  token: string, clientId: string, werkzeug: string, eingabe: unknown,
  f: (db: Db) => Promise<T>,
): Promise<T> {
  const db = nutzerDb(token);
  try {
    const r = await f(db);
    await protokoll(db, clientId, werkzeug, eingabe, "ok");
    return r;
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    await protokoll(db, clientId, werkzeug, eingabe, `Fehler: ${text}`);
    throw e;
  }
}

// ---------------------------------------------------------------- Wochenziele

export async function wochenzielErstellen(
  token: string, clientId: string,
  e: { titel: string; details?: string; dringend?: boolean; datum?: string },
) {
  return mitProtokoll(token, clientId, "wochenziel_erstellen", e, async (db) => {
    const titel = e.titel.trim().slice(0, 300);
    if (!titel) throw new Error("Titel fehlt.");
    const woche = weekStart(e.datum && ISO.test(e.datum) ? e.datum : heuteISO());

    const { data: letzte } = await db.from("wochenziele").select("reihenfolge")
      .eq("woche", woche).order("reihenfolge", { ascending: false }).limit(1);
    const reihenfolge = Number((letzte?.[0] as { reihenfolge?: number } | undefined)?.reihenfolge ?? 0) + 1;

    const { data, error } = await db.from("wochenziele").insert({
      woche, titel,
      details: (e.details ?? "").trim().slice(0, 5000),
      status: "offen",
      dringend: Boolean(e.dringend),
      reihenfolge,
    }).select("id, woche, titel").single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function wochenzielAendern(
  token: string, clientId: string,
  e: { id: string; titel?: string; details?: string; status?: ZielStatus; dringend?: boolean; lernnotiz?: string },
) {
  return mitProtokoll(token, clientId, "wochenziel_aendern", e, async (db) => {
    const patch: Record<string, unknown> = { aktualisiert: new Date().toISOString() };
    if (e.titel !== undefined) {
      const t = e.titel.trim().slice(0, 300);
      if (!t) throw new Error("Titel darf nicht leer sein.");
      patch.titel = t;
    }
    if (e.details !== undefined) patch.details = e.details.trim().slice(0, 5000);
    if (e.status !== undefined) {
      if (!STATI.includes(e.status)) throw new Error("Ungültiger Status.");
      patch.status = e.status;
    }
    if (e.dringend !== undefined) patch.dringend = e.dringend;
    if (e.lernnotiz !== undefined) patch.lernnotiz = e.lernnotiz.trim().slice(0, 5000) || null;
    if (Object.keys(patch).length === 1) throw new Error("Nichts zu ändern.");

    const { data, error } = await db.from("wochenziele").update(patch)
      .eq("id", e.id).select("id, titel, status, dringend, lernnotiz").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Wochenziel nicht gefunden.");
    return data;
  });
}

// ------------------------------------------------------------------- Routinen

export async function routineSetzen(
  token: string, clientId: string,
  e: { handlung_id: string; erledigt: boolean; datum?: string },
) {
  return mitProtokoll(token, clientId, "routine_abhaken", e, async (db) => {
    const datum = e.datum && ISO.test(e.datum) ? e.datum : heuteISO();

    const { data: handlung } = await db.from("routine_handlungen").select("id, titel")
      .eq("id", e.handlung_id).maybeSingle();
    if (!handlung) throw new Error("Handlung nicht gefunden.");

    const { data: da } = await db.from("routine_erledigt").select("id")
      .eq("handlung_id", e.handlung_id).eq("datum", datum).maybeSingle();

    if (e.erledigt && !da) {
      const { error } = await db.from("routine_erledigt").insert({ handlung_id: e.handlung_id, datum });
      if (error) throw new Error(error.message);
    }
    if (!e.erledigt && da) {
      const { error } = await db.from("routine_erledigt").delete().eq("id", (da as { id: string }).id);
      if (error) throw new Error(error.message);
    }
    return { handlung: (handlung as { titel: string }).titel, datum, erledigt: e.erledigt };
  });
}

// --------------------------------------------------------------- Essen-Notiz

export async function essenNotizSetzen(
  token: string, clientId: string, userId: string,
  e: { datum: string; text: string },
) {
  return mitProtokoll(token, clientId, "essen_notiz_setzen", e, async (db) => {
    if (!ISO.test(e.datum)) throw new Error("Ungültiges Datum.");
    const inhalt = e.text.slice(0, 10_000);
    const { error } = inhalt.trim()
      ? await db.from("essen_notizen").upsert(
          { user_id: userId, datum: e.datum, text: inhalt, aktualisiert: new Date().toISOString() },
          { onConflict: "user_id,datum" })
      : await db.from("essen_notizen").delete().eq("user_id", userId).eq("datum", e.datum);
    if (error) throw new Error(error.message);
    return { datum: e.datum, gespeichert: Boolean(inhalt.trim()) };
  });
}
