/**
 * Die Rechenteile hinter „Push oder Pull antippen".
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit
 * `tools/checks/schnell-training.mts`.
 */

/** Wie weit zurück nachgetragen werden darf. */
export const NACHTRAG_TAGE = 7;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const minusTage = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/**
 * Welches Datum der Eintrag bekommt.
 *
 * Alles Unklare fällt auf heute zurück, statt abgelehnt zu werden: der Knopf
 * soll immer etwas eintragen. Aber nicht irgendwohin — ein Datum in der
 * Zukunft oder weiter als eine Woche zurück wäre ein Tippfehler oder ein
 * manipuliertes Formularfeld, und eine Einheit im Jahr 2019 findet nie
 * jemand wieder.
 */
export function erlaubtesDatum(roh: unknown, heute: string): string {
  const s = typeof roh === "string" ? roh.slice(0, 10) : "";
  if (!ISO.test(s)) return heute;
  if (s > heute) return heute;
  if (s < minusTage(heute, NACHTRAG_TAGE)) return heute;
  return s;
}

/** Zeitzone, in der Kerim lebt — dieselbe Konstante wie in `lib/time.ts`. */
export const ZONE = "Europe/Zurich";

/**
 * Wie viele Minuten die Zone zu diesem Zeitpunkt vor UTC liegt.
 *
 * Über `Intl` statt über eine feste Zahl: die Schweiz steht im Winter +1 und
 * im Sommer +2. Eine fest verdrahtete Verschiebung wäre ein halbes Jahr lang
 * richtig und ein halbes Jahr lang eine Stunde daneben.
 */
export function zonenVersatz(ms: number, zone = ZONE): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));

  const w = (art: string) => Number(teile.find((t) => t.type === art)?.value ?? 0);
  // `hour` kann 24 sein, wenn Mitternacht als "24" formatiert wird.
  const alsZone = Date.UTC(w("year"), w("month") - 1, w("day"),
    w("hour") % 24, w("minute"), w("second"));
  return (alsZone - ms) / 60000;
}

/**
 * Datum und Uhrzeit aus dem Formular in einen UTC-Zeitstempel.
 *
 * Kerim tippt „gestern, 19:30" — gemeint ist halb acht **bei ihm**, nicht in
 * London. Erst wird die Eingabe naiv als UTC gelesen, dann der Versatz der
 * Zone zu genau diesem Zeitpunkt abgezogen.
 *
 * Ungültige Uhrzeit heisst: Mittag. Das ist der Wert, der in jeder Zeitzone
 * von −11 bis +11 auf demselben Tag bleibt (siehe `zeitstempel`).
 */
export function ausDatumUndZeit(datum: string, zeit: unknown): string {
  const s = typeof zeit === "string" ? zeit.trim() : "";
  const hhmm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  const uhrzeit = hhmm ? `${hhmm[1]}:${hhmm[2]}` : "12:00";

  const naiv = Date.parse(`${datum}T${uhrzeit}:00Z`);
  if (!Number.isFinite(naiv)) return `${datum}T12:00:00.000Z`;
  return new Date(naiv - zonenVersatz(naiv) * 60000).toISOString();
}

/**
 * Der Zeitstempel für einen nachgetragenen Tag.
 *
 * Mittags UTC, nicht Mitternacht. Nicht wegen der Schweiz — die liegt VOR
 * UTC, dort würde aus Mitternacht 02:00 desselben Tages. Sondern weil Mittag
 * den grösstmöglichen Abstand zu beiden Tagesgrenzen hält: er bleibt bei
 * jedem Versatz von −11 bis +11 Stunden auf demselben Tag. Mitternacht UTC
 * rutscht dagegen westlich von Greenwich sofort einen Tag zurück.
 */
export function zeitstempel(datum: string, heute: string, jetzt: string): string {
  return datum === heute ? jetzt : `${datum}T12:00:00.000Z`;
}

/** „Push" oder „Pull" — alles andere ist kein gültiger Knopf. */
export function istSplit(v: unknown): v is "push" | "pull" {
  return v === "push" || v === "pull";
}
