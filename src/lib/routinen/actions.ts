"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Schreibzugriffe der Routinen. Jede Aktion frischt Tab und Startseite auf. */

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Nicht angemeldet.");
  return supabase;
}

function neuLaden() {
  revalidatePath("/routinen");
  revalidatePath("/");
}

const text = (t: string, max: number) => t.trim().slice(0, max);
const tageSauber = (t: number[]) =>
  [...new Set(t.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
const zeitSauber = (u: string | null) => (u && /^\d{2}:\d{2}$/.test(u) ? u : null);

async function naechsteReihenfolge(tabelle: string, filter?: [string, string]) {
  const supabase = await zugang();
  let q = supabase.from(tabelle).select("reihenfolge").order("reihenfolge", { ascending: false }).limit(1);
  if (filter) q = q.eq(filter[0], filter[1]);
  const { data } = await q;
  return Number((data?.[0] as { reihenfolge?: number } | undefined)?.reihenfolge ?? 0) + 1;
}

export async function routineZielAnlegen(titel: string): Promise<string | null> {
  const t = text(titel, 200);
  if (!t) return "Titel fehlt.";
  const supabase = await zugang();
  const { error } = await supabase.from("routine_ziele")
    .insert({ titel: t, reihenfolge: await naechsteReihenfolge("routine_ziele") });
  neuLaden();
  return error ? error.message : null;
}

export async function routineZielAendern(id: string, felder: { titel?: string; notiz?: string }) {
  const supabase = await zugang();
  const patch: Record<string, string> = {};
  if (felder.titel !== undefined) {
    const t = text(felder.titel, 200);
    if (!t) return "Titel darf nicht leer sein.";
    patch.titel = t;
  }
  if (felder.notiz !== undefined) patch.notiz = text(felder.notiz, 2000);
  const { error } = await supabase.from("routine_ziele").update(patch).eq("id", id);
  neuLaden();
  return error ? error.message : null;
}

export async function routineZielLoeschen(id: string): Promise<string | null> {
  const supabase = await zugang();
  // Die Handlungen gehen per ON DELETE CASCADE mit.
  const { error } = await supabase.from("routine_ziele").delete().eq("id", id);
  neuLaden();
  return error ? error.message : null;
}

export async function handlungAnlegen(zielId: string, titel: string): Promise<string | null> {
  const t = text(titel, 200);
  if (!t) return "Titel fehlt.";
  const supabase = await zugang();
  const { error } = await supabase.from("routine_handlungen").insert({
    ziel_id: zielId, titel: t,
    reihenfolge: await naechsteReihenfolge("routine_handlungen", ["ziel_id", zielId]),
  });
  neuLaden();
  return error ? error.message : null;
}

export async function handlungAendern(id: string, felder: {
  titel?: string; tage?: number[]; uhrzeit?: string | null;
}): Promise<string | null> {
  const supabase = await zugang();
  const patch: Record<string, unknown> = {};
  if (felder.titel !== undefined) {
    const t = text(felder.titel, 200);
    if (!t) return "Titel darf nicht leer sein.";
    patch.titel = t;
  }
  if (felder.tage !== undefined) patch.tage = tageSauber(felder.tage);
  if (felder.uhrzeit !== undefined) {
    patch.uhrzeit = zeitSauber(felder.uhrzeit);
    // Neue Zeit heisst: heute darf nochmal erinnert werden.
    patch.zuletzt_erinnert = null;
  }
  const { error } = await supabase.from("routine_handlungen").update(patch).eq("id", id);
  neuLaden();
  return error ? error.message : null;
}

export async function handlungLoeschen(id: string): Promise<string | null> {
  const supabase = await zugang();
  const { error } = await supabase.from("routine_handlungen").delete().eq("id", id);
  neuLaden();
  return error ? error.message : null;
}
