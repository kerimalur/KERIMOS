"use server";
import { revalidatePath } from "next/cache";
import { schalteErledigt } from "@/lib/supabase/tagesrueckblick-db";

/**
 * Eine Zeile aus „Heute das Wichtigste" abhaken — oder den Haken zurücknehmen.
 *
 * Das Datum kommt aus dem Formular und nicht aus `new Date()`: die Karte zeigt
 * den Rückblick von GESTERN, und wer hier heute rechnet, schreibt den Haken in
 * die falsche Zeile. Kurz nach Mitternacht wäre das sonst reproduzierbar
 * falsch.
 */
export async function hakeAb(fd: FormData) {
  const datum = String(fd.get("datum") ?? "").slice(0, 10);
  const zeile = String(fd.get("zeile") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !zeile) return;

  await schalteErledigt(datum, zeile);
  revalidatePath("/");
  revalidatePath("/rueckblick/heute");
}
