import { NextRequest, NextResponse } from "next/server";
import { ladeRueckblick } from "@/lib/supabase/tagesrueckblick-db";
import { baueMorgenNachricht, motivationFuer } from "@/lib/morgen";
import { ladeEinstellungen } from "@/lib/alarm/einstellungen";
import { verschicke } from "@/lib/alarm/versand";
import { heuteISO, heuteMinuten, ZONE } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Der Morgen-Anstoss: die eigenen Vorsätze von gestern, und ein Satz dazu.
 *
 * Gegenstück zur Abenderinnerung. Dort wird gefragt, hier wird zurückgegeben:
 * was gestern liegengeblieben ist und was du dir für heute vorgenommen hast.
 * Ein Vorsatz, den man abends aufschreibt und morgens nicht mehr sieht, ist
 * ein Datenbankeintrag und keine Absicht.
 *
 * ZWEI Nachrichten, nicht eine. Die Vorsätze sind eine Aufgabe, die Motivation
 * ist eine Haltung — zusammen in einem Block liest man das eine und überliest
 * das andere. Der Push-`tag` ist deshalb auch verschieden, sonst würde die
 * zweite Meldung die erste auf dem Sperrbildschirm ersetzen.
 *
 * Läuft als Art „zeit", damit dieselbe Ruhezeit-, Kanal- und Abschalt-Logik
 * greift wie bei jedem anderen Alarm (/trading/alarme/einstellungen).
 *
 * AUFRUF von aussen, werktags morgens:
 *     https://kerimos.vercel.app/api/morgen-anstoss?secret=<CRON_SECRET>
 * Vercels Hobby-Plan erlaubt nur einen eigenen Cron pro Tag, und der ist von
 * garmin-sync belegt — deshalb von aussen, genau wie die Abenderinnerung.
 */

/** Fenster, in dem der Anstoss sinnvoll ist: 04:00 bis 12:00. */
const FRUEHESTENS = 4 * 60;
const SPAETESTENS = 12 * 60;

/** Gestern, in ISO — ohne Zeitzonen-Umweg über die lokale Uhr des Servers. */
function gesternVon(heute: string): string {
  const d = new Date(`${heute}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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

  const heute = heuteISO();
  const jetzt = heuteMinuten();
  const probe = request.nextUrl.searchParams.get("test") === "1";

  // Ein verspäteter GitHub-Cron darf noch durchgehen, ein versehentlicher
  // Abendlauf nicht. `test=1` hebelt das für einen Probelauf aus.
  if (!probe && (jetzt < FRUEHESTENS || jetzt >= SPAETESTENS)) {
    return NextResponse.json({
      ok: true, zone: ZONE, gesendet: [],
      hinweis: `ausserhalb des Morgenfensters (${Math.floor(jetzt / 60)}:${String(jetzt % 60).padStart(2, "0")})`,
    });
  }

  const gestern = gesternVon(heute);
  const [{ rueckblick }, { werte }] = await Promise.all([
    ladeRueckblick(gestern),
    ladeEinstellungen(),
  ]);

  // ladeRueckblick liefert das Datum schon mit — nicht noch einmal setzen,
  // sonst ueberschreibt der Spread den gerade gesetzten Wert.
  const vorsatz = baueMorgenNachricht(rueckblick);
  const spruch = motivationFuer(heute);
  const lage = { jetztMinuten: jetzt, heute };

  // Nacheinander, nicht parallel: so kommt der Vorsatz zuerst an. Bei zwei
  // gleichzeitigen Telegram-Aufrufen entscheidet sonst der Zufall, und die
  // Motivation stünde über der Aufgabe.
  const gesendet: string[] = [];

  if (!vorsatz.leer) {
    const r = await verschicke({
      art: "zeit",
      titel: vorsatz.titel,
      text: vorsatz.text,
      url: "/rueckblick/heute",
      tag: `morgen-vorsatz-${heute}`,
    }, werte, lage);
    if (r.push.gesendet > 0 || r.telegram.ok) gesendet.push("vorsatz");
  }

  if (spruch) {
    const r = await verschicke({
      art: "zeit",
      titel: "Für heute",
      text: spruch,
      url: "/trading",
      tag: `morgen-motivation-${heute}`,
    }, werte, lage);
    if (r.push.gesendet > 0 || r.telegram.ok) gesendet.push("motivation");
  }

  return NextResponse.json({
    ok: true,
    zone: ZONE,
    heute,
    gestern,
    gesendet,
    vorsatzLeer: vorsatz.leer,
    // Im Probelauf sichtbar machen, WAS rausgegangen wäre — sonst weiss man
    // nach einem Test nur, dass irgendetwas gesendet wurde.
    vorschau: probe ? { vorsatz: vorsatz.text, motivation: spruch } : undefined,
  });
}
