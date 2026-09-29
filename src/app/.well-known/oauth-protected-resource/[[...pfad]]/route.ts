import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { AUTH_SERVER } from "@/lib/mcp/auth";

/**
 * RFC 9728 — sagt MCP-Clients, bei welchem Auth-Server sie sich für
 * /api/mcp anmelden müssen: dem OAuth-2.1-Server des Kompass-Projekts.
 * Erreichbar unter /.well-known/oauth-protected-resource und
 * /.well-known/oauth-protected-resource/api/mcp (29.09.2026).
 */

const antwort = protectedResourceHandler({
  authServerUrls: [AUTH_SERVER],
  resourceUrl: "https://kerimos.vercel.app/api/mcp",
});

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return antwort(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
