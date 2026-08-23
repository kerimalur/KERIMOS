import { NextRequest, NextResponse } from "next/server";
import { ladeRueckblick } from "@/lib/supabase/tagesrueckblick-db";
import { hatInhalt } from "@/lib/tagesrueckblick";
import { ladeEinstellungen } from "@/lib/alarm/einstellungen";
import { verschicke } from "@/lib/alarm/versand";
import { heuteISO, heuteMinuten, ZONE } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Die Abenderinnerung an den Tagesrückblick.
 *
 * Ohne Erinnerung passiert der Rückblick nicht — das ist der ganze Grund,
 * warum es diesen Endpoint gibt. Er schickt nur dann etwas, wenn heute noch
 * nichts festgehalten wurde; wer schon geschrieben hat, wird nicht behelligt.
 *
 * Verschickt wird über dieselbe Kette wie die GVA-Alarme
 * (`lib/alarm/versand`), also über Telegram und Web-Push je nach Einstellung.
 * Die Meldung läuft als Art „zeit" — damit greift dieselbe Ruhezeit- und
 * Kanal-Logik, und sie lässt sich unter /trading/alarme/einstellungen
 * abschalten wie jeder andere Alarm auch.
 *
 * AUFRUF von aussen, einmal täglich um 21:00 Zürcher Zeit — Vercels Hobby-Plan
 * erlaubt genau einen Cron-Lauf pro Tag, und mehr braucht es hier nicht:
 *     https://kerimos.vercel.app/api/abend-erinnerung?secret=<CRON_SECRET>
 */

/** Fenster, in dem die Erinnerung überhaupt sinnvoll ist: 20:00 bis 23:59. */
const FRUEHESTENS = 20 * 60;

export async function GET(request: NextRequest) {
  const geheimnis = process.env.CRON_SECRET?.trim();
  if (geheimnis) {
    const kopf = request.headers.get("authorization")?.trim() ?? "";
    const query = request.nextUrl.searchParams.get("secret")?.trim() ?? "";
    if (kopf !== `Bearer ${geheimnis}` && query !== geheimnis) {
      return NextResponse.json({ ok: false, fehler: "nicht autorisiert" }, { status: 401 });
    }
  }

  const heute = heuteISO();
  const jetzt = heuteMinuten();

  // Ein Cron, der aus Versehen mittags feuert, soll nicht an den Abend
  // erinnern. `test=1` hebelt das für einen Probelauf aus.
  const probe = request.nextUrl.searchParams.get("test") === "1";
  if (!probe && jetzt < FRUEHESTENS) {
    return NextResponse.json({
      ok: true, zone: ZONE, gesendet: 0,
      hinweis: `noch zu früh (${Math.floor(jetzt / 60)}:${String(jetzt % 60).padStart(2, "0")})`,
    });
  }

  const { rueckblick } = await ladeRueckblick(heute);
  if (rueckblick && hatInhalt(rueckblick)) {
    return NextResponse.json({
      ok: true, zone: ZONE, gesendet: 0, hinweis: "heute schon festgehalten",
    });
  }

  const { werte } = await ladeEinstellungen();
  const ergebnis = await verschicke({
    art: "zeit",
    titel: "Tagesrückblick",
    text: "Drei Zeilen, eine Minute: Was hast du erreicht, was ist liegengeblieben, "
      + "was ist morgen das Wichtigste?",
    url: "/rueckblick#heute",
    tag: `rueckblick-${heute}`,
  }, werte, { jetztMinuten: jetzt, heute });

  return NextResponse.json({
    ok: true,
    zone: ZONE,
    gesendet: ergebnis.push.gesendet + (ergebnis.telegram.ok ? 1 : 0),
    unterdrueckt: ergebnis.unterdrueckt,
    zeile: ergebnis.zeile,
  });
}
