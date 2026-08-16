"use server";
import { revalidatePath } from "next/cache";
import { ausFormular } from "@/lib/tagesrueckblick";
import { speichereRueckblick, loescheRueckblick } from "@/lib/supabase/tagesrueckblick-db";
import { heuteISO } from "@/lib/time";

/**
 * Tagesrückblick speichern und löschen.
 *
 * Eigene Datei statt `actions.ts`: jede `"use server"`-Datei wird als Ganzes
 * geladen, sobald eine ihrer Aktionen gebraucht wird — und `actions.ts` ist
 * mit über hundert Aktionen der grösste Brocken im Projekt.
 */

function datumAus(fd: FormData): string {
  const roh = String(fd.get("datum") ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(roh) ? roh : heuteISO();
}

export async function rueckblickSpeichern(fd: FormData): Promise<void> {
  const datum = datumAus(fd);
  const werte = ausFormular((name) => {
    const v = fd.get(name);
    return typeof v === "string" ? v : null;
  });

  await speichereRueckblick(datum, werte);
  revalidatePath("/rueckblick/heute");
  revalidatePath("/");
}

export async function rueckblickLoeschen(fd: FormData): Promise<void> {
  await loescheRueckblick(datumAus(fd));
  revalidatePath("/rueckblick/heute");
  revalidatePath("/");
}
