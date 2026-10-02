import { NextRequest, NextResponse } from "next/server";
import { holeAlles } from "@/lib/makro/quellen";
import { makroDb, speichereReihe, bestehendeReihe, berichtErgaenzen } from "@/lib/makro/speichern";
import { syncReleases } from "@/lib/makro/releases-sync";
import { wochenideenLauf } from "@/lib/makro/wochenideen";
import { rechneZurueck, rueckrechnungWennFaellig } from "@/lib/makro/rueckrechnung";

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
 *     &job=wochenideen        nur die Wochenaussicht (anlegen + nachmessen)
 *     &job=rueckrechnung      Rückrechnung ab 2024 sofort neu rechnen
 *     &job=varianten          Varianten-Vergleich des Makro-Modells neu rechnen
 * Der volle Lauf rechnet die Rückrechnung einmal pro Woche mit.
 *     &job=jb-test&pfad=...   Probeabruf bei JBlanked (siehe jbTest unten)
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
  if (job === "jb-test") {
    return NextResponse.json(await jbTest(request.nextUrl.searchParams.get("pfad") ?? ""));
  }
  if (job === "wochenideen") {
    const text = await wochenideenLauf();
    await berichtErgaenzen(db, { wochenideen: text });
    return NextResponse.json({ ok: true, wochenideen: text });
  }
  if (job === "varianten") {
    const { rechneVarianten } = await import("@/lib/makro/varianten");
    const text = await rechneVarianten();
    await berichtErgaenzen(db, { varianten: text });
    return NextResponse.json({ ok: !/fehlt|Fehler|Schreiben|Löschen/.test(text), varianten: text });
  }
  if (job === "rueckrechnung") {
    const text = await rechneZurueck();
    await berichtErgaenzen(db, { rueckrechnung: text });
    return NextResponse.json({ ok: !/fehlt|Fehler|Schreiben|Löschen/.test(text), rueckrechnung: text });
  }
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
  // Die Wochenaussicht nach den Releases — sie braucht das frische Urteil.
  if (job !== "reihen") bericht.wochenideen = await wochenideenLauf();
  if (!job) bericht.rueckrechnung = await rueckrechnungWennFaellig().catch((e) => `Fehler: ${e instanceof Error ? e.message : "?"}`);

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
  const mt5 = typeof r.mt5 === "string" ? r.mt5
    : `${r.mt5.zeilen} Zeilen, ${r.mt5.zugeordnet} zugeordnet, ${r.mt5.istGesetzt} Ist, ${r.mt5.historie + r.mt5.ohneZuordnung} Historie`;
  return `${r.releases} Termine · ${r.mitErwartung} mit Erwartung · ${r.mitIst} mit Ist (${quellen}) · `
    + `MT5: ${mt5} · JBlanked: ${r.jblanked}${r.fehler.length ? ` · Fehler: ${r.fehler.join(" | ")}` : ""}`;
}

/**
 * Probeabruf bei JBlanked (29.09.2026): Der Zeitraum-Abruf ab 2024 gab mit
 * dem Gratis-Key HTTP 401. Bevor ein zweiter Weg zur Historie gebaut wird,
 * zeigt dieser Aufruf, was die anderen Endpunkte mit demselben Key liefern —
 * Status, Aufbau und die ersten Einträge. Nur feste Pfade, damit die Route
 * kein offener Proxy wird. Gratis-Limit: ein Abruf alle 5 Minuten.
 */
const JB_TEST_PFADE = [
  "full-list/", "list/", "calendar/", "calendar/today/", "calendar/week/",
] as const;

async function jbTest(pfad: string) {
  const key = process.env.JBLANKED_API_KEY?.trim();
  if (!key) return { ok: false, fehler: "JBLANKED_API_KEY fehlt" };
  if (!(JB_TEST_PFADE as readonly string[]).includes(pfad)) {
    return { ok: false, fehler: `pfad muss einer von diesen sein: ${JB_TEST_PFADE.join(", ")}` };
  }
  const url = `https://www.jblanked.com/news/api/forex-factory/${pfad}`;
  const start = Date.now();
  try {
    const r = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(50_000),
      headers: { Authorization: `Api-Key ${key}`, "Content-Type": "application/json" },
    });
    const text = await r.text();
    const basis = {
      url, status: r.status, sekunden: Math.round((Date.now() - start) / 100) / 10,
      contentType: r.headers.get("content-type"), bytes: text.length,
    };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: r.ok, ...basis, text: text.slice(0, 1500) };
    }
    return { ok: r.ok, ...basis, aufbau: aufbau(json), beispiel: beispiel(json) };
  } catch (e) {
    return { ok: false, url, fehler: e instanceof Error ? e.message : "unbekannt" };
  }
}

/** Grobe Beschreibung der Struktur: Typ, Länge, Schlüssel — zwei Ebenen tief. */
function aufbau(x: unknown, tiefe = 0): unknown {
  if (Array.isArray(x)) {
    return { typ: "liste", laenge: x.length, element: x.length && tiefe < 2 ? aufbau(x[0], tiefe + 1) : null };
  }
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const schluessel = Object.keys(o);
    return {
      typ: "objekt",
      schluessel: schluessel.slice(0, 30),
      anzahl: schluessel.length,
      ...(tiefe < 2 && schluessel.length
        ? { erster: { [schluessel[0]]: aufbau(o[schluessel[0]], tiefe + 1) } }
        : {}),
    };
  }
  return typeof x;
}

/** Die ersten zwei Einträge, gekürzt — genug, um Felder und Datumsformat zu sehen. */
function beispiel(x: unknown): string {
  const kopf = Array.isArray(x) ? x.slice(0, 2)
    : x && typeof x === "object" ? Object.fromEntries(Object.entries(x as Record<string, unknown>).slice(0, 2))
      : x;
  return JSON.stringify(kopf).slice(0, 4000);
}
