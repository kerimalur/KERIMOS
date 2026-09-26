import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Handlung, RoutineZiel } from "./typen";
import { addDays, heuteISO, weekStart } from "@/lib/time";

export function handlungAus(r: Record<string, unknown>): Handlung {
  return {
    id: String(r.id),
    ziel_id: String(r.ziel_id),
    titel: String(r.titel ?? ""),
    tage: ((r.tage as number[] | null) ?? []).map(Number),
    uhrzeit: r.uhrzeit ? String(r.uhrzeit).slice(0, 5) : null,
    zuletzt_erinnert: (r.zuletzt_erinnert as string | null) ?? null,
    reihenfolge: Number(r.reihenfolge ?? 0),
    pro_woche: r.pro_woche === null || r.pro_woche === undefined ? null : Number(r.pro_woche),
    erledigt: [],
  };
}

/** Die Spalten, die jede Abfrage der Handlungen braucht. */
export const HANDLUNG_SPALTEN = "id, ziel_id, titel, tage, uhrzeit, zuletzt_erinnert, reihenfolge, pro_woche";

/** Abgehakte Tage der laufenden Woche an die Handlungen hängen. */
export function erledigtAnhaengen(handlungen: Handlung[], zeilen: { handlung_id: string; datum: string }[]) {
  for (const h of handlungen) {
    h.erledigt = zeilen.filter((z) => z.handlung_id === h.id).map((z) => String(z.datum).slice(0, 10));
  }
  return handlungen;
}

/** Alle Ziele mit ihren Handlungen, in der angelegten Reihenfolge. */
export async function ladeRoutinen(): Promise<RoutineZiel[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const montag = weekStart(heuteISO());
  const [z, h, e] = await Promise.all([
    supabase.from("routine_ziele").select("id, titel, notiz, reihenfolge")
      .order("reihenfolge").order("erstellt"),
    supabase.from("routine_handlungen").select(HANDLUNG_SPALTEN)
      .order("reihenfolge").order("erstellt"),
    supabase.from("routine_erledigt").select("handlung_id, datum")
      .gte("datum", montag).lte("datum", addDays(montag, 6)),
  ]);

  const handlungen = erledigtAnhaengen(
    ((h.data ?? []) as Record<string, unknown>[]).map(handlungAus),
    (e.data ?? []) as { handlung_id: string; datum: string }[]);
  return ((z.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    titel: String(r.titel ?? ""),
    notiz: String(r.notiz ?? ""),
    reihenfolge: Number(r.reihenfolge ?? 0),
    handlungen: handlungen.filter((x) => x.ziel_id === String(r.id)),
  }));
}
