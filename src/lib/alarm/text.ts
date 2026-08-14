import { ART_EMOJI, type Alarmart } from "./regeln";

/**
 * Wie eine Meldung aussieht — und wie ihr Ergebnis in einen Satz passt.
 *
 * Bewusst ohne `server-only`, ohne Datenbank, ohne `fetch`: dadurch lässt
 * sich die Textbildung mit `tools/checks/alarm-regeln.mts` prüfen, ohne dass
 * eine Nachricht auf dem Handy landet. Das Verschicken selbst steht in
 * `versand.ts`, die Telegram-Anbindung in `kanaele.ts`.
 */

export interface Meldung {
  art: Alarmart | "test";
  titel: string;
  text: string;
  pair?: string;
  /** Relatives Ziel beim Antippen. Standard: /trading */
  url?: string;
  /** Gleicher tag = neue Push-Meldung ersetzt die alte, statt zu stapeln. */
  tag?: string;
  /** Push bleibt liegen, bis weggewischt. */
  wichtig?: boolean;
}

export interface VersandErgebnis {
  /** Kein Kanal hat es versucht — mit Grund. Null = es wurde gesendet. */
  unterdrueckt: string | null;
  push: { versucht: boolean; gesendet: number; entfernt: number; fehler: string[] };
  telegram: { versucht: boolean; ok: boolean; fehler: string | null };
  /** Einzeiler für Cron-Antwort und Oberfläche. */
  zeile: string;
}

/**
 * Für `parse_mode: "HTML"`. Telegram verlangt genau diese drei Zeichen
 * maskiert; alles Weitere (Anführungszeichen, Apostrophe) darf roh bleiben
 * und sähe maskiert nur hässlich aus.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram-Text: Titel fett, Text darunter, am Ende der Sprung in KerimOS. */
export function baueTelegramText(m: Meldung, basis: string | null): string {
  const kopf = `${ART_EMOJI[m.art]} <b>${escapeHtml(m.titel)}</b>`;
  const koerper = escapeHtml(m.text);
  if (!basis) return `${kopf}\n${koerper}`;

  const ziel = m.url ?? "/trading";
  const pfad = ziel.startsWith("/") ? ziel : `/${ziel}`;
  return `${kopf}\n${koerper}\n\n<a href="${basis}${pfad}">In KerimOS öffnen</a>`;
}

/** Eine Zeile fürs Cron-Protokoll — sagt auch, wenn nichts passiert ist. */
export function fasseZusammen(m: Meldung, e: VersandErgebnis): string {
  if (e.unterdrueckt) return `${m.pair ?? m.art}: nicht gesendet (${e.unterdrueckt})`;

  const teile: string[] = [];
  if (e.push.versucht) {
    teile.push(e.push.gesendet > 0
      ? `Push an ${e.push.gesendet} Gerät(e)`
      : `Push nichts (${e.push.fehler.join(" · ") || "kein Gerät angemeldet"})`);
  }
  if (e.telegram.versucht) {
    teile.push(e.telegram.ok ? "Telegram ok" : `Telegram fehlgeschlagen (${e.telegram.fehler})`);
  }
  return `${m.pair ?? m.art} ${m.art}: ${teile.join(" · ") || "kein Kanal"}`;
}

/** Ging irgendwo etwas durch? Für den Testknopf die einzig relevante Frage. */
export function irgendwoAngekommen(e: VersandErgebnis): boolean {
  return e.push.gesendet > 0 || e.telegram.ok;
}
