import "server-only";
import webpush from "web-push";
import { createTradingClient } from "@/lib/supabase/trading";

/**
 * Web Push für KerimOS.
 *
 * Die Abos liegen in der Trading-Datenbank, weil die Alarme von dort kommen
 * (Watchlist-Linien) und der Cron-Job ohnehin nur diese eine Verbindung
 * braucht. Fachlich gehören sie zu keinem Bereich - hier zählt, dass alles
 * an einem Ort steht.
 *
 * VAPID-Schlüssel identifizieren den Absender gegenüber Googles Push-Dienst.
 * Der öffentliche Teil steckt auch im Browser (NEXT_PUBLIC_), der private
 * darf ausschliesslich serverseitig existieren.
 */

export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}

let initialisiert = false;

function init(): boolean {
  if (!pushConfigured()) return false;
  if (!initialisiert) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:kerimtrades.ssg@gmail.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    initialisiert = true;
  }
  return true;
}

export interface PushNachricht {
  title: string;
  body: string;
  /** Gleicher tag = neue Meldung ersetzt die alte, statt zu stapeln. */
  tag?: string;
  /** Wohin der Klick führt. */
  url?: string;
  /** Bleibt liegen, bis weggewischt - für Dinge, die man nicht verpassen darf. */
  requireInteraction?: boolean;
}

export interface PushErgebnis {
  gesendet: number;
  entfernt: number;
  fehler: string[];
}

/**
 * An alle registrierten Geräte senden.
 *
 * Abos, die der Push-Dienst mit 404/410 ablehnt, sind endgültig tot (App
 * deinstalliert, Berechtigung entzogen) und werden gleich gelöscht - sonst
 * sammeln sich Karteileichen an, die jeden Lauf verlangsamen.
 */
export async function sendePush(nachricht: PushNachricht): Promise<PushErgebnis> {
  const ergebnis: PushErgebnis = { gesendet: 0, entfernt: 0, fehler: [] };
  if (!init()) {
    ergebnis.fehler.push("VAPID-Schlüssel fehlen");
    return ergebnis;
  }

  const supabase = createTradingClient();
  if (!supabase) {
    ergebnis.fehler.push("Trading-Datenbank nicht verbunden");
    return ergebnis;
  }

  const { data: abos } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (!abos || abos.length === 0) {
    ergebnis.fehler.push("Kein Gerät angemeldet");
    return ergebnis;
  }

  const nutzlast = JSON.stringify(nachricht);

  await Promise.all(abos.map(async (abo) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: abo.endpoint as string,
          keys: { p256dh: abo.p256dh as string, auth: abo.auth as string },
        },
        nutzlast,
      );
      ergebnis.gesendet++;
      await supabase.from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString() }).eq("id", abo.id);
    } catch (fehler: unknown) {
      const status = (fehler as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", abo.id);
        ergebnis.entfernt++;
      } else {
        ergebnis.fehler.push(
          `${status ?? "?"}: ${(fehler as Error)?.message ?? "unbekannt"}`);
      }
    }
  }));

  return ergebnis;
}
