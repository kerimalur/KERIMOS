/* ============================================================
   Ziele
   ------------------------------------------------------------
   Die Ampel vergleicht nicht den absoluten Fortschritt, sondern den
   Fortschritt mit der verstrichenen Zeit. Ein Ziel bei 40 % ist grün,
   wenn erst ein Drittel der Frist um ist — und rot, wenn morgen
   Abgabe wäre.
   ============================================================ */

export type GoalTone = "good" | "warn" | "bad" | "neutral" | "done";

export interface GoalStanding {
  /** Anteil des Ziels, der erreicht ist (0–1, kann über 1 gehen). */
  share: number;
  /** Anteil der Frist, der verstrichen ist (0–1). Null ohne Zieldatum. */
  timeShare: number | null;
  /** Vorsprung oder Rückstand in Prozentpunkten. */
  delta: number | null;
  tone: GoalTone;
  /** Verbleibende Tage bis zum Zieldatum. */
  daysLeft: number | null;
  /** Was pro Woche nötig wäre, um die Frist noch zu halten. */
  neededPerWeek: number | null;
}

export function goalStanding(
  progress: number,
  target: number | null,
  startDate: string,
  targetDate: string | null,
  status: string,
  today: Date = new Date()
): GoalStanding {
  const share = target && target > 0 ? progress / target : 0;

  if (status === "done") {
    return { share: Math.max(share, 1), timeShare: null, delta: null,
             tone: "done", daysLeft: null, neededPerWeek: null };
  }

  if (!targetDate) {
    return { share, timeShare: null, delta: null,
             tone: "neutral", daysLeft: null, neededPerWeek: null };
  }

  const start = dayStart(startDate);
  const end = dayStart(targetDate);
  const now = dayStart(toISODate(today));

  const total = Math.max(1, (end - start) / 86400000);
  const elapsed = (now - start) / 86400000;
  const timeShare = clamp(elapsed / total, 0, 1);
  const daysLeft = Math.ceil((end - now) / 86400000);

  const remaining = target ? Math.max(0, target - progress) : 0;
  const weeksLeft = Math.max(daysLeft, 0) / 7;
  const neededPerWeek =
    target && remaining > 0 ? (weeksLeft > 0 ? remaining / weeksLeft : remaining) : 0;

  const delta = (share - timeShare) * 100;

  let tone: GoalTone;
  if (share >= 1) tone = "done";
  else if (daysLeft < 0) tone = "bad";
  else if (delta >= -5) tone = "good";
  else if (delta >= -20) tone = "warn";
  else tone = "bad";

  return { share, timeShare, delta, tone, daysLeft, neededPerWeek };
}

export const TONE_LABEL: Record<GoalTone, string> = {
  good: "im Plan",
  warn: "leicht hinten",
  bad: "im Rückstand",
  neutral: "ohne Frist",
  done: "erreicht",
};

/** Formatiert den Fortschritt je nach Zielart. */
export function formatProgress(kind: string, value: number, unit: string | null): string {
  if (kind === "financial") {
    return new Intl.NumberFormat("de-CH", {
      style: "currency", currency: "CHF", maximumFractionDigits: 0,
    }).format(value);
  }
  if (kind === "time") {
    return `${value.toFixed(1).replace(".", ",")} h`;
  }
  return unit ? `${value} ${unit}` : String(value);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function dayStart(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
