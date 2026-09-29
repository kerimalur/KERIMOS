import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { ANWEISUNGEN, registriereLesen, registriereSchreiben } from "@/lib/mcp/werkzeuge";
import { pruefeToken } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * KerimOS als MCP-Server — Stufe 2: LESEN + SCHREIBEN mit Anmeldung (29.09.2026).
 *
 * URL für den Custom Connector in claude.ai (Anmeldung: „Jetzt anmelden"):
 *     https://kerimos.vercel.app/api/mcp
 *
 * Ablauf: claude.ai ruft ohne Token an → 401 mit Verweis auf
 * /.well-known/oauth-protected-resource/api/mcp → dort steht der Supabase-
 * OAuth-Server des Kompass-Projekts → Kerim meldet sich an und stimmt auf
 * /oauth/consent zu → claude.ai schickt ab dann ein Bearer-Token.
 *
 * Nur KERIMOS_USER_ID wird zugelassen (siehe lib/mcp/auth.ts). Schreiben
 * läuft mit dem Token des Benutzers, also unter RLS, und wird in mcp_log
 * protokolliert.
 */

const handler = createMcpHandler((server) => {
  registriereLesen(server);
  registriereSchreiben(server);
}, {
  serverInfo: { name: "kerimos", version: "2.0.0" },
  instructions: ANWEISUNGEN +
    " Schreiben (Wochenziele, Routinen, Essen-Notiz) nur, wenn Kerim es ausdrücklich will." +
    " Löschen und Trading-Journal sind nicht schreibbar.",
});

const mitAnmeldung = withMcpAuth(handler, pruefeToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { mitAnmeldung as GET, mitAnmeldung as POST, mitAnmeldung as DELETE };
