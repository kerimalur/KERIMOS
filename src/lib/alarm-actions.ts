"use server";
import { revalidatePath } from "next/cache";
import { ausFormular } from "@/lib/alarm/regeln";
import { createClient } from "@/lib/supabase/server";
import { createTradingClient } from "@/lib/supabase/trading";
import { ALARMARTEN } from "@/lib/alarm/regeln";
import type { Alarmart } from "@/lib/alarm/regeln";
import { ladeEinstellungen, speichereEinstellungen } from "@/lib/alarm/einstellungen";
import { verschicke, irgendwoAngekommen } from "@/lib/alarm/versand";
import { pruefeTelegram, chatIdFuer, telegramKonfiguriert } from "@/lib/alarm/kanaele";
import { heuteISO, heuteMinuten } from "@/lib/time";
// Typ und Leerwert liegen bewusst ausserhalb: eine "use server"-Datei darf
// nur async Funktionen exportieren.
import type { AktionsErgebnis } from "@/lib/alarm/ergebnis";

/**
 * Server Actions der Alarm-Einstellungen.
 *
 * Eigene Datei statt `actions.ts`: die ist mit 139 Aktionen ohnehin zu gross
 * (siehe TRADING-UMBAU.md, Befund 3), und jede `"use server"`-Datei wird als
 * Ganzes geladen, sobald eine ihrer Aktionen gebraucht wird.
 */

export async function speichereAlarmEinstellungen(
  _vorher: AktionsErgebnis, formData: FormData,
): Promise<AktionsErgebnis> {
  const werte = ausFormular((name) => {
    const wert = formData.get(name);
    return typeof wert === "string" ? wert : null;
  });

  const fehler = await speichereEinstellungen(werte);
  if (fehler) return { ok: false, text: fehler, stempel: Date.now() };

  revalidatePath("/trading/alarme/einstellungen");
  revalidatePath("/trading/alarme");

  const kanaele = [werte.push_an && "Push", werte.telegram_an && "Telegram"]
    .filter(Boolean).join(" + ") || "kein Kanal";
  return {
    ok: true,
    text: `Gespeichert. Aktiv: ${kanaele}. Arten: ${werte.arten.length > 0 ? werte.arten.join(", ") : "keine"}.`,
    stempel: Date.now(),
  };
}

/**
 * Testmeldung über die eingeschalteten Kanäle.
 *
 * Nimmt bewusst die gespeicherten Einstellungen, nicht die im Formular
 * stehenden: getestet werden soll die Kette, die nachts tatsächlich läuft.
 * Wer erst etwas ändert, muss vorher speichern — die Oberfläche sagt das.
 */
export async function sendeAlarmTest(
  _vorher: AktionsErgebnis, _formData: FormData,
): Promise<AktionsErgebnis> {
  const { werte, hinweis } = await ladeEinstellungen();

  const ergebnis = await verschicke({
    art: "test",
    titel: "KerimOS — Testmeldung",
    text: "Wenn du das liest, steht die Kette: Cron → KerimOS → Handy. "
      + `Gesendet um ${new Intl.DateTimeFormat("de-CH", {
        timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit",
      }).format(new Date())} Uhr.`,
    url: "/trading/alarme/einstellungen",
    tag: "kerimos-test",
  }, werte, { jetztMinuten: heuteMinuten(), heute: heuteISO() });

  const teile: string[] = [];
  if (ergebnis.unterdrueckt) {
    return {
      ok: false,
      text: `Nichts gesendet: ${ergebnis.unterdrueckt}.`,
      stempel: Date.now(),
    };
  }
  if (ergebnis.push.versucht) {
    teile.push(ergebnis.push.gesendet > 0
      ? `Push an ${ergebnis.push.gesendet} Gerät(e)`
      : `Push nichts (${ergebnis.push.fehler.join(" · ") || "kein Gerät angemeldet"})`);
  }
  if (ergebnis.telegram.versucht) {
    teile.push(ergebnis.telegram.ok ? "Telegram zugestellt" : `Telegram: ${ergebnis.telegram.fehler}`);
  }
  if (ergebnis.push.entfernt > 0) {
    teile.push(`${ergebnis.push.entfernt} tote Anmeldung(en) entfernt`);
  }
  if (hinweis) teile.push(hinweis);

  return {
    ok: irgendwoAngekommen(ergebnis),
    text: teile.join(" · "),
    stempel: Date.now(),
  };
}

/**
 * Verbindung prüfen, ohne eine Nachricht zu schicken.
 *
 * Beantwortet die Frage „stimmen Token und Chat-ID?" getrennt von „kommt die
 * Nachricht an?". Ohne diese Trennung sucht man bei einem stummen Handy an
 * drei Stellen gleichzeitig.
 */
export async function pruefeTelegramVerbindung(
  _vorher: AktionsErgebnis, formData: FormData,
): Promise<AktionsErgebnis> {
  if (!telegramKonfiguriert()) {
    return {
      ok: false,
      stempel: Date.now(),
      text: "TELEGRAM_BOT_TOKEN fehlt in Vercel. Der Wert steht schon im Screener-Backend auf Render und kann von dort übernommen werden.",
    };
  }

  // Das Feld aus dem Formular schlägt die gespeicherte Einstellung: so lässt
  // sich eine neue Chat-ID prüfen, bevor man sie speichert.
  const ausFeld = formData.get("telegram_chat_id");
  const gespeichert = (await ladeEinstellungen()).werte.telegram_chat_id;
  const chatId = chatIdFuer(
    (typeof ausFeld === "string" && ausFeld.trim()) ? ausFeld.trim() : gespeichert,
  );

  const geprueft = await pruefeTelegram(chatId);
  return geprueft.ok
    ? { ok: true, text: `Verbunden mit „${geprueft.titel}" (Chat ${chatId}).`, stempel: Date.now() }
    : { ok: false, text: `Keine Verbindung: ${geprueft.fehler}`, stempel: Date.now() };
}

/* ------------------------------------------ Stumm schalten (27.08.2026) */

/**
 * Alarme von Hand stumm schalten oder wieder scharf machen.
 *
 * **Stumm = eine Sperrzeile schreiben.** Genau dieselbe Zeile, die nach einem
 * Versand entsteht. Eine eigene Spalte `stumm` wäre eine zweite Wahrheit
 * darüber, ob etwas rausgeht — und zwei Wahrheiten über dieselbe Frage sind
 * der Fehler, den dieses Projekt an mehreren Stellen aufgeräumt hat.
 *
 * **Scharf = die Sperrzeile löschen.** Danach meldet die Linie beim nächsten
 * Treffer wieder, einmalig.
 */

async function alarmZugang() {
  const kerimos = await createClient();
  const { data: wer } = await kerimos.auth.getUser();
  if (!wer.user) throw new Error("Nicht angemeldet.");

  const db = createTradingClient();
  if (!db) throw new Error("Trading-Datenbank nicht verbunden.");
  return db;
}

function liesAlarm(fd: FormData): { id: string; art: Alarmart } | null {
  const id = String(fd.get("id") ?? "").trim();
  const art = String(fd.get("art") ?? "").trim() as Alarmart;
  if (!id || !(ALARMARTEN as readonly string[]).includes(art)) return null;
  return { id, art };
}

function alarmNeuLaden() {
  revalidatePath("/einstellungen/trading");
  revalidatePath("/trading");
}

export async function alarmStumm(fd: FormData) {
  const w = liesAlarm(fd);
  if (!w) return;
  const db = await alarmZugang();
  // `ignoreDuplicates`: zweimal stumm schalten ist kein Fehler, sondern
  // derselbe Wunsch noch einmal.
  await db.from("alarm_log")
    .upsert({ watchlist_id: w.id, art: w.art, tag: heuteISO() },
      { onConflict: "watchlist_id,art,tag", ignoreDuplicates: true });
  alarmNeuLaden();
}

export async function alarmScharf(fd: FormData) {
  const w = liesAlarm(fd);
  if (!w) return;
  const db = await alarmZugang();
  await db.from("alarm_log").delete().eq("watchlist_id", w.id).eq("art", w.art);
  alarmNeuLaden();
}
