import { NextRequest, NextResponse } from "next/server";
import { holeAlles } from "@/lib/makro/quellen";
import { makroDb, speichereReihe, bestehendeReihe } from "@/lib/makro/speichern";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Holt die Wirtschaftsdaten aller acht Währungen (OECD, Eurostat, IMF,
 * Weltbank, FRED) und legt sie in `makro_reihen` ab (26.09.2026).
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
 * Der Lauf meldet je Feld, woher der Wert kam — oder warum nicht. Kommt
 * vom Server nichts, aber die Tabelle hat schon eine Reihe (z.B. aus dem
 * Browser nachgeladen), bleibt die stehen und der Bericht sagt das.
 */
export async function GET(request: NextRequest) {
  const geheimnis = process.env.CRON_SECRET?.trim();
  if (geheimnis) {
    const kopf = request.headers.get("authorization")?.trim() ?? "";
    const query = request.nextUrl.searchParams.get("secret")?.trim() ?? "";
    if (kopf !== `Bearer ${geheimnis}` && query !== geheimnis) {
      return NextResponse.json({ ok: false, fehler: "nicht autorisiert" }, { status: 401 });
    }
  }

  const db = makroDb();
  if (!db) {
    return NextResponse.json({
      ok: false, fehler: "SUPABASE_SERVICE_ROLE_KEY fehlt (Projekt Kompass).",
    }, { status: 503 });
  }

  const ergebnisse = await holeAlles();
  const bericht: Record<string, string> = {};

  await Promise.all(ergebnisse.map(async (e) => {
    const schluessel = `${e.ccy}.${e.feld}`;
    if (e.fehler || !e.serie) {
      const alt = await bestehendeReihe(db, e.ccy, e.feld);
      bericht[schluessel] = alt
        ? `behalten: ${alt.serie} (${alt.datum}) — Server-Abruf: ${e.fehler}`
        : `fehlt (${e.fehler})`;
      return;
    }
    bericht[schluessel] = await speichereReihe(db, {
      ccy: e.ccy, feld: e.feld, serie: e.serie, werte: e.werte,
    });
  }));

  await db.from("makro_sync").upsert({ id: 1, gelaufen: new Date().toISOString(), bericht });

  return NextResponse.json({ ok: true, bericht });
}
