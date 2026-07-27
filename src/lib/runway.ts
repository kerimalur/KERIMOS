import { addMonths } from "./format";
import type { RunwayInputs } from "./types";

export interface ScenarioParams {
  /** Faktor auf das Arbeitseinkommen. 1 = unverändert, 0.6 = Pensum auf 60 %. */
  incomeFactor: number;
  /** Zusätzliche (positiv) oder wegfallende (negativ) monatliche Ausgaben in CHF. */
  expenseDeltaMonthly: number;
  /** Einmalige Zusatzkosten in CHF, sofort abgezogen. */
  oneOffCost: number;
  /**
   * Fester Monatswert statt des errechneten Durchschnitts. Nötig, weil in den
   * Kontodaten auch Rückzahlungen von Kollegen und Bareinzahlungen als
   * Gutschrift erscheinen - der Durchschnitt liegt dadurch über dem echten Lohn.
   */
  incomeOverride?: number | null;
  expenseOverride?: number | null;
}

export const NEUTRAL_SCENARIO: ScenarioParams = {
  incomeFactor: 1, expenseDeltaMonthly: 0, oneOffCost: 0,
  incomeOverride: null, expenseOverride: null,
};

export type ExpenseBasis = "transactions" | "recurring" | "none";

export interface RunwayResult {
  /** Verfügbare Liquidität nach Abzug einmaliger Kosten. */
  liquid: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  /** Einkommen minus Ausgaben. Negativ = Kapitalverzehr. */
  netMonthly: number;
  /** null bedeutet: Einnahmen decken die Ausgaben, Runway ist unbegrenzt. */
  runwayMonths: number | null;
  depletionDate: Date | null;
  /** Welche Datengrundlage für die Ausgaben verwendet wurde. */
  expenseBasis: ExpenseBasis;
  /** Monatliches Einkommen, das nötig wäre, um bei null zu landen. */
  breakEvenIncome: number;
  projection: ProjectionPoint[];
}

export interface ProjectionPoint {
  /** ISO-Datum des Monatsanfangs. */
  month: string;
  balance: number;
}

/**
 * Berechnet den Runway.
 *
 * Grundlage sind die Durchschnittswerte der letzten vollen Monate. Liegen noch
 * keine Transaktionsdaten vor, wird auf die hinterlegten Fixkosten zurückgefallen,
 * damit die Zahl vom ersten Tag an stimmt.
 */
export function computeRunway(
  inputs: RunwayInputs,
  scenario: ScenarioParams = NEUTRAL_SCENARIO,
  horizonMonths = 120,
  from: Date = new Date()
): RunwayResult {
  const hasTxnExpenses = inputs.months_with_data > 0 && inputs.avg_expenses > 0;
  const expenseBasis: ExpenseBasis = hasTxnExpenses
    ? "transactions"
    : inputs.recurring_fixed > 0
      ? "recurring"
      : "none";

  const baseExpenses =
    scenario.expenseOverride != null
      ? scenario.expenseOverride
      : hasTxnExpenses ? inputs.avg_expenses : inputs.recurring_fixed;

  const baseIncome =
    scenario.incomeOverride != null ? scenario.incomeOverride : inputs.avg_income;

  const monthlyIncome = round2(Math.max(0, baseIncome * scenario.incomeFactor));
  const monthlyExpenses = round2(Math.max(0, baseExpenses + scenario.expenseDeltaMonthly));
  const netMonthly = round2(monthlyIncome - monthlyExpenses);

  const liquid = round2(inputs.liquid - scenario.oneOffCost);

  let runwayMonths: number | null;
  let depletionDate: Date | null = null;

  if (netMonthly >= 0) {
    runwayMonths = null;                       // unbegrenzt
  } else if (liquid <= 0) {
    runwayMonths = 0;
    depletionDate = new Date(from.getTime());
  } else {
    runwayMonths = round2(liquid / -netMonthly);
    depletionDate = addMonths(from, Math.floor(runwayMonths));
  }

  // Verlaufskurve
  const projection: ProjectionPoint[] = [];
  // Bei Überschuss reichen 36 Monate. Eine lineare Fortschreibung über fünf
  // Jahre suggeriert eine Genauigkeit, die es nicht gibt.
  const cap = runwayMonths === null
    ? Math.min(horizonMonths, 36)
    : Math.min(horizonMonths, Math.ceil(runwayMonths) + 2);

  let balance = liquid;
  for (let i = 0; i <= cap; i++) {
    const d = addMonths(from, i);
    projection.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      balance: round2(Math.max(balance, 0)),
    });
    balance += netMonthly;
    if (balance < 0 && netMonthly < 0) {
      const d2 = addMonths(from, i + 1);
      projection.push({
        month: `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-01`,
        balance: 0,
      });
      break;
    }
  }

  return {
    liquid, monthlyIncome, monthlyExpenses, netMonthly,
    runwayMonths, depletionDate, expenseBasis,
    breakEvenIncome: monthlyExpenses,
    projection,
  };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Wie lange reicht das Geld, wenn gar kein Einkommen mehr käme? */
export function zeroIncomeRunway(
  inputs: RunwayInputs, expenseOverride: number | null = null
): RunwayResult {
  return computeRunway(inputs, {
    incomeFactor: 0, expenseDeltaMonthly: 0, oneOffCost: 0,
    incomeOverride: null, expenseOverride,
  });
}
