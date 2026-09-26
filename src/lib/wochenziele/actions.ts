"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ZielStatus } from "./typen";

/** Schreibzugriffe der Wochenziele. Jede Aktion frischt Tab und Startseite auf. */

const STATI: ZielStatus[] = ["offen", "angefangen", "fertig"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Nicht angemeldet.");
  return supabase;
}

function neuLaden() {
  revalidatePath("/wochenziele");
  revalidatePath("/");
}

export async function zielAnlegen(eingabe: {
  woche: string; titel: string; details: string; status?: ZielStatus;
}): Promise<string | null> {
  const titel = eingabe.titel.trim().slice(0, 300);
  if (!titel) return "Titel fehlt.";
  if (!ISO.test(eingabe.woche)) return "Ungültige Woche.";
  const supabase = await zugang();

  // Neue Ziele hinten anhängen.
  const { data: letzte } = await supabase.from("wochenziele").select("reihenfolge")
    .eq("woche", eingabe.woche).order("reihenfolge", { ascending: false }).limit(1);
  const reihenfolge = Number((letzte?.[0] as { reihenfolge?: number } | undefined)?.reihenfolge ?? 0) + 1;

  const { error } = await supabase.from("wochenziele").insert({
    woche: eingabe.woche,
    titel,
    details: eingabe.details.trim().slice(0, 5000),
    status: STATI.includes(eingabe.status ?? "offen") ? eingabe.status ?? "offen" : "offen",
    reihenfolge,
  });
  neuLaden();
  return error ? error.message : null;
}

export async function zielAendern(id: string, felder: {
  titel?: string; details?: string; status?: ZielStatus; dringend?: boolean;
}): Promise<string | null> {
  const supabase = await zugang();
  const patch: Record<string, unknown> = { aktualisiert: new Date().toISOString() };
  if (felder.titel !== undefined) {
    const t = felder.titel.trim().slice(0, 300);
    if (!t) return "Titel darf nicht leer sein.";
    patch.titel = t;
  }
  if (felder.details !== undefined) patch.details = felder.details.trim().slice(0, 5000);
  if (felder.status !== undefined && STATI.includes(felder.status)) patch.status = felder.status;
  if (felder.dringend !== undefined) patch.dringend = felder.dringend;

  const { error } = await supabase.from("wochenziele").update(patch).eq("id", id);
  neuLaden();
  return error ? error.message : null;
}

export async function zielLoeschen(id: string): Promise<string | null> {
  const supabase = await zugang();
  const { error } = await supabase.from("wochenziele").delete().eq("id", id);
  neuLaden();
  return error ? error.message : null;
}
