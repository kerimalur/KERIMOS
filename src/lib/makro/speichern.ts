import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Beobachtung } from "./perioden";

/**
 * Eine Reihe in `makro_reihen` ablegen — für den Cron-Lauf UND das
 * Nachladen aus dem Browser.
 *
 * Regel „die frischere Quelle gewinnt", auch über Läufe hinweg: liegt schon
 * eine ANDERE Quelle mit neuerem Wert in der Tabelle (z.B. der OECD-CLI von
 * August, im Browser geholt), überschreibt der Server-Lauf sie nicht mit
 * seiner FRED-Reihe von 2024. Wechselt die Quelle zu Recht, fliegen die
 * Zeilen der alten raus — sonst stünde ein Vorwert aus einer anderen Reihe
 * neben dem Stand, und der Trendpfeil vergliche Äpfel mit Birnen.
 */

export function makroDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function speichereReihe(db: SupabaseClient, r: {
  ccy: string; feld: string; serie: string; werte: Beobachtung[];
}): Promise<string> {
  if (r.werte.length === 0) return "fehlt (keine Werte)";
  const letzte = r.werte[r.werte.length - 1];

  const { data: bisher } = await db.from("makro_reihen").select("serie, datum")
    .eq("ccy", r.ccy).eq("feld", r.feld).order("datum", { ascending: false }).limit(1);
  const alt = (bisher?.[0] ?? null) as { serie: string; datum: string } | null;

  if (alt && alt.serie !== r.serie && alt.datum > letzte.datum) {
    return `behalten: ${alt.serie} ist neuer (${alt.datum})`;
  }

  await db.from("makro_reihen").delete().eq("ccy", r.ccy).eq("feld", r.feld).neq("serie", r.serie);
  const { error } = await db.from("makro_reihen").upsert(
    r.werte.map((w) => ({
      ccy: r.ccy, feld: r.feld, datum: w.datum, wert: w.wert,
      serie: r.serie, geholt_am: new Date().toISOString(),
    })),
    { onConflict: "ccy,feld,datum" });

  return error ? `fehlt (Schreiben: ${error.message})`
    : `${r.serie} · ${r.werte.length} Werte · zuletzt ${letzte.wert} am ${letzte.datum}`;
}

/** Die jüngste Zeile einer Reihe, falls es schon eine gibt. */
export async function bestehendeReihe(db: SupabaseClient, ccy: string, feld: string) {
  const { data } = await db.from("makro_reihen").select("serie, datum")
    .eq("ccy", ccy).eq("feld", feld).order("datum", { ascending: false }).limit(1);
  return (data?.[0] ?? null) as { serie: string; datum: string } | null;
}

/** Einzelne Einträge im Bericht des letzten Laufs ersetzen, ohne den Rest anzufassen. */
export async function berichtErgaenzen(db: SupabaseClient, eintraege: Record<string, string>) {
  const { data } = await db.from("makro_sync").select("gelaufen, bericht").eq("id", 1).maybeSingle();
  const bericht = { ...((data?.bericht as Record<string, string> | null) ?? {}), ...eintraege };
  await db.from("makro_sync").upsert({
    id: 1, gelaufen: (data?.gelaufen as string | null) ?? new Date().toISOString(), bericht,
  });
}
