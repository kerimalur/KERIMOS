import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTradingClient } from "@/lib/supabase/trading";
import { runJob, type JobResult } from "@/lib/marktdaten/jobs/util";
import { updatePrices } from "@/lib/marktdaten/jobs/updatePrices";
import { updateFred } from "@/lib/marktdaten/jobs/updateFred";
import { updateBis } from "@/lib/marktdaten/jobs/updateBis";
import { updateCalendar } from "@/lib/marktdaten/jobs/updateCalendar";
import { updateCot } from "@/lib/marktdaten/jobs/updateCot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Marktdaten für Confluence, Makro und Wirtschaftskalender (29.09.2026).
 *
 * Übernommen aus dem Screener-Frontend (frontend-next, /api/cron/daily und
 * /api/cron/fundamentals), das abgeschaltet wird. Schreibt in das Schema
 * `trading` des Kompass-Projekts: price_daily, fred_series(+_meta),
 * calendar_events, cot_reports, cot_tff_reports.
 *
 * AUFRUF (cron-job.org, einmal täglich, z.B. 06:30 Uhr Zürich):
 *     https://kerimos.vercel.app/api/marktdaten-sync?secret=<CRON_SECRET>
 * Einzelne Jobs:  &job=preise | fred | bis | kalender | cot
 * COT-Vollabzug (einmalig, dauert lange):  &job=cot&voll=1
 *
 * COT läuft ohne &job nur, wenn fällig (Sa/So/Mo oder letzter Report älter
 * als 8 Tage) — dieselbe Regel wie im Screener.
 *
 * Nicht übernommen: Renditen, Sentiment, Outlook-Snapshots und alles aus
 * lib/ml — deren Tabellen wurden beim Umzug bewusst nicht mitgenommen.
 */

const JOBS = ["preise", "fred", "bis", "kalender", "cot"] as const;
type Job = (typeof JOBS)[number];

async function cotFaellig(db: SupabaseClient): Promise<boolean> {
  const tag = new Date().getUTCDay();
  if (tag === 6 || tag === 0 || tag === 1) return true;
  const { data } = await db
    .from("cot_reports")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.report_date) return true;
  return (Date.now() - new Date(data.report_date).getTime()) / 86_400_000 > 8;
}

export async function GET(request: NextRequest) {
  const geheimnis = process.env.CRON_SECRET?.trim();
  if (!geheimnis) {
    return NextResponse.json({ ok: false, fehler: "CRON_SECRET fehlt" }, { status: 503 });
  }
  const kopf = request.headers.get("authorization")?.trim() ?? "";
  const query = request.nextUrl.searchParams.get("secret")?.trim() ?? "";
  if (kopf !== `Bearer ${geheimnis}` && query !== geheimnis) {
    return NextResponse.json({ ok: false, fehler: "nicht autorisiert" }, { status: 401 });
  }

  const client = createTradingClient();
  if (!client) {
    return NextResponse.json({
      ok: false, fehler: "TRADING_SUPABASE_URL oder TRADING_SUPABASE_SERVICE_ROLE_KEY fehlt.",
    }, { status: 503 });
  }
  // Die Jobs sind gegen den Standard-Client typisiert; das Schema steckt im
  // Client selbst (TRADING_SUPABASE_SCHEMA), die Tabellennamen sind gleich.
  const db = client as unknown as SupabaseClient;

  const gewuenscht = request.nextUrl.searchParams.get("job") as Job | null;
  if (gewuenscht && !JOBS.includes(gewuenscht)) {
    return NextResponse.json({ ok: false, fehler: `unbekannter Job: ${gewuenscht}` }, { status: 400 });
  }
  const voll = request.nextUrl.searchParams.get("voll") === "1";
  const start = Date.now();

  const definitionen: Record<Job, () => Promise<Record<string, unknown>>> = {
    preise: () => updatePrices(db),
    fred: () => updateFred(db),
    bis: () => updateBis(db),
    kalender: () => updateCalendar(db),
    cot: () => updateCot(db, { voll }),
  };

  let auswahl: Job[];
  if (gewuenscht) {
    auswahl = [gewuenscht];
  } else {
    auswahl = ["preise", "fred", "bis", "kalender"];
    if (await cotFaellig(db)) auswahl.push("cot");
  }

  const ergebnisse: JobResult[] = await Promise.all(
    auswahl.map((j) => runJob(db, `marktdaten:${j}`, definitionen[j])),
  );

  return NextResponse.json({
    ok: ergebnisse.every((r) => r.status !== "error"),
    sekunden: Math.round((Date.now() - start) / 1000),
    ergebnisse,
  });
}
