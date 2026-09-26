/**
 * Zeitzone der App. Fix verdrahtet, weil KerimOS auf Vercel läuft und Node
 * dort in UTC rechnet: ohne diese Festlegung wäre zwischen Mitternacht und
 * zwei Uhr überall "heute" in Wahrheit gestern - auf dem Server, während der
 * Browser daneben korrekt rechnet.
 */
export const ZONE = "Europe/Zurich";

/** Heutiges Datum in Zürcher Zeit. "sv-SE" liefert direkt YYYY-MM-DD. */
export function heuteISO(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE }).format(new Date());
}

/** Heute plus/minus n Tage, ebenfalls in Zürcher Zeit. */
export function heutePlus(n: number): string {
  return addDays(heuteISO(), n);
}

/** Wochentag von heute in Zürcher Zeit: 0 = Sonntag, wie Date.getDay(). */
export function heuteWochentag(): number {
  return new Date(`${heuteISO()}T12:00:00Z`).getUTCDay();
}

/** Aktuelle Uhrzeit in Zürich als Minuten seit Mitternacht. */
export function heuteMinuten(): number {
  const [h, m] = new Intl.DateTimeFormat("de-CH", {
    timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date()).split(":").map(Number);
  return h * 60 + m;
}

/** "3 h 30 min" · "45 min" · "8 h" */

/** "3.5 h" - kompakt für Tabellen. */

/** Montag der Woche, in der das Datum liegt (ISO-Woche). */
export function weekStart(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date + "T12:00:00") : new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;          // Montag = 0
  d.setDate(d.getDate() - day);
  return toISODate(d);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function dayNameShort(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("de-CH", { weekday: "short" });
}

/* ------------------------------------------------------ Tages-Zusammensetzung */

/** Erfasste Zeit übersteigt die Wachzeit - dann stimmt etwas nicht. */

/* ------------------------------------------------------ Wochen-Auswertung */

/** Übliche Schnellwahl-Dauern im Check-in. */
