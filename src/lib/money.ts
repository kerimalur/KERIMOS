import { INTERVAL_TO_MONTHLY, type RecurrenceInterval } from "./types";

/** Rechnet den Betrag eines wiederkehrenden Postens auf einen Monat um. */
export function monthlyEquivalent(amount: number, interval: RecurrenceInterval) {
  return amount * INTERVAL_TO_MONTHLY[interval];
}

/** Summe aller aktiven monatlichen Fixkosten (als positive Zahl). */
export function sumMonthlyFixed(
  items: { amount: number; interval: RecurrenceInterval; active: boolean }[]
) {
  return items
    .filter((i) => i.active && i.amount < 0)
    .reduce((acc, i) => acc + Math.abs(monthlyEquivalent(i.amount, i.interval)), 0);
}
