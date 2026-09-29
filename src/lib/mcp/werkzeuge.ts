import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { mcpEssenNotizen, mcpRoutinen, mcpWochenziele } from "@/lib/mcp/kompass";
import {
  mcpBacktest, mcpGvaStatus, mcpTrades, mcpWirtschaftskalender,
} from "@/lib/mcp/trading";
import {
  essenNotizSetzen, routineSetzen, wochenzielAendern, wochenzielErstellen,
} from "@/lib/mcp/schreiben";
import type { KerimosAuth } from "@/lib/mcp/auth";
import { heuteISO } from "@/lib/time";

/**
 * Werkzeuge des KerimOS-MCP-Servers (29.09.2026).
 *
 * `registriereLesen` nutzen beide Routen: die alte mit Geheimnis im Pfad
 * (/api/mcp/<MCP_SECRET>, nur lesen) und die neue mit OAuth (/api/mcp).
 * `registriereSchreiben` hängt nur an der OAuth-Route — dort gibt es ein
 * geprüftes Benutzer-Token, und alle Schreibzugriffe laufen mit RLS.
 */

const DATUM = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD");

/** Ergebnis als JSON-Text; Fehler als lesbare Meldung statt Absturz. */
async function antwort(f: () => Promise<unknown>) {
  try {
    const daten = await f();
    return { content: [{ type: "text" as const, text: JSON.stringify(daten, null, 1) }] };
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text" as const, text: `Fehler: ${text}` }], isError: true };
  }
}

const NUR_LESEN = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

const SCHREIBEN = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export const ANWEISUNGEN =
  "KerimOS ist Kerims persönliche App: Trading (GVA-Screener, Journal, Backtests), " +
  "Wochenziele, Routinen und Essen. Alle Zeiten der App in Europe/Zurich.";

export function registriereLesen(server: McpServer) {
  server.registerTool("briefing", {
    title: "Tagesbriefing",
    description:
      "Kompakter Überblick für jetzt: offene Wochenziele, heute fällige Routinen, " +
      "GVA-Paare im Status HIT/PREPARE, offene GVA-Hits, laufende Live-Trades und " +
      "High-Impact-Termine von heute. Erste Wahl für 'was steht an' / geplante Briefings.",
    annotations: NUR_LESEN,
  }, async () => antwort(async () => {
    const teil = async <T,>(f: () => Promise<T>) => {
      try { return await f(); } catch (e) { return { fehler: e instanceof Error ? e.message : String(e) }; }
    };
    const [ziele, routinen, gva, trades, termine] = await Promise.all([
      teil(() => mcpWochenziele()),
      teil(() => mcpRoutinen()),
      teil(() => mcpGvaStatus()),
      teil(() => mcpTrades({ status: "offen", art: "live", limit: 20 })),
      teil(() => mcpWirtschaftskalender("heute")),
    ]);

    const offeneZiele = "ziele" in ziele
      ? { woche: ziele.woche, kw: ziele.kw, ziele: ziele.ziele.filter((x) => x.status !== "fertig") }
      : ziele;
    const heuteRoutinen = "ziele" in routinen
      ? routinen.ziele
          .map((r) => ({ ziel: r.ziel, handlungen: r.handlungen.filter((h) => h.heuteFaellig) }))
          .filter((r) => r.handlungen.length > 0)
      : routinen;
    const gvaKurz = "hitUndPrepare" in gva
      ? { screener: gva.screener, hitUndPrepare: gva.hitUndPrepare, offeneHits: gva.offeneHits }
      : gva;

    return {
      heute: heuteISO(),
      wochenziele: offeneZiele,
      routinenHeute: heuteRoutinen,
      gva: gvaKurz,
      offeneLiveTrades: trades,
      termineHeute: termine,
    };
  }));

  server.registerTool("wochenziele_lesen", {
    title: "Wochenziele lesen",
    description:
      "Wochenziele einer Woche (Status offen/angefangen/fertig, dringend, Details). " +
      "Ohne Datum: laufende Woche inkl. unfertiger Ziele aus Vorwochen (ausVorwoche=true).",
    inputSchema: z.object({
      datum: DATUM.optional().describe("Irgendein Tag der gewünschten Woche. Leer = laufende Woche."),
    }),
    annotations: NUR_LESEN,
  }, async ({ datum }) => antwort(() => mcpWochenziele(datum)));

  server.registerTool("routinen_lesen", {
    title: "Routinen lesen",
    description:
      "Alle Routine-Ziele mit ihren Handlungen: Plan (Tage oder x-mal pro Woche), " +
      "ob heute fällig, ob heute erledigt und Fortschritt dieser Woche.",
    annotations: NUR_LESEN,
  }, async () => antwort(() => mcpRoutinen()));

  server.registerTool("essen_notizen_lesen", {
    title: "Essen-Notizen lesen",
    description: "Tagesnotizen aus dem Essens-Monatskalender. Ohne Angaben: laufender Monat. Maximal ~3 Monate.",
    inputSchema: z.object({
      von: DATUM.optional(),
      bis: DATUM.optional(),
    }),
    annotations: NUR_LESEN,
  }, async ({ von, bis }) => antwort(() => mcpEssenNotizen(von, bis)));

  server.registerTool("gva_status", {
    title: "GVA-Status",
    description:
      "Live-Board des GVA-Screeners (nur HIT/PREPARE, sortiert nach Dringlichkeit), " +
      "offene GVA-Hits ohne Entscheidung " +
      "und Kerims selbst gezeichnete Linien.",
    annotations: { ...NUR_LESEN, openWorldHint: true },
  }, async () => antwort(() => mcpGvaStatus()));

  server.registerTool("trades_lesen", {
    title: "Trades lesen",
    description:
      "Trades aus dem Journal (Live über die Vantage-Brücke oder von Hand). " +
      "Filter nach Status, Art, Pair und Zeitraum. Neueste zuerst.",
    inputSchema: z.object({
      status: z.enum(["offen", "geschlossen", "alle"]).optional().describe("Standard: alle"),
      art: z.enum(["live", "backtest"]).optional(),
      pair: z.string().optional().describe("z.B. EURUSD oder EUR/USD"),
      von: DATUM.optional(),
      bis: DATUM.optional(),
      limit: z.number().int().min(1).max(100).optional().describe("Standard 20"),
    }),
    annotations: NUR_LESEN,
  }, async (a) => antwort(() => mcpTrades(a)));

  server.registerTool("backtest_lesen", {
    title: "Backtest lesen",
    description:
      "Backtest-Journal: Kennzahlen (Winrate, Profit-Factor, Expectancy, Gesamt-R) über die " +
      "gefilterten Trades, Anzahl Trades dieser Woche und die Trades mit Tags.",
    inputSchema: z.object({
      pair: z.string().optional(),
      von: DATUM.optional(),
      bis: DATUM.optional(),
      limit: z.number().int().min(1).max(200).optional().describe("Standard 30"),
    }),
    annotations: NUR_LESEN,
  }, async (a) => antwort(() => mcpBacktest(a)));

  server.registerTool("wirtschaftskalender", {
    title: "Wirtschaftskalender",
    description: "High-Impact-Termine von heute oder der laufenden Woche (Mo–So).",
    inputSchema: z.object({
      zeitraum: z.enum(["heute", "woche"]).optional().describe("Standard: heute"),
    }),
    annotations: NUR_LESEN,
  }, async ({ zeitraum }) => antwort(() => mcpWirtschaftskalender(zeitraum ?? "heute")));
}

/** Auth aus dem Tool-Kontext holen; ohne geprüftes Token wird nichts geschrieben. */
function auth(ctx: unknown): KerimosAuth {
  const a = (ctx as { http?: { authInfo?: KerimosAuth } } | undefined)?.http?.authInfo;
  if (!a?.token || !a.extra?.userId) throw new Error("Nicht angemeldet — Schreiben nur über die OAuth-Verbindung.");
  return a;
}

export function registriereSchreiben(server: McpServer) {
  server.registerTool("wochenziel_erstellen", {
    title: "Wochenziel erstellen",
    description:
      "Legt ein neues Wochenziel an (Status offen). Ohne Datum in der laufenden Woche. " +
      "Vorher mit Kerim absprechen, was genau das Ziel ist.",
    inputSchema: z.object({
      titel: z.string().min(1).max(300),
      details: z.string().max(5000).optional(),
      dringend: z.boolean().optional(),
      datum: DATUM.optional().describe("Irgendein Tag der Zielwoche. Leer = laufende Woche."),
    }),
    annotations: SCHREIBEN,
  }, async (e, ctx) => antwort(() => {
    const a = auth(ctx);
    return wochenzielErstellen(a.token, a.clientId, e);
  }));

  server.registerTool("wochenziel_aendern", {
    title: "Wochenziel ändern",
    description:
      "Ändert Titel, Details, Status (offen/angefangen/fertig), dringend oder die Lernnotiz " +
      "eines Wochenziels (id aus wochenziele_lesen). Lern-Ziele erst auf fertig setzen, " +
      "wenn eine Lernkontrolle mit Kerim bestanden ist, und das Ergebnis in `lernnotiz` festhalten.",
    inputSchema: z.object({
      id: z.string().uuid(),
      titel: z.string().max(300).optional(),
      details: z.string().max(5000).optional(),
      status: z.enum(["offen", "angefangen", "fertig"]).optional(),
      dringend: z.boolean().optional(),
      lernnotiz: z.string().max(5000).optional().describe("Ergebnis der Lernkontrolle, z.B. 'Quiz 4/5, Kernidee verstanden'."),
    }),
    annotations: SCHREIBEN,
  }, async (e, ctx) => antwort(() => {
    const a = auth(ctx);
    return wochenzielAendern(a.token, a.clientId, e);
  }));

  server.registerTool("routine_abhaken", {
    title: "Routine abhaken",
    description:
      "Setzt eine Routine-Handlung (id aus routinen_lesen) für einen Tag auf erledigt oder " +
      "nimmt den Haken wieder weg. Ohne Datum: heute. Nur abhaken, wenn Kerim es gesagt hat.",
    inputSchema: z.object({
      handlung_id: z.string().uuid(),
      erledigt: z.boolean().describe("true = abhaken, false = Haken entfernen"),
      datum: DATUM.optional(),
    }),
    annotations: SCHREIBEN,
  }, async (e, ctx) => antwort(() => {
    const a = auth(ctx);
    return routineSetzen(a.token, a.clientId, e);
  }));

  server.registerTool("essen_notiz_setzen", {
    title: "Essen-Notiz setzen",
    description:
      "Schreibt die Tagesnotiz im Essens-Kalender (ersetzt die bestehende). Leerer Text löscht sie.",
    inputSchema: z.object({
      datum: DATUM,
      text: z.string().max(10000),
    }),
    annotations: SCHREIBEN,
  }, async (e, ctx) => antwort(() => {
    const a = auth(ctx);
    return essenNotizSetzen(a.token, a.clientId, a.extra.userId, e);
  }));
}
