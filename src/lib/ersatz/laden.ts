import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Ersatz } from "./typen";

/** Alle Ersatz-Pläne mit ihren Erfolgen. */
export async function ladeErsatz(): Promise<Ersatz[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const [p, l] = await Promise.all([
    supabase.from("gewohnheit_ersatz")
      .select("id, gewohnheit, ausloeser, bedeutung, ersatz, aktiv, erstellt")
      .order("aktiv", { ascending: false }).order("reihenfolge").order("erstellt"),
    supabase.from("gewohnheit_ersetzt").select("ersatz_id, datum").limit(5000),
  ]);
  const log = (l.data ?? []) as { ersatz_id: string; datum: string }[];

  return ((p.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    gewohnheit: String(r.gewohnheit ?? ""),
    ausloeser: String(r.ausloeser ?? ""),
    bedeutung: String(r.bedeutung ?? ""),
    ersatz: String(r.ersatz ?? ""),
    aktiv: Boolean(r.aktiv),
    erstellt: String(r.erstellt ?? ""),
    erfolge: log.filter((x) => x.ersatz_id === String(r.id)).map((x) => String(x.datum).slice(0, 10)),
  }));
}
