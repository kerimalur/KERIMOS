import type { TimeEntry } from "./types";

export interface PlacedBlock<T> {
  entry: T;
  /** Minuten seit Mitternacht. */
  start: number;
  end: number;
  /** Spalte innerhalb einer Überlappungsgruppe und deren Breite. */
  column: number;
  columns: number;
}

/** "08:30" aus 510 */
export function minuteToTime(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinute(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return total >= 0 && total <= 1439 ? total : null;
}

/**
 * Ordnet Einträge mit Uhrzeit nebeneinander an, wenn sie sich überschneiden —
 * so wie es ein Kalender tut. Einträge ohne Uhrzeit gehören nicht hierher.
 */
export function layoutDay<T extends { minutes: number; start_minute: number | null }>(
  entries: T[]
): PlacedBlock<T>[] {
  const timed = entries
    .filter((e) => e.start_minute !== null)
    .map((e) => ({
      entry: e,
      start: e.start_minute as number,
      end: Math.min(1440, (e.start_minute as number) + e.minutes),
      column: 0,
      columns: 1,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  // Überlappende Blöcke zu Gruppen bündeln
  let group: PlacedBlock<T>[] = [];
  let groupEnd = -1;
  const result: PlacedBlock<T>[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const columnEnds: number[] = [];
    for (const block of group) {
      let col = columnEnds.findIndex((end) => end <= block.start);
      if (col === -1) { col = columnEnds.length; columnEnds.push(0); }
      columnEnds[col] = block.end;
      block.column = col;
    }
    for (const block of group) block.columns = columnEnds.length;
    result.push(...group);
    group = [];
    groupEnd = -1;
  };

  for (const block of timed) {
    if (group.length > 0 && block.start >= groupEnd) flush();
    group.push(block);
    groupEnd = Math.max(groupEnd, block.end);
  }
  flush();

  return result;
}

/** Sinnvoller Stundenausschnitt: eng genug zum Lesen, weit genug für alles Erfasste. */
export function hourRange(
  blocks: { start: number; end: number }[],
  fallback: [number, number] = [6, 23]
): [number, number] {
  if (blocks.length === 0) return fallback;
  const first = Math.floor(Math.min(...blocks.map((b) => b.start)) / 60);
  const last = Math.ceil(Math.max(...blocks.map((b) => b.end)) / 60);
  return [Math.max(0, Math.min(first, fallback[0])), Math.min(24, Math.max(last, fallback[1]))];
}

export type EntryWithStart = TimeEntry;
