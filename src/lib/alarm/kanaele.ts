import "server-only";
// Die Textbildung liegt bewusst daneben und ohne server-only, damit sie
// sich ohne laufenden Server prüfen lässt.
export { escapeHtml } from "./text";

/**
 * Telegram als zweiter Alarmkanal neben Web-Push.
 *
 * Warum überhaupt zwei: Web-Push hängt am Browser. Wird die installierte App
 * vom Handy geräumt, die Berechtigung entzogen oder der Push-Dienst
 * gedrosselt, schweigt sie — und man merkt es nicht, weil ein ausbleibender
 * Alarm wie „nichts los" aussieht. Telegram hat diese Fehlerquellen nicht und
 * gibt bei jedem Versuch eine Antwort zurück, die man lesen kann.
 *
 * Bot-Token und Chat-ID sind dieselben wie im GVA-Screener-Backend
 * (`Backend/main.py::send_telegram_alert`): TELEGRAM_BOT_TOKEN und
 * TELEGRAM_CHAT_ID. Der Screener kann sie behalten — zwei Absender am selben
 * Bot stören sich nicht.
 */

export function telegramKonfiguriert(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

/** Chat-ID: Einstellung schlägt Umgebung. Null = nicht sendefähig. */
export function chatIdFuer(ausEinstellungen: string | null): string | null {
  return ausEinstellungen?.trim() || process.env.TELEGRAM_CHAT_ID?.trim() || null;
}

/** Basis-URL für Deep-Links. Ohne Vercel-Variablen bleibt der Link weg. */
export function basisUrl(): string | null {
  const eigen = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (eigen) return eigen.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

export interface KanalErgebnis {
  ok: boolean;
  /** Klartext, direkt anzeigbar. Null bei Erfolg. */
  fehler: string | null;
}

/**
 * Eine Nachricht an Telegram. Der Text darf HTML enthalten (<b>, <a href>),
 * der Aufrufer ist fürs Maskieren zuständig — siehe `escapeHtml`.
 *
 * Fehler werden übersetzt statt durchgereicht: Telegram antwortet bei einer
 * falschen Chat-ID mit HTTP 400 und `"chat not found"`, was ohne Einordnung
 * niemandem sagt, wo man nachsehen muss.
 */
export async function sendeTelegram(
  text: string, chatId: string | null,
): Promise<KanalErgebnis> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, fehler: "TELEGRAM_BOT_TOKEN fehlt in den Umgebungsvariablen." };
  }
  if (!chatId) {
    return { ok: false, fehler: "Keine Chat-ID — weder in den Einstellungen noch als TELEGRAM_CHAT_ID." };
  }

  try {
    // 8 Sekunden: der Cron-Lauf hat insgesamt 30 (maxDuration), und ein
    // hängender Telegram-Aufruf darf nicht die Preis-Alarme mitreissen.
    const antwort = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        // Die Vorschaukarte würde jede Meldung um einen halben Bildschirm
        // verlängern, obwohl der Link nur ein Sprungziel ist.
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    const daten = await antwort.json().catch(() => null) as
      { ok?: boolean; description?: string; parameters?: { retry_after?: number } } | null;

    if (antwort.ok && daten?.ok) return { ok: true, fehler: null };

    const grund = daten?.description ?? `HTTP ${antwort.status}`;
    if (antwort.status === 401) {
      return { ok: false, fehler: "Bot-Token wird abgelehnt (401). Steht TELEGRAM_BOT_TOKEN vollständig in Vercel?" };
    }
    if (antwort.status === 400 && /chat not found/i.test(grund)) {
      return {
        ok: false,
        fehler: "Chat nicht gefunden. Dem Bot muss einmal /start geschickt worden sein, und die Chat-ID muss zu diesem Bot gehören.",
      };
    }
    if (antwort.status === 403) {
      return { ok: false, fehler: "Der Bot darf in diesen Chat nicht schreiben (403) — blockiert oder nie gestartet." };
    }
    if (antwort.status === 429) {
      const s = daten?.parameters?.retry_after;
      return { ok: false, fehler: `Telegram drosselt${s ? `, in ${s} s wieder` : ""}.` };
    }
    return { ok: false, fehler: `Telegram: ${grund}` };
  } catch (fehler: unknown) {
    const name = (fehler as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, fehler: "Telegram hat nicht innerhalb von 8 s geantwortet." };
    }
    return { ok: false, fehler: `Telegram nicht erreichbar: ${(fehler as Error)?.message ?? "unbekannt"}` };
  }
}

/**
 * Prüft Token und Chat-ID, ohne eine Nachricht zu schicken (`getChat`).
 *
 * Nützlich für die Einstellungsseite: sie kann „verbunden mit <Name>" zeigen,
 * ohne dass bei jedem Seitenaufruf eine Nachricht auf dem Handy landet.
 */
export async function pruefeTelegram(chatId: string | null): Promise<{
  ok: boolean; titel: string | null; fehler: string | null;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, titel: null, fehler: "TELEGRAM_BOT_TOKEN fehlt." };
  if (!chatId) return { ok: false, titel: null, fehler: "Keine Chat-ID hinterlegt." };

  try {
    const antwort = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`,
      { signal: AbortSignal.timeout(5000), cache: "no-store" },
    );
    const daten = await antwort.json().catch(() => null) as
      { ok?: boolean; description?: string;
        result?: { title?: string; username?: string; first_name?: string } } | null;

    if (!antwort.ok || !daten?.ok) {
      return { ok: false, titel: null, fehler: daten?.description ?? `HTTP ${antwort.status}` };
    }
    const r = daten.result ?? {};
    return {
      ok: true,
      titel: r.title ?? r.username ?? r.first_name ?? chatId,
      fehler: null,
    };
  } catch (fehler: unknown) {
    return { ok: false, titel: null, fehler: (fehler as Error)?.message ?? "nicht erreichbar" };
  }
}
