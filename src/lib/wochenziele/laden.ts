import "server-only";
import { createClient } from "@/lib/supabase/server";
import { heuteISO, weekStart } from "@/lib/time";
import { sortiere, type Wochenziel, type ZielStatus } from "./typen";

/**
 * Wochenziele lesen — und dabei die Übernahme erledigen.
 *
 * Kerims Regel: was am Montag nicht fertig ist, wandert automatisch in die
 * neue Woche und wird als dringend markiert. Es gibt keinen Cron dafür: die
 * Übernahme passiert beim ersten Laden der laufenden Woche, sei es auf der
 * Startseite oder im Tab. Sie ist idempotent — ein zweiter Aufruf findet
 * nichts mehr, weil die Ziele dann schon in der neuen Woche stehen.
 *
 * Verschoben, nicht kopiert: ein Ziel ist EIN Ziel. `seit` merkt sich die
 * Woche, in der es ursprünglich stand, damit man sieht, wie lange es schon
 * mitgeschleppt wird.
 */

const SPALTEN = "id, woche, titel, details, status, dringend, seit, reihenfolge, erstellt";

export const aktuelleWoche = () => weekStart(heuteISO());

async function uebernehmeOffene(woche: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("wochenziele")
    .select("id, woche, seit").lt("woche", woche).neq("status", "fertig");
  const alt = (data ?? []) as { id: string; woche: string; seit: string | null }[];
  await Promise.all(alt.map((z) =>
    supabase.from("wochenziele").update({
      woche, dringend: true, seit: z.seit ?? z.woche, aktualisiert: new Date().toISOString(),
    }).eq("id", z.id)));
}

export async function ladeWochenziele(woche: string): Promise<Wochenziel[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  if (woche === aktuelleWoche()) await uebernehmeOffene(woche);

  const { data } = await supabase.from("wochenziele").select(SPALTEN).eq("woche", woche);
  return sortiere(((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    woche: String(r.woche),
    titel: String(r.titel ?? ""),
    details: String(r.details ?? ""),
    status: (r.status as ZielStatus) ?? "offen",
    dringend: Boolean(r.dringend),
    seit: (r.seit as string | null) ?? null,
    reihenfolge: Number(r.reihenfolge ?? 0),
    erstellt: String(r.erstellt ?? ""),
  })));
}
