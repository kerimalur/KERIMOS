import { NextRequest, NextResponse } from "next/server";
import { createTradingClient } from "@/lib/supabase/trading";
import { fetchScreener, type ScreenerPair } from "@/lib/supabase/trading";
import { sendePush } from "@/lib/push";
import { heuteISO, heuteMinuten, ZONE } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Prüft die selbst gezeichneten GVA-Linien gegen die Live-Preise des
 * Screeners und schickt Benachrichtigungen.
 *
 * Drei Alarmarten pro Linie, alle einzeln abschaltbar:
 *   naehe - der Preis kommt auf `alarm_pips` Pips heran (Vorlaufzeit,
 *           um den Chart aufzumachen)
 *   hit   - die Linie ist erreicht oder durchschritten
 *   zeit  - eine frei gesetzte Uhrzeit ist da (z.B. 08:00 Sessionstart)
 *
 * Gegen Dauerfeuer schützt `alarm_log`: pro Linie, Art und Tag genau eine
 * Meldung. Ein Unique-Index macht das auch dann dicht, wenn zwei Läufe
 * sich überschneiden - der zweite Insert scheitert schlicht.
 *
 * AUFRUF: bewusst NICHT über Vercel-Cron. Der Hobby-Plan erlaubt nur einen
 * Lauf pro Tag ("Hobby accounts are limited to daily cron jobs") und lehnt
 * jeden Deploy mit häufigerem Zeitplan komplett ab. Getaktet wird deshalb
 * von aussen, z.B. cron-job.org alle 5 Minuten:
 *     https://kerimos.vercel.app/api/gva-alarm?secret=<CRON_SECRET>
 * Der Endpoint schützt sich selbst über CRON_SECRET und ist in der
 * Middleware von der Login-Weiterleitung ausgenommen.
 */

/** Pip-Grösse: JPY-Paare rechnen mit 0.01, alles andere mit 0.0001. */
function pipGroesse(pair: string): number {
  return pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
}

function pipsAbstand(pair: string, a: number, b: number): number {
  return Math.abs(a - b) / pipGroesse(pair);
}

interface Linie {
  id: string;
  pair: string;
  line_level: number | null;
  side: string | null;
  alarm_pips: number | null;
  alarm_on_hit: boolean;
  alarm_time: string | null;
  show_until: string | null;
  archived: boolean;
  note: string | null;
}

export async function GET(request: NextRequest) {
  // Getrimmt verglichen: beim Einfügen in die Vercel-Oberfläche rutscht
  // regelmässig ein Zeilenumbruch oder Leerzeichen mit, und ein exakter
  // Vergleich schlägt dann fehl, obwohl der Wert für das Auge stimmt.
  const geheimnis = process.env.CRON_SECRET?.trim();
  if (geheimnis) {
    const kopf = request.headers.get("authorization")?.trim() ?? "";
    const query = request.nextUrl.searchParams.get("secret")?.trim() ?? "";
    if (kopf !== `Bearer ${geheimnis}` && query !== geheimnis) {
      // Nur Längen, nie Werte: das reicht, um Tippfehler und mitkopierte
      // Zeichen zu erkennen, ohne das Geheimnis preiszugeben.
      return NextResponse.json({
        ok: false,
        fehler: "nicht autorisiert",
        hinweis: query
          ? `?secret hat ${query.length} Zeichen, erwartet werden ${geheimnis.length}.`
          : "In der URL fehlt ?secret=… (oder der Authorization-Header).",
      }, { status: 401 });
    }
  }

  const supabase = createTradingClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, fehler: "Trading-DB fehlt" });
  }

  const heute = heuteISO();
  const { data } = await supabase
    .from("trading_watchlist")
    .select("id, pair, line_level, side, alarm_pips, alarm_on_hit, alarm_time, show_until, archived, note")
    .eq("archived", false);

  const linien = ((data ?? []) as Linie[])
    .filter((l) => !l.show_until || l.show_until >= heute);

  if (linien.length === 0) {
    return NextResponse.json({ ok: true, geprueft: 0, gesendet: 0, hinweis: "keine aktiven Linien" });
  }

  const screener = await fetchScreener();
  const preise = new Map<string, number>();
  for (const p of (screener?.data ?? []) as ScreenerPair[]) {
    if (typeof p.price === "number") preise.set(p.pair.toUpperCase(), p.price);
  }

  const jetztMinuten = heuteMinuten();
  const berichte: string[] = [];
  let gesendet = 0;

  /** Meldet einmal pro Linie/Art/Tag. Der Unique-Index ist die Sperre. */
  async function melde(linie: Linie, art: "naehe" | "hit" | "zeit", nachricht: {
    title: string; body: string; requireInteraction?: boolean;
  }) {
    const { error } = await supabase!
      .from("alarm_log")
      .insert({ watchlist_id: linie.id, art, tag: heute });
    if (error) return; // schon gemeldet (Unique-Verletzung) - still übergehen

    const ergebnis = await sendePush({
      ...nachricht,
      tag: `gva-${linie.id}-${art}`,
      url: "/trading",
    });
    gesendet += ergebnis.gesendet;
    berichte.push(`${linie.pair} ${art}: ${ergebnis.gesendet} gesendet`);
  }

  for (const linie of linien) {
    // ------------------------------------------------------------- Uhrzeit
    if (linie.alarm_time) {
      const [h, m] = linie.alarm_time.split(":").map(Number);
      const ziel = h * 60 + m;
      // Fenster statt exakter Treffer: der Cron läuft alle 5 Minuten, ein
      // Gleichheitsvergleich würde die meisten Zeiten verpassen. Nur
      // vorwärts, damit ein später Lauf nicht rückwirkend feuert.
      if (jetztMinuten >= ziel && jetztMinuten < ziel + 10) {
        await melde(linie, "zeit", {
          title: `${linie.pair} — Erinnerung`,
          body: linie.note
            ? `${linie.note} (${linie.alarm_time.slice(0, 5)})`
            : `Deine gesetzte Zeit ${linie.alarm_time.slice(0, 5)} ist da.`,
        });
      }
    }

    // ------------------------------------------------------- Preis-Alarme
    if (linie.line_level === null) continue;
    const preis = preise.get(linie.pair.toUpperCase());
    if (preis === undefined) continue;

    const level = Number(linie.line_level);
    const abstand = pipsAbstand(linie.pair, preis, level);

    // Hit: der Preis hat die Linie erreicht oder überschritten. Ohne Seite
    // reicht "praktisch drauf" (unter 1 Pip) als Treffer.
    const getroffen = linie.side === "long" ? preis <= level
      : linie.side === "short" ? preis >= level
        : abstand < 1;

    if (linie.alarm_on_hit && getroffen) {
      await melde(linie, "hit", {
        title: `${linie.pair} — GVA erreicht`,
        body: `Preis ${preis} ist an deiner Linie ${level}` +
          (linie.side ? ` (${linie.side.toUpperCase()})` : "") + ".",
        requireInteraction: true,
      });
      continue; // kein zusätzlicher Nähe-Alarm, wenn schon getroffen
    }

    if (linie.alarm_pips && abstand <= linie.alarm_pips) {
      await melde(linie, "naehe", {
        title: `${linie.pair} — ${Math.round(abstand)} Pips zur GVA`,
        body: `Preis ${preis}, deine Linie ${level}` +
          (linie.side ? ` (${linie.side.toUpperCase()})` : "") + ". Chart aufmachen.",
      });
    }
  }

  // Aufräumen: Log-Zeilen von gestern und früher wegräumen, damit ein Alarm
  // morgen wieder auslösen darf und die Tabelle nicht endlos wächst.
  await supabase.from("alarm_log").delete().lt("tag", heute);

  return NextResponse.json({
    ok: true,
    zone: ZONE,
    geprueft: linien.length,
    preiseBekannt: preise.size,
    gesendet,
    berichte,
  });
}
