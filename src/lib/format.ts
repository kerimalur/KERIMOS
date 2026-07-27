export const CHF = new Intl.NumberFormat("de-CH", {
  style: "currency", currency: "CHF", maximumFractionDigits: 0,
});
export const CHF2 = new Intl.NumberFormat("de-CH", {
  style: "currency", currency: "CHF", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export const NUM = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });

export const chf = (n: number | null | undefined) => CHF.format(n ?? 0);
export const chf2 = (n: number | null | undefined) => CHF2.format(n ?? 0);
export const num = (n: number | null | undefined) => NUM.format(n ?? 0);

export function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function monthLabel(iso: string) {
  const d = new Date(iso + (iso.length === 7 ? "-01" : ""));
  return d.toLocaleDateString("de-CH", { month: "short", year: "2-digit" });
}

export function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date.getTime());
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Monatsende korrekt behandeln (31.01. + 1 Monat -> 28./29.02.)
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, daysInTarget));
  return d;
}

/** Formatiert eine Monatszahl als "2 Jahre 4 Monate". */
export function monthsToHuman(months: number) {
  if (!isFinite(months)) return "unbegrenzt";
  const total = Math.floor(months);
  const y = Math.floor(total / 12);
  const m = total % 12;
  if (y === 0) return `${m} ${m === 1 ? "Monat" : "Monate"}`;
  if (m === 0) return `${y} ${y === 1 ? "Jahr" : "Jahre"}`;
  return `${y} ${y === 1 ? "Jahr" : "Jahre"} ${m} ${m === 1 ? "Monat" : "Monate"}`;
}
