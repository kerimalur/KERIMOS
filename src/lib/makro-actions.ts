"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { HAND_FELDER } from "@/lib/makro/bewertung";

/**
 * Schreibzugriffe auf die von Hand gepflegten Makro-Zahlen.
 *
 * Bewusst ohne Zwischenschritte: Kerim trägt einmal im Monat ein, was bei
 * Trading Economics steht. Der alte Wert rutscht dabei automatisch auf
 * `vorwert` — daraus entsteht der Trendpfeil, ohne dass jemand zwei Felder
 * pflegen muss.
 */

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string): number | null => {
  const v = txt(fd, k);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const ERLAUBTE_FELDER = HAND_FELDER.map((f) => f.key);
const ZYKLEN = ["straffung", "pause_oben", "lockerung", "pause_unten"];

async function zugang() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht angemeldet.");
  return { supabase, userId };
}

function neuLaden() {
  revalidatePath("/trading/waehrungen");
  revalidatePath("/trading/fundamentals");
}

/**
 * Eine Währung speichern: alle Handfelder auf einmal, plus Zyklus und Notiz.
 *
 * Ein Feld, das leer bleibt, wird nicht angefasst — sonst würde ein leeres
 * Formularfeld einen gepflegten Wert löschen, nur weil die Seite neu geladen
 * wurde. Zum Löschen gibt es den Wert "-".
 */
export async function waehrungSpeichern(fd: FormData) {
  const { supabase, userId } = await zugang();
  const ccy = txt(fd, "ccy").toUpperCase().slice(0, 3);
  if (!ccy) return;

  const stand = txt(fd, "stand") || new Date().toISOString().slice(0, 10);

  const { data: bisher } = await supabase.from("makro_werte")
    .select("feld, wert").eq("user_id", userId).eq("ccy", ccy);
  const alt = new Map(((bisher ?? []) as { feld: string; wert: number | null }[])
    .map((r) => [r.feld, r.wert === null ? null : Number(r.wert)]));

  const zeilen: Record<string, unknown>[] = [];
  for (const feld of ERLAUBTE_FELDER) {
    const roh = txt(fd, feld);
    if (roh === "") continue;

    if (roh === "-") {
      await supabase.from("makro_werte").delete()
        .eq("user_id", userId).eq("ccy", ccy).eq("feld", feld);
      continue;
    }

    const wert = num(fd, feld);
    if (wert === null) continue;

    const vorher = alt.get(feld) ?? null;
    zeilen.push({
      user_id: userId, ccy, feld, wert,
      // Nur wenn sich die Zahl wirklich geändert hat, rutscht die alte nach
      // hinten. Sonst wäre der Trend nach jedem Speichern null.
      vorwert: vorher !== null && vorher !== wert ? vorher : (alt.has(feld) ? undefined : null),
      stand,
      quelle: txt(fd, "quelle") || null,
      updated_at: new Date().toISOString(),
    });
  }

  for (const z of zeilen) {
    if (z.vorwert === undefined) delete z.vorwert;
    await supabase.from("makro_werte").upsert(z, { onConflict: "user_id,ccy,feld" });
  }

  const zyklus = txt(fd, "zyklus");
  await supabase.from("makro_lage").upsert({
    user_id: userId, ccy,
    zyklus: ZYKLEN.includes(zyklus) ? zyklus : null,
    notiz: txt(fd, "notiz") || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,ccy" });

  neuLaden();
}

export async function ereignisAnlegen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const titel = txt(fd, "titel");
  if (!titel) return;

  await supabase.from("makro_ereignisse").insert({
    user_id: userId,
    titel,
    datum: txt(fd, "datum") || new Date().toISOString().slice(0, 10),
    profitiert: fd.getAll("profitiert").map(String).filter(Boolean),
    leidet: fd.getAll("leidet").map(String).filter(Boolean),
    notiz: txt(fd, "notiz") || null,
  });

  neuLaden();
}

export async function ereignisLoeschen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return;
  await supabase.from("makro_ereignisse").delete().eq("id", id).eq("user_id", userId);
  neuLaden();
}
