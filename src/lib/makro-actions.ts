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
  revalidatePath("/trading/waehrungen", "layout");
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

  // Zyklus und Notiz nur anfassen, wenn das Formular sie mitschickt — die
  // Zahlen-Pflege tut das seit dem 26.09.2026 nicht mehr (beides steht jetzt
  // in Ebene 2), und ein fehlendes Feld darf die Notiz nicht löschen.
  if (fd.has("zyklus") || fd.has("notiz")) await lageSpeichern(supabase, userId, ccy, fd);

  neuLaden();
}

async function lageSpeichern(
  supabase: Awaited<ReturnType<typeof zugang>>["supabase"], userId: string, ccy: string, fd: FormData,
) {
  const { data: bisher } = await supabase.from("makro_lage").select("zyklus, notiz")
    .eq("user_id", userId).eq("ccy", ccy).maybeSingle();
  const zyklus = fd.has("zyklus") ? txt(fd, "zyklus") : String(bisher?.zyklus ?? "");
  await supabase.from("makro_lage").upsert({
    user_id: userId, ccy,
    zyklus: ZYKLEN.includes(zyklus) ? zyklus : null,
    notiz: fd.has("notiz") ? (txt(fd, "notiz") || null) : (bisher?.notiz ?? null),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,ccy" });
}

/** Ebene 2: Zyklus (leer = automatisch aus dem Zinsverlauf) und das Warum. */
export async function notenbankSpeichern(fd: FormData) {
  const { supabase, userId } = await zugang();
  const ccy = txt(fd, "ccy").toUpperCase().slice(0, 3);
  if (!ccy) return;
  await lageSpeichern(supabase, userId, ccy, fd);
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

/* --------------------------------------------- Nachladen aus dem Browser */

/**
 * Reihen, die der Browser selbst bei der OECD geholt hat, speichern.
 *
 * Warum der Umweg: IMF und Weltbank weisen das Vercel-Rechenzentrum ab
 * (HTTP 403 bzw. keine Antwort), und die OECD tat es zeitweise auch.
 * Dieselben Anfragen aus Kerims Browser gehen — und OECD und Weltbank
 * erlauben sie dort ausdrücklich (CORS). Der Browser holt also, der Server
 * prüft und schreibt.
 *
 * Geprüft wird hart: nur angemeldet, nur bekannte Währung/Feld-Paare aus
 * dem Katalog, nur Zahlen und gültige Daten, höchstens 60 Werte. Geschrieben
 * wird nach derselben Regel wie beim Cron: die frischere Quelle gewinnt.
 */
export async function makroAusBrowser(reihen: {
  ccy: string; feld: string; serie: string; werte: { datum: string; wert: number }[];
}[]): Promise<{ gespeichert: number; bericht: Record<string, string> } | { fehler: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { fehler: "Nicht angemeldet." };

  const { makroDb, speichereReihe, berichtErgaenzen } = await import("@/lib/makro/speichern");
  const { browserErlaubt } = await import("@/lib/makro/katalog");
  const db = makroDb();
  if (!db) return { fehler: "SUPABASE_SERVICE_ROLE_KEY fehlt." };

  const erlaubt = browserErlaubt();

  const bericht: Record<string, string> = {};
  let gespeichert = 0;
  for (const r of reihen.slice(0, 60)) {
    if (!erlaubt.has(`${r.ccy}|${r.feld}|${r.serie}`)) continue;
    const werte = (r.werte ?? [])
      .filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.datum) && Number.isFinite(Number(w.wert)))
      .map((w) => ({ datum: w.datum, wert: Number(w.wert) }))
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .slice(-60);
    if (werte.length === 0) continue;
    const text = await speichereReihe(db, { ccy: r.ccy, feld: r.feld, serie: r.serie, werte });
    if (!text.startsWith("behalten") && !text.startsWith("fehlt")) {
      gespeichert++;
      bericht[`${r.ccy}.${r.feld}`] = `${text} (im Browser geholt)`;
    }
  }

  if (Object.keys(bericht).length > 0) await berichtErgaenzen(db, bericht);
  neuLaden();
  return { gespeichert, bericht };
}
