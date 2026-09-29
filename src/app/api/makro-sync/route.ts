import { NextRequest, NextResponse } from "next/server";
import { holeAlles } from "@/lib/makro/quellen";
import { makroDb, speichereReihe, bestehendeReihe, berichtErgaenzen } from "@/lib/makro/speichern";
import { syncReleases } from "@/lib/makro/releases-sync";

export const dynamic = "force-dynamic";
// Der Lauf „releases" rechnet die ganze Historie neu und schreibt sie in
// Stücken zurück; mit &voll=1 kommt der JBlanked-Zeitraum ab 2024 dazu.
export const maxDuration = 300;

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
 *
 * Seit dem 29.09.2026 zusätzlich die Veröffentlichungen mit Erwartung und Ist
 * (`makro_releases`, lib/makro/releases-sync.ts):
 *     &job=releases           nur die Veröffentlichungen (alle 15 Minuten)
 *     &job=releases&voll=1    einmalig: JBlanked-Historie ab 2024 nachladen
 *     &job=reihen             nur die Monatsreihen
 * Ohne &job laufen beide.
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

  const job = request.nextUrl.searchParams.get("job");
  if (job && job !== "releases" && job !== "reihen") {
    return NextResponse.json({ ok: false, fehler: `unbekannter Job: ${job}` }, { status: 400 });
  }
  const voll = request.nextUrl.searchParams.get("voll") === "1";

  if (job === "releases") {
    const releases = await syncReleases(db, { voll });
    await berichtErgaenzen(db, { releases: releasesZeile(releases) });
    return NextResponse.json({ ok: releases.fehler.length === 0, releases });
  }

  const [ergebnisse, releases] = await Promise.all([
    holeAlles(),
    job === "reihen" ? Promise.resolve(null) : syncReleases(db, { voll }),
  ]);
  const bericht: Record<string, string> = {};
  if (releases) bericht.releases = releasesZeile(releases);

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

  return NextResponse.json({ ok: true, bericht, releases });
}

function releasesZeile(r: Awaited<ReturnType<typeof syncReleases>>): string {
  const quellen = Object.entries(r.jeQuelle).map(([q, n]) => `${q} ${n}`).join(", ") || "keine";
  return `${r.releases} Termine · ${r.mitErwartung} mit Erwartung · ${r.mitIst} mit Ist (${quellen}) · `
    + `JBlanked: ${r.jblanked}${r.fehler.length ? ` · Fehler: ${r.fehler.join(" | ")}` : ""}`;
}
