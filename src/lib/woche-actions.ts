"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createGymClient, gymUserId } from "@/lib/supabase/gym";
import { addDays, heuteISO, weekStart as toWeekStart } from "@/lib/time";
import {
  istHabitArt, istIsoDatum, istVorhabenStatus, MAX_AKTIV,
} from "@/lib/woche-typen";

/**
 * Server Actions für den Bereich „Woche".
 *
 * Alles hier ist ein Tipp: eintragen, zurücknehmen, fertig. Wo etwas
 * schiefgeht, landet die Meldung als `?fehler=` auf der Seite — eine
 * geworfene Ausnahme sagt im Betrieb nur „Da ist etwas schiefgegangen".
 */

/** Wie weit zurück nachgetragen werden darf. Weiter wäre ein Vertipper. */
const NACHTRAG_TAGE = 14;

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht angemeldet.");
  return { supabase, userId };
}

/** Datum aus dem Formular — Unklares fällt auf heute zurück. */
function erlaubtesDatum(roh: string): string {
  const heute = heuteISO();
  if (!istIsoDatum(roh)) return heute;
  if (roh > heute) return heute;
  if (roh < addDays(heute, -NACHTRAG_TAGE)) return heute;
  return roh;
}

/** Zurück auf die Woche, in der das Datum liegt — dort wurde geklickt. */
function zurueck(datum: string | null, fehler?: string): never {
  const heute = heuteISO();
  const woche = datum ? toWeekStart(datum) : toWeekStart(heute);
  const param = new URLSearchParams();
  if (woche !== toWeekStart(heute)) param.set("w", woche);
  if (fehler) param.set("fehler", fehler);
  const q = param.toString();
  redirect(q ? `/woche?${q}` : "/woche");
}

function neuLaden() {
  revalidatePath("/woche");
  revalidatePath("/");
}

/* ------------------------------------------------------------ Gewohnheiten */

export async function habitEintragen(fd: FormData) {
  const art = txt(fd, "art");
  if (!istHabitArt(art)) return;
  const datum = erlaubtesDatum(txt(fd, "datum"));

  const { supabase, userId } = await zugang();
  const { error } = await supabase.from("habit_log")
    .insert({ user_id: userId, datum, art });

  neuLaden();
  if (error) zurueck(datum, `Eintragen: ${error.message}`);
  zurueck(datum);
}

export async function habitLoeschen(fd: FormData) {
  const id = txt(fd, "id");
  const datum = txt(fd, "datum") || null;
  if (!id) return;

  const { supabase, userId } = await zugang();
  await supabase.from("habit_log").delete().eq("id", id).eq("user_id", userId);

  neuLaden();
  zurueck(datum);
}

/* ------------------------------------------------------------------ Essen */

/**
 * Plan eingehalten oder nicht. Ein Tag hat genau einen Eintrag — erneut
 * setzen überschreibt. Bei „nein" gehört das Problem dazu, sonst lernt man
 * aus der Zeile nichts; es ist aber kein Pflichtfeld, weil ein Knopf, der
 * nicht reagiert, abends nicht gedrückt wird.
 */
export async function essenSetzen(fd: FormData) {
  const datum = erlaubtesDatum(txt(fd, "datum"));
  const eingehalten = txt(fd, "eingehalten") === "1";
  const problem = eingehalten ? null : (txt(fd, "problem") || null);

  const { supabase, userId } = await zugang();
  const { error } = await supabase.from("essen_check").upsert({
    user_id: userId, datum, eingehalten, problem,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,datum" });

  neuLaden();
  if (error) zurueck(datum, `Essen speichern: ${error.message}`);
  zurueck(datum);
}

export async function essenLoeschen(fd: FormData) {
  const datum = txt(fd, "datum");
  if (!istIsoDatum(datum)) return;

  const { supabase, userId } = await zugang();
  await supabase.from("essen_check").delete()
    .eq("user_id", userId).eq("datum", datum);

  neuLaden();
  zurueck(datum);
}

/* ---------------------------------------------------------------- Gewicht */

/**
 * Gewicht in die Gym-Datenbank — dort liegt der ganze bisherige Verlauf,
 * und Claude trägt Werte aus dem Chat ebenfalls dort ein.
 */
export async function gewichtEintragen(fd: FormData) {
  const kg = Number(txt(fd, "kg").replace(",", "."));
  const datum = erlaubtesDatum(txt(fd, "datum"));
  if (!Number.isFinite(kg) || kg < 30 || kg > 250) {
    zurueck(datum, "Gewicht: bitte eine Zahl zwischen 30 und 250 kg.");
  }

  await zugang();
  const gym = createGymClient();
  if (!gym) zurueck(datum, "Gewicht: Gym-Datenbank ist nicht verbunden.");
  const besitzer = await gymUserId(gym);
  if (!besitzer) zurueck(datum, "Gewicht: GYM_USER_ID fehlt.");

  const { error } = await gym.from("body_weight_entries").insert({
    entry_date: datum, weight_kg: kg, source: "kerimos", user_id: besitzer,
  });

  neuLaden();
  if (error) zurueck(datum, `Gewicht speichern: ${error.message}`);
  zurueck(datum);
}

/* --------------------------------------------------------------- Vorhaben */

async function anzahlAktiv(
  supabase: Awaited<ReturnType<typeof createClient>>, ohneId?: string,
) {
  let q = supabase.from("vorhaben").select("id", { count: "exact", head: true })
    .eq("status", "aktiv");
  if (ohneId) q = q.neq("id", ohneId);
  const { count } = await q;
  return count ?? 0;
}

export async function vorhabenAnlegen(fd: FormData) {
  const titel = txt(fd, "titel");
  const schritt = txt(fd, "naechster_schritt") || null;
  let status = txt(fd, "status");
  if (!titel) return;
  if (!istVorhabenStatus(status) || status === "erledigt") status = "idee";

  const { supabase, userId } = await zugang();

  // Ist schon alles voll, landet das Neue bei den Ideen statt abgelehnt zu
  // werden — verloren geht nichts, aber es drängelt sich auch nicht vor.
  let hinweis: string | undefined;
  if (status === "aktiv" && (await anzahlAktiv(supabase)) >= MAX_AKTIV) {
    status = "idee";
    hinweis = `Schon ${MAX_AKTIV} aktive Vorhaben — „${titel}" steht bei den Ideen.`;
  }

  const { data: letzte } = await supabase.from("vorhaben").select("sort_order")
    .order("sort_order", { ascending: false }).limit(1);
  const naechste = Number(
    ((letzte ?? []) as { sort_order: number }[])[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("vorhaben").insert({
    user_id: userId, titel, naechster_schritt: schritt, status, sort_order: naechste,
  });

  neuLaden();
  if (error) zurueck(null, `Vorhaben anlegen: ${error.message}`);
  zurueck(null, hinweis);
}

export async function vorhabenStatus(fd: FormData) {
  const id = txt(fd, "id");
  const status = txt(fd, "status");
  if (!id || !istVorhabenStatus(status)) return;

  const { supabase, userId } = await zugang();

  if (status === "aktiv" && (await anzahlAktiv(supabase, id)) >= MAX_AKTIV) {
    zurueck(null,
      `Schon ${MAX_AKTIV} aktive Vorhaben. Erst eins abschliessen oder zurückstellen.`);
  }

  await supabase.from("vorhaben").update({
    status,
    erledigt_am: status === "erledigt" ? new Date().toISOString() : null,
  }).eq("id", id).eq("user_id", userId);

  neuLaden();
  zurueck(null);
}

export async function vorhabenSchritt(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;
  const schritt = txt(fd, "naechster_schritt") || null;

  const { supabase, userId } = await zugang();
  await supabase.from("vorhaben").update({ naechster_schritt: schritt })
    .eq("id", id).eq("user_id", userId);

  neuLaden();
  zurueck(null);
}

export async function vorhabenLoeschen(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;

  const { supabase, userId } = await zugang();
  await supabase.from("vorhaben").delete().eq("id", id).eq("user_id", userId);

  neuLaden();
  zurueck(null);
}
