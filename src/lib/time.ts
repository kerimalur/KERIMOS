import { BUCKET_ORDER, BUCKET_COLOR, BUCKET_LABEL, UNACCOUNTED_COLOR } from "./types";
import type { DailyTime, TimeBucket, WeeklyBucket } from "./types";

export const MINUTES_PER_DAY = 1440;

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
  const kurz = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short" })
    .format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(kurz);
}

/** Aktuelle Uhrzeit in Zürich als Minuten seit Mitternacht. */
export function heuteMinuten(): number {
  const [h, m] = new Intl.DateTimeFormat("de-CH", {
    timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date()).split(":").map(Number);
  return h * 60 + m;
}

/** "3 h 30 min" · "45 min" · "8 h" */
export function fmtMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  if (rest === 0) return `${h} h`;
  return `${h} h ${rest} min`;
}

/** "3.5 h" - kompakt für Tabellen. */
export function fmtHours(minutes: number): string {
  return `${(Math.max(0, minutes) / 60).toFixed(1).replace(".", ",")} h`;
}

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

export function dayName(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("de-CH", { weekday: "long" });
}

export function dayNameShort(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("de-CH", { weekday: "short" });
}

export function weekLabel(weekStartISO: string): string {
  const start = new Date(weekStartISO + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const f = (d: Date) =>
    d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
  return `${f(start)} – ${f(end)}`;
}

/* ------------------------------------------------------ Tages-Zusammensetzung */

export interface Segment {
  key: TimeBucket | "schlaf" | "unerfasst";
  label: string;
  minutes: number;
  color: string;
}

/**
 * Zerlegt einen Tag in 24 Stunden: Schlaf, die erfassten Lebensbereiche und
 * das, was übrig bleibt. Genau dieser Rest ist die Frage, um die es geht.
 */
export function dayComposition(day: DailyTime, defaultSleepHours = 8): Segment[] {
  const sleepMinutes = Math.round((day.sleep_hours ?? defaultSleepHours) * 60);
  const segments: Segment[] = [
    { key: "schlaf", label: "Schlaf", minutes: sleepMinutes, color: "#EDE7D9" },
  ];

  for (const bucket of BUCKET_ORDER) {
    const minutes = bucketMinutes(day, bucket);
    if (minutes > 0) {
      segments.push({
        key: bucket, label: BUCKET_LABEL[bucket], minutes, color: BUCKET_COLOR[bucket],
      });
    }
  }

  const waking = MINUTES_PER_DAY - sleepMinutes;
  const unaccounted = Math.max(0, waking - day.logged_minutes);
  if (unaccounted > 0) {
    segments.push({
      key: "unerfasst", label: "Unerfasst", minutes: unaccounted, color: UNACCOUNTED_COLOR,
    });
  }
  return segments;
}

export function bucketMinutes(day: DailyTime, bucket: TimeBucket): number {
  const map: Record<TimeBucket, number> = {
    ziel: day.ziel_minutes,
    arbeit: day.arbeit_minutes,
    pflicht: day.pflicht_minutes,
    regeneration: day.regeneration_minutes,
    sozial: day.sozial_minutes,
    spass: day.spass_minutes,
    leerlauf: day.leerlauf_minutes,
  };
  return Number(map[bucket] ?? 0);
}

/** Erfasste Zeit übersteigt die Wachzeit - dann stimmt etwas nicht. */
export function isOverfilled(day: DailyTime, defaultSleepHours = 8): boolean {
  const sleepMinutes = Math.round((day.sleep_hours ?? defaultSleepHours) * 60);
  return day.logged_minutes > MINUTES_PER_DAY - sleepMinutes;
}

/* ------------------------------------------------------ Wochen-Auswertung */

export interface WeekSummary {
  totalLogged: number;
  totalWaking: number;
  totalUnaccounted: number;
  byBucket: { bucket: TimeBucket; minutes: number; share: number }[];
  /** Anteil der Wachzeit, der auf Ziele einzahlt. */
  goalShare: number;
  daysWithData: number;
}

export function summarizeWeek(
  days: DailyTime[],
  weeklyBuckets: WeeklyBucket[] = []
): WeekSummary {
  const totalLogged = days.reduce((s, d) => s + Number(d.logged_minutes), 0);
  const totalWaking = days.reduce((s, d) => s + Number(d.waking_minutes), 0);
  const totalUnaccounted = days.reduce((s, d) => s + Number(d.unaccounted_minutes), 0);

  const fromBuckets = new Map<TimeBucket, number>();
  for (const wb of weeklyBuckets) {
    fromBuckets.set(wb.bucket, (fromBuckets.get(wb.bucket) ?? 0) + Number(wb.minutes));
  }
  // Fallback: aus den Tageszeilen aggregieren, falls keine Wochen-View übergeben wurde
  if (fromBuckets.size === 0) {
    for (const bucket of BUCKET_ORDER) {
      const sum = days.reduce((s, d) => s + bucketMinutes(d, bucket), 0);
      if (sum > 0) fromBuckets.set(bucket, sum);
    }
  }

  const base = totalWaking > 0 ? totalWaking : totalLogged;
  const byBucket = BUCKET_ORDER
    .map((bucket) => {
      const minutes = fromBuckets.get(bucket) ?? 0;
      return { bucket, minutes, share: base > 0 ? minutes / base : 0 };
    })
    .filter((b) => b.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const goalMinutes = fromBuckets.get("ziel") ?? 0;

  return {
    totalLogged, totalWaking, totalUnaccounted, byBucket,
    goalShare: base > 0 ? goalMinutes / base : 0,
    daysWithData: days.length,
  };
}

export function pct(share: number): string {
  return `${Math.round(share * 100)} %`;
}

/** Übliche Schnellwahl-Dauern im Check-in. */
export const QUICK_MINUTES = [15, 30, 45, 60, 90, 120, 180, 240, 480];
