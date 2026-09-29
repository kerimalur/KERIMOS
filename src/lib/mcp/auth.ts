import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Token-Prüfung für den MCP-Server Stufe 2 (29.09.2026).
 *
 * Claude meldet sich über den OAuth-2.1-Server von Supabase an (Kompass-
 * Projekt) und schickt danach bei jedem Aufruf ein Access-Token als
 * `Authorization: Bearer …`. Das Token ist ein normales Supabase-JWT des
 * Benutzers, der auf /oauth/consent zugestimmt hat.
 *
 * Geprüft wird bei Supabase selbst (auth.getUser) — kein eigenes Parsen von
 * Signaturen. Zusätzlich muss der Benutzer KERIMOS_USER_ID sein: die
 * Trading-Lesezugriffe laufen mit dem Service-Key, und die sollen nie an ein
 * anderes Konto gehen, falls sich je jemand zweites in Kompass anmeldet.
 */

export const AUTH_SERVER = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/auth/v1`;

export interface KerimosAuth {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
  extra: { userId: string };
}

/** Nutzlast eines JWT ohne Prüfung lesen — nur für client_id/exp, die Echtheit prüft Supabase. */
function nutzlast(token: string): Record<string, unknown> {
  try {
    const teil = token.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(teil, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function pruefeToken(
  _req: Request, bearer?: string,
): Promise<KerimosAuth | undefined> {
  if (!bearer) return undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const erlaubt = process.env.KERIMOS_USER_ID?.trim();
  if (!url || !anon || !erlaubt) return undefined;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(bearer);
  if (error || !data.user || data.user.id !== erlaubt) return undefined;

  const p = nutzlast(bearer);
  const scope = typeof p.scope === "string" ? p.scope : "";
  return {
    token: bearer,
    clientId: typeof p.client_id === "string" ? p.client_id : "unbekannt",
    scopes: scope ? scope.split(" ").filter(Boolean) : [],
    expiresAt: typeof p.exp === "number" ? p.exp : undefined,
    extra: { userId: data.user.id },
  };
}

/**
 * Supabase-Client im Namen des angemeldeten Benutzers: RLS greift wie in der
 * App, `auth.uid()` ist Kerim. Für alle Schreibzugriffe auf Kompass.
 */
export function nutzerDb(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
