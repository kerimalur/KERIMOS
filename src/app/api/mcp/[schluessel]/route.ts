import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { mcpEssenNotizen, mcpRoutinen, mcpWochenziele } from "@/lib/mcp/kompass";
import {
  mcpBacktest, mcpGvaStatus, mcpRanking, mcpTrades, mcpWirtschaftskalender,
} from "@/lib/mcp/trading";
import { heuteISO } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * KerimOS als MCP-Server für Claude — Stufe 1: NUR LESEN (28.09.2026).
 *
 * URL für den Custom Connector in claude.ai:
 *     https://kerimos.vercel.app/api/mcp/<MCP_SECRET>
 *
 * Schutz: das Geheimnis steht im Pfad, nicht als ?secret= — Pfade reicht
 * jeder MCP-Client zuverlässig durch, Query-Parameter nicht garantiert.
 * Wer die URL kennt, kann LESEN. Deshalb gibt es in dieser Stufe bewusst
 * kein einziges schreibendes Werkzeug; Schreiben kommt erst mit OAuth.
 *
 * Die Route steht in der Middleware auf der Ausnahmeliste (`api/mcp`), weil
 * Claude ohne Login-Cookie anklopft — sonst endet jeder Aufruf mit 307 auf
 * /login.
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

const handler = createMcpHandler((server) => {
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
      "Live-Board des GVA-Screeners (nur HIT/PREPARE, sortiert nach Dringlichkeit, " +
      "mit Fundamental-Check gegen das Wochen-Ranking), offene GVA-Hits ohne Entscheidung " +
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

  server.registerTool("waehrungs_ranking", {
    title: "Währungs-Ranking",
    description:
      "Fundamentales Wochen-Ranking der 8 Hauptwährungen (Champion-Modell): Score, " +
      "Stärke-Quintil und die drei stärksten Treiber je Währung.",
    annotations: NUR_LESEN,
  }, async () => antwort(() => mcpRanking()));
}, {
  serverInfo: { name: "kerimos", version: "1.0.0" },
  instructions:
    "KerimOS ist Kerims persönliche App: Trading (GVA-Screener, Journal, Backtests), " +
    "Wochenziele, Routinen und Essen. Alle Zeiten der App in Europe/Zurich. " +
    "Dieser Server ist aktuell nur lesend.",
});

/** Konstantzeit-Vergleich, damit die Antwortzeit das Geheimnis nicht verrät. */
function schluesselPasst(eingabe: string): boolean {
  const soll = process.env.MCP_SECRET?.trim();
  if (!soll || soll.length < 24) return false; // ohne starkes Geheimnis: zu
  const a = Buffer.from(eingabe);
  const b = Buffer.from(soll);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Kontext = { params: Promise<{ schluessel: string }> };

async function route(request: Request, { params }: Kontext) {
  const { schluessel } = await params;
  if (!schluesselPasst(decodeURIComponent(schluessel))) {
    return new Response("Not found", { status: 404 });
  }
  return handler(request);
}

export { route as GET, route as POST, route as DELETE };
