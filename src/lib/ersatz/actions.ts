"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { heuteISO } from "@/lib/time";

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Nicht angemeldet.");
  return supabase;
}
const neuLaden = () => { revalidatePath("/routinen"); revalidatePath("/"); };
const t = (s: string | undefined, max: number) => (s ?? "").trim().slice(0, max);

export async function ersatzAnlegen(e: {
  gewohnheit: string; ausloeser: string; bedeutung: string; ersatz: string;
}): Promise<string | null> {
  if (!t(e.gewohnheit, 200) || !t(e.ersatz, 300)) return "Gewohnheit und Ersatz braucht es mindestens.";
  const supabase = await zugang();
  const { error } = await supabase.from("gewohnheit_ersatz").insert({
    gewohnheit: t(e.gewohnheit, 200), ausloeser: t(e.ausloeser, 300),
    bedeutung: t(e.bedeutung, 300), ersatz: t(e.ersatz, 300),
  });
  neuLaden();
  return error ? error.message : null;
}

export async function ersatzAendern(id: string, e: Partial<{
  gewohnheit: string; ausloeser: string; bedeutung: string; ersatz: string; aktiv: boolean;
}>): Promise<string | null> {
  const supabase = await zugang();
  const patch: Record<string, unknown> = {};
  if (e.gewohnheit !== undefined) patch.gewohnheit = t(e.gewohnheit, 200);
  if (e.ausloeser !== undefined) patch.ausloeser = t(e.ausloeser, 300);
  if (e.bedeutung !== undefined) patch.bedeutung = t(e.bedeutung, 300);
  if (e.ersatz !== undefined) patch.ersatz = t(e.ersatz, 300);
  if (e.aktiv !== undefined) patch.aktiv = e.aktiv;
  if (patch.gewohnheit === "" || patch.ersatz === "") return "Darf nicht leer sein.";
  const { error } = await supabase.from("gewohnheit_ersatz").update(patch).eq("id", id);
  neuLaden();
  return error ? error.message : null;
}

export async function ersatzLoeschen(id: string): Promise<string | null> {
  const supabase = await zugang();
  const { error } = await supabase.from("gewohnheit_ersatz").delete().eq("id", id);
  neuLaden();
  return error ? error.message : null;
}

/** „Hat geklappt" — ein Erfolg für heute. Mehrmals am Tag ist erlaubt. */
export async function ersetztGezaehlt(id: string): Promise<string | null> {
  const supabase = await zugang();
  const { error } = await supabase.from("gewohnheit_ersetzt").insert({ ersatz_id: id, datum: heuteISO() });
  neuLaden();
  return error ? error.message : null;
}

/** Den letzten Erfolg von heute zurücknehmen — für den Fehlklick. */
export async function ersetztZuruecknehmen(id: string): Promise<string | null> {
  const supabase = await zugang();
  const { data } = await supabase.from("gewohnheit_ersetzt").select("id")
    .eq("ersatz_id", id).eq("datum", heuteISO()).order("erstellt", { ascending: false }).limit(1);
  const letzte = (data?.[0] as { id: string } | undefined)?.id;
  if (!letzte) return null;
  const { error } = await supabase.from("gewohnheit_ersetzt").delete().eq("id", letzte);
  neuLaden();
  return error ? error.message : null;
}
