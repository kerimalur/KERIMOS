"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Ordnet eine ganze Gruppe von Buchungen derselben Kategorie zu.
 *
 * Die IDs kommen als kommagetrennte Liste aus dem Formular - so bleibt es
 * ein einfaches Server-Action-Formular ohne Client-State.
 */
export async function categorizeGroup(fd: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const categoryId = String(fd.get("categoryId") ?? "").trim();
  const ids = String(fd.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!categoryId || ids.length === 0) return;

  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) throw new Error(`Zuordnen: ${error.message}`);

  revalidatePath("/geld/offen");
  revalidatePath("/geld");
}

/**
 * Markiert eine Gruppe als Umbuchung statt als Ausgabe.
 *
 * Überweisungen zwischen eigenen Konten sind keine Ausgaben - tauchen sie in
 * der Auswertung auf, verdoppeln sie jeden Betrag.
 */
export async function markAsTransfer(fd: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const ids = String(fd.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("transactions")
    .update({ is_transfer: true, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) throw new Error(`Als Umbuchung markieren: ${error.message}`);

  revalidatePath("/geld/offen");
  revalidatePath("/geld");
}
