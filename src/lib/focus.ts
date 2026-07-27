/* ============================================================
   Fokus-Sitzungen
   ------------------------------------------------------------
   Eine Sitzung beginnt, wenn eine Kachel geöffnet wird, und bleibt
   offen, bis sie bestätigt oder verworfen wird. Es gibt bewusst kein
   Verfallsdatum: auch eine Sitzung von vorgestern wird noch gefragt.
   ============================================================ */

export const MINUTES_PER_DAY = 1440;

/** Vergangene Minuten seit dem Start, nie negativ. */
export function elapsedMinutes(startedAt: string, now: Date = new Date()): number {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 60000));
}

/** "2 h 15 min" · "45 min" · "1 Tag 3 h" */
export function humanDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const days = Math.floor(m / MINUTES_PER_DAY);
  const hours = Math.floor((m % MINUTES_PER_DAY) / 60);
  const rest = m % 60;
  if (days > 0) {
    return hours > 0
      ? `${days} ${days === 1 ? "Tag" : "Tage"} ${hours} h`
      : `${days} ${days === 1 ? "Tag" : "Tage"}`;
  }
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export interface PlannedEntry {
  entry_date: string;
  start_minute: number;
  minutes: number;
  /** Wurde die Dauer gekürzt, weil der Tag zu Ende war? */
  capped: boolean;
}

/**
 * Wandelt Startzeitpunkt und Dauer in einen Zeiteintrag um.
 * Ein Eintrag gehört immer zu genau einem Tag — was über Mitternacht
 * hinausragt, wird gekappt statt still auf zwei Tage verteilt.
 */
export function plannedEntry(startedAt: string, minutes: number): PlannedEntry {
  const start = new Date(startedAt);
  const startMinute = start.getHours() * 60 + start.getMinutes();
  const room = MINUTES_PER_DAY - startMinute;
  const wanted = Math.max(1, Math.round(minutes));
  const final = Math.min(wanted, room);

  return {
    entry_date: toISODate(start),
    start_minute: startMinute,
    minutes: final,
    capped: final < wanted,
  };
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Uhrzeit des Starts, für die Anzeige. */
export function startLabel(startedAt: string, now: Date = new Date()): string {
  const d = new Date(startedAt);
  const sameDay = toISODate(d) === toISODate(now);
  const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `heute ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (toISODate(d) === toISODate(yesterday)) return `gestern ${time}`;

  return `${d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })} ${time}`;
}

/** Vorschlagswerte für die Schnellauswahl in der Rückfrage. */
export function quickDurations(elapsed: number): number[] {
  const base = [15, 30, 45, 60, 90, 120, 180, 240];
  const options = base.filter((m) => m < elapsed);
  if (elapsed > 0 && !options.includes(elapsed)) options.push(elapsed);
  return options.slice(-5);
}
