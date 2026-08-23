import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ladeEinstellungen } from "@/lib/alarm/einstellungen";
import { verschicke } from "@/lib/alarm/versand";
import { ladeWochenziele } from "@/lib/wochenziele";
import { heuteISO, heuteMinuten, heuteWochentag, weekStart, ZONE } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Die Sonntagserinnerung an den Wochenrückblick.
 *
 * Derselbe Gedanke wie bei der Abenderinnerung: Ohne Anstoss passiert der
 * Rückblick nicht. Der Unterschied ist die Frequenz — einmal pro Woche, und
 * genau deshalb ist er leichter zu vergessen als der tägliche.
 *
 * Geschickt wird nur, wenn für die zu Ende gehende Woche noch nichts
 * geschrieben steht. Wer sonntags nachmittags schon fertig ist, wird abends
 * nicht behelligt; eine Erinnerung an etwas Erledigtes bringt einem bei, sie
 * zu ignorieren.
 *
 * Die Nachricht nennt die offenen Wochenziele mit, weil das die Frage ist,
 * mit der der Rückblick anfängt: Was wollte ich diese Woche, und was ist
 * daraus geworden?
 *
 * AUFRUF von aussen, sonntags gegen 18:00 Zürcher Zeit (GitHub Action,
 * .github/workflows/wochen-erinnerung.yml):
 *     https://kerimos.vercel.app/api/wochen-erinnerung
 *     Authorization: Bearer <CRON_SECRET>
 */

/** Frühestens 16:00 Ortszeit — davor ist der Sonntag noch nicht vorbei genug. */
const FRUEHESTENS = 16 * 60;

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

  // heuteWochentag(): 0 = Sonntag. Der GitHub-Cron kann sich verspäten, aber
  // nicht um einen Tag — ein Lauf an einem anderen Wochentag wäre ein Fehler
  // in der Einstellung und soll nichts verschicken.
  if (!probe && heuteWochentag() !== 0) {
    return NextResponse.json({ ok: true, zone: ZONE, gesendet: 0, hinweis: "kein Sonntag" });
  }
  if (!probe && jetzt < FRUEHESTENS) {
    return NextResponse.json({
      ok: true, zone: ZONE, gesendet: 0,
      hinweis: `noch zu früh (${Math.floor(jetzt / 60)}:${String(jetzt % 60).padStart(2, "0")})`,
    });
  }

  // Die Woche, die heute endet — nicht die vergangene. Sonntagabend schaut
  // man auf die Woche zurück, in der man gerade noch steckt.
  const woche = weekStart(heute);

  const supabase = await createClient();
  const { data: vorhanden } = await supabase
    .from("weekly_reviews").select("id").eq("week_start", woche).maybeSingle();

  if (vorhanden && !probe) {
    return NextResponse.json({
      ok: true, zone: ZONE, gesendet: 0, hinweis: "Rückblick steht schon",
    });
  }

  const { ziele } = await ladeWochenziele(woche);
  const offen = ziele.filter((z) => !z.erledigtAm);
  const erledigt = ziele.length - offen.length;

  const zielSatz = ziele.length === 0
    ? "Diese Woche stand kein Ziel — setz beim Rückblick eines für die nächste."
    : offen.length === 0
      ? `Alle ${ziele.length} Wochenziele erledigt.`
      : `${erledigt} von ${ziele.length} Wochenzielen erledigt. Offen: `
        + offen.map((z) => z.titel).join(", ") + ".";

  const { werte } = await ladeEinstellungen();
  const ergebnis = await verschicke({
    art: "zeit",
    titel: "Wochenrückblick",
    text: `${zielSatz} Fünf Minuten: Was lief gut, was nicht, worauf kommt es `
      + "nächste Woche an — und setz die Ziele für die neue Woche.",
    url: "/rueckblick",
    tag: `wochenrueckblick-${woche}`,
  }, werte, { jetztMinuten: jetzt, heute });

  return NextResponse.json({
    ok: true,
    zone: ZONE,
    woche,
    gesendet: ergebnis.push.gesendet + (ergebnis.telegram.ok ? 1 : 0),
    unterdrueckt: ergebnis.unterdrueckt,
    zeile: ergebnis.zeile,
  });
}
