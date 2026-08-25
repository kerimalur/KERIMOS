"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { zuZielen } from "@/lib/wochenrueckblick";

/**
 * Wochenrückblick speichern — Rückblick und Ziele in einem Schritt.
 *
 * Vorher waren das zwei Formulare: der Rückblick oben, die Wochenziele in
 * einer eigenen Karte darüber. Getrennt sah es ordentlich aus, in der Praxis
 * hiess es, dass man zurückblicken konnte, ohne sich etwas vorzunehmen — und
 * ein Rückblick ohne Vorsatz ist Buchhaltung.
 *
 * Deshalb ist die letzte Frage des Rückblicks „Was nimmst du dir für nächste
 * Woche vor?", und was dort steht, WIRD zu den Wochenzielen. Eine Zeile, ein
 * Ziel.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht angemeldet.");
  return { supabase, userId };
}

function neuLaden() {
  revalidatePath("/rueckblick");
  revalidatePath("/");
  revalidatePath("/termine");
}

export async function wochenrueckblickFesthalten(fd: FormData) {
  const woche = txt(fd, "week_start");
  const zielWoche = txt(fd, "ziel_woche");
  if (!ISO.test(woche) || !ISO.test(zielWoche)) return;

  const { supabase, userId } = await zugang();

  // Erst prüfen, ob es die Woche schon gibt. Ein blindes Upsert wäre hier
  // falsch: das Formular ist absichtlich nur einmal erreichbar, und ein
  // zweiter Absender käme aus einem doppelten Klick oder einem alten Tab —
  // beides soll den festgehaltenen Text nicht überschreiben.
  const { data: schonDa } = await supabase
    .from("weekly_reviews").select("id").eq("week_start", woche).maybeSingle();
  if (schonDa) return;

  const ziele = zuZielen(txt(fd, "ziele"));

  const { error } = await supabase.from("weekly_reviews").insert({
    user_id: userId,
    week_start: woche,
    went_well: txt(fd, "went_well") || null,
    went_poorly: txt(fd, "went_poorly") || null,
    next_week_focus: ziele.join("\n") || null,
  });
  if (error) throw new Error(`Rückblick speichern: ${error.message}`);

  if (ziele.length > 0) {
    // Was schon als Ziel dieser Woche dasteht, wird nicht doppelt angelegt.
    const { data: vorhanden } = await supabase
      .from("weekly_goals").select("title").eq("week_start", zielWoche);
    const bekannt = new Set(
      ((vorhanden ?? []) as { title: string }[]).map((z) => z.title),
    );

    const neu = ziele
      .filter((t) => !bekannt.has(t))
      .map((title, i) => ({
        user_id: userId, week_start: zielWoche, title, sort_order: bekannt.size + i,
      }));

    if (neu.length > 0) {
      const { error: zielFehler } = await supabase.from("weekly_goals").insert(neu);
      // Der Rückblick steht schon — ein Fehler bei den Zielen darf ihn nicht
      // mitreissen, aber lautlos verschwinden soll er auch nicht.
      if (zielFehler) throw new Error(`Ziele anlegen: ${zielFehler.message}`);
    }
  }

  neuLaden();
}

/**
 * Eine bereits festgehaltene Woche ändern — nur aus dem Verlauf.
 *
 * Das ist der einzige Weg zurück. Im Eintrage-Formular oben geht es
 * absichtlich nicht: wer beim Schreiben durch alte Wochen blättern kann,
 * schreibt sie um, und ein Rückblick, den man nachträglich glättet, misst
 * nur noch die eigene Laune von heute.
 *
 * Die Wochenziele werden hier NICHT mitgeändert. Sie sind zum Zeitpunkt des
 * Festhaltens entstanden und gehören zu der Woche, für die sie galten — sie
 * nachträglich umzuschreiben hiesse, sich die erfüllten Ziele auszusuchen.
 */
export async function wochenrueckblickAendern(fd: FormData) {
  const id = txt(fd, "id");
  if (!id) return;
  const { supabase, userId } = await zugang();

  const { error } = await supabase.from("weekly_reviews").update({
    went_well: txt(fd, "went_well") || null,
    went_poorly: txt(fd, "went_poorly") || null,
    next_week_focus: txt(fd, "next_week_focus") || null,
  }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Rückblick ändern: ${error.message}`);

  neuLaden();
}
