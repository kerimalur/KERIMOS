import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendePush } from "@/lib/push";
import { handlungAus } from "@/lib/routinen/laden";
import { faelligeErinnerungen } from "@/lib/routinen/typen";
import { heuteISO, heuteMinuten, heuteWochentag } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Push-Erinnerungen der Routinen (26.09.2026).
 *
 * AUFRUF von aussen, alle 15 Minuten (cron-job.org, wie der GVA-Alarm):
 *     https://kerimos.vercel.app/api/routinen-erinnerung?secret=<CRON_SECRET>
 *
 * Handlungen mit Uhrzeit kommen einzeln, sobald die Zeit erreicht ist (bis
 * 90 Minuten später wird nachgeholt). Handlungen ohne Uhrzeit kommen als EINE
 * Sammelmeldung um 07:00. Danach steht `zuletzt_erinnert` auf heute — ein
 * zweiter Lauf am selben Tag schickt nichts doppelt.
 *
 * Gesendet wird als App-Benachrichtigung (Web Push an alle angemeldeten
 * Geräte), bewusst nicht über Telegram.
 *
 * Gelesen wird mit dem Service-Key des Kompass-Projekts, weil beim Cron-Lauf
 * niemand angemeldet ist. Der Endpunkt steht deshalb in der Middleware auf
 * der Ausnahmeliste und schützt sich selbst über CRON_SECRET.
 */

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  const geheimnis = process.env.CRON_SECRET?.trim();
  if (geheimnis) {
    const kopf = request.headers.get("authorization")?.trim() ?? "";
    const query = request.nextUrl.searchParams.get("secret")?.trim() ?? "";
    if (kopf !== `Bearer ${geheimnis}` && query !== geheimnis) {
      return NextResponse.json({ ok: false, fehler: "nicht autorisiert" }, { status: 401 });
    }
  }

  const supabase = db();
  if (!supabase) {
    return NextResponse.json({
      ok: false, fehler: "SUPABASE_SERVICE_ROLE_KEY fehlt (Projekt Kompass).",
    }, { status: 503 });
  }

  const [h, z] = await Promise.all([
    supabase.from("routine_handlungen")
      .select("id, ziel_id, titel, tage, uhrzeit, zuletzt_erinnert, reihenfolge"),
    supabase.from("routine_ziele").select("id, titel"),
  ]);
  if (h.error) return NextResponse.json({ ok: false, fehler: h.error.message }, { status: 500 });

  const zielName = new Map(((z.data ?? []) as { id: string; titel: string }[])
    .map((r) => [r.id, r.titel]));
  const handlungen = ((h.data ?? []) as Record<string, unknown>[]).map(handlungAus);

  const jetzt = { datum: heuteISO(), wochentag: heuteWochentag(), minuten: heuteMinuten() };
  const { einzeln, sammel } = faelligeErinnerungen(handlungen, jetzt);

  const gesendet: string[] = [];
  const fehler: string[] = [];

  for (const x of einzeln) {
    const r = await sendePush({
      title: x.titel,
      body: `Für dein Ziel „${zielName.get(x.ziel_id) ?? "…"}".`,
      tag: `routine-${x.id}`,
      url: "/routinen",
    });
    if (r.gesendet > 0) gesendet.push(x.id); else fehler.push(...r.fehler);
  }

  if (sammel.length > 0) {
    const r = await sendePush({
      title: "Heute für deine Ziele",
      body: sammel.map((x) => `• ${x.titel}`).join("\n"),
      tag: "routinen-morgen",
      url: "/routinen",
    });
    if (r.gesendet > 0) gesendet.push(...sammel.map((x) => x.id)); else fehler.push(...r.fehler);
  }

  if (gesendet.length > 0) {
    await supabase.from("routine_handlungen")
      .update({ zuletzt_erinnert: jetzt.datum }).in("id", gesendet);
  }

  return NextResponse.json({
    ok: fehler.length === 0,
    jetzt,
    einzeln: einzeln.length,
    sammel: sammel.length,
    gesendet: gesendet.length,
    fehler: [...new Set(fehler)],
  });
}
