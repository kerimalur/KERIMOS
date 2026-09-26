import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { G8 } from "@/lib/supabase/trading";
import { holeWaehrung, fredKonfiguriert } from "@/lib/makro/fred";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Holt die Wirtschaftsdaten aller acht Währungen von FRED und legt sie in
 * `makro_reihen` ab (26.09.2026).
 *
 * AUFRUF von aussen, einmal täglich reicht — die Reihen sind monatlich:
 *     https://kerimos.vercel.app/api/makro-sync?secret=<CRON_SECRET>
 * Derselbe Taktgeber wie beim GVA-Alarm (cron-job.org). Der Endpoint schützt
 * sich über CRON_SECRET und steht in der Middleware auf der Ausnahmeliste.
 *
 * Geschrieben wird mit dem Service-Key, weil kein Nutzer angemeldet ist. Die
 * Tabelle gehört niemandem: es sind öffentliche Wirtschaftsdaten, und jeder
 * angemeldete Nutzer darf sie lesen (siehe Migration 27).
 *
 * Der Lauf meldet je Serie, ob sie ankam. Eine Serie, die FRED umbenannt hat,
 * soll sichtbar scheitern statt stillschweigend zu fehlen.
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

  if (!fredKonfiguriert()) {
    return NextResponse.json({
      ok: false,
      fehler: "FRED_API_KEY fehlt. Kostenlos unter fredaccount.stlouisfed.org/apikeys, "
        + "danach in Vercel als Umgebungsvariable eintragen.",
    }, { status: 503 });
  }

  const supabase = db();
  if (!supabase) {
    return NextResponse.json({
      ok: false, fehler: "SUPABASE_SERVICE_ROLE_KEY fehlt (Projekt Kompass).",
    }, { status: 503 });
  }

  const bericht: Record<string, string> = {};
  let geschrieben = 0;

  for (const ccy of G8) {
    const ergebnisse = await holeWaehrung(ccy);

    for (const e of ergebnisse) {
      if (e.fehler || e.werte.length === 0) {
        bericht[`${ccy}.${e.feld}`] = `fehlt (${e.fehler})`;
        continue;
      }

      const zeilen = e.werte.map((w) => ({
        ccy, feld: e.feld, datum: w.datum, wert: w.wert,
        serie: e.id, geholt_am: new Date().toISOString(),
      }));

      // Hat der Lauf eine andere Reihe gewählt als letztes Mal (frischere
      // Kandidaten-ID, oder jetzt in % statt als Niveau), fliegen die Zeilen
      // der alten raus — sonst stünde der Vorwert aus einer anderen Reihe
      // neben dem Stand, und der Trendpfeil vergliche Äpfel mit Birnen.
      await supabase.from("makro_reihen").delete()
        .eq("ccy", ccy).eq("feld", e.feld).neq("serie", e.id!);

      const { error } = await supabase.from("makro_reihen")
        .upsert(zeilen, { onConflict: "ccy,feld,datum" });

      if (error) {
        bericht[`${ccy}.${e.feld}`] = `Schreiben: ${error.message}`;
      } else {
        geschrieben += zeilen.length;
        const letzte = e.werte[e.werte.length - 1];
        bericht[`${ccy}.${e.feld}`] = `${e.id} · ${e.werte.length} Werte · zuletzt `
          + `${letzte.wert} am ${letzte.datum}`;
      }
    }
  }

  await supabase.from("makro_sync").upsert({
    id: 1, gelaufen: new Date().toISOString(), bericht,
  });

  return NextResponse.json({ ok: true, geschrieben, bericht });
}
