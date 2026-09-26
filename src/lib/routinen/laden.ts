import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Handlung, RoutineZiel } from "./typen";

export function handlungAus(r: Record<string, unknown>): Handlung {
  return {
    id: String(r.id),
    ziel_id: String(r.ziel_id),
    titel: String(r.titel ?? ""),
    tage: ((r.tage as number[] | null) ?? []).map(Number),
    uhrzeit: r.uhrzeit ? String(r.uhrzeit).slice(0, 5) : null,
    zuletzt_erinnert: (r.zuletzt_erinnert as string | null) ?? null,
    reihenfolge: Number(r.reihenfolge ?? 0),
  };
}

/** Alle Ziele mit ihren Handlungen, in der angelegten Reihenfolge. */
export async function ladeRoutinen(): Promise<RoutineZiel[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const [z, h] = await Promise.all([
    supabase.from("routine_ziele").select("id, titel, notiz, reihenfolge")
      .order("reihenfolge").order("erstellt"),
    supabase.from("routine_handlungen")
      .select("id, ziel_id, titel, tage, uhrzeit, zuletzt_erinnert, reihenfolge")
      .order("reihenfolge").order("erstellt"),
  ]);

  const handlungen = ((h.data ?? []) as Record<string, unknown>[]).map(handlungAus);
  return ((z.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    titel: String(r.titel ?? ""),
    notiz: String(r.notiz ?? ""),
    reihenfolge: Number(r.reihenfolge ?? 0),
    handlungen: handlungen.filter((x) => x.ziel_id === String(r.id)),
  }));
}
