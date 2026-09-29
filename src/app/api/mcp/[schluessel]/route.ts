import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { ANWEISUNGEN, registriereLesen } from "@/lib/mcp/werkzeuge";

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

const handler = createMcpHandler((server) => {
  registriereLesen(server);
}, {
  serverInfo: { name: "kerimos", version: "1.1.0" },
  instructions: ANWEISUNGEN + " Diese Verbindung (Geheimnis im Pfad) ist nur lesend; " +
    "Schreiben geht über https://kerimos.vercel.app/api/mcp mit Anmeldung.",
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
