"use server";
import { revalidatePath } from "next/cache";
import { speichereBonus, loescheBonus } from "@/lib/supabase/essen-bonus-db";
import { heuteISO } from "@/lib/time";
import type { Aktivitaet } from "@/lib/essen-bonus";

/**
 * Aktivität eintragen und wieder entfernen.
 *
 * Eigene Datei statt `actions.ts`: die ist mit über hundert Aktionen ohnehin
 * zu gross, und jede `"use server"`-Datei wird als Ganzes geladen, sobald
 * eine ihrer Aktionen gebraucht wird.
 */

const ARTEN: Aktivitaet[] = ["lauf", "gym", "sonstiges"];

export async function aktivitaetEintragen(fd: FormData): Promise<void> {
  const datumRoh = String(fd.get("datum") ?? "").slice(0, 10);
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(datumRoh) ? datumRoh : heuteISO();

  const artRoh = String(fd.get("art") ?? "").toLowerCase();
  const art: Aktivitaet = (ARTEN as string[]).includes(artRoh)
    ? (artRoh as Aktivitaet) : "sonstiges";

  // Leeres Feld heisst „nicht eingetragen" (dann greift die Pauschale), eine
  // getippte 0 heisst „nichts verbrannt". Number("") waere 0 und wuerde die
  // beiden Faelle stillschweigend zusammenwerfen.
  const roh = String(fd.get("verbrannt") ?? "").trim();
  const verbrannt = roh === "" ? null
    : Number.isFinite(Number(roh)) ? Math.max(0, Math.round(Number(roh))) : null;

  const notiz = String(fd.get("notiz") ?? "").trim() || null;

  await speichereBonus(datum, art, verbrannt, notiz);
  revalidatePath("/m/Essen");
  revalidatePath("/m/Essen/plan");
}

export async function aktivitaetEntfernen(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await loescheBonus(id);
  revalidatePath("/m/Essen");
  revalidatePath("/m/Essen/plan");
}
