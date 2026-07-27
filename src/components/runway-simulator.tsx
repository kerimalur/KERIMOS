"use client";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { computeRunway, type ScenarioParams } from "@/lib/runway";
import { chf, monthLabel, monthsToHuman, dateLabel } from "@/lib/format";
import { Card, CardTitle, Button, Input, Label, Badge, cx } from "@/components/ui";
import { saveScenario, deleteScenario } from "@/lib/actions";
import type { RunwayInputs, Scenario } from "@/lib/types";

interface Preset {
  name: string;
  hint: string;
  params: ScenarioParams;
}

export function RunwaySimulator({
  inputs, saved,
}: {
  inputs: RunwayInputs;
  saved: Scenario[];
}) {
  const measuredExpenses = Math.round(
    inputs.months_with_data > 0 && inputs.avg_expenses > 0
      ? inputs.avg_expenses
      : inputs.recurring_fixed
  );
  const measuredIncome = Math.round(inputs.avg_income);

  const [incomeFactor, setIncomeFactor] = useState(1);
  const [expenseDelta, setExpenseDelta] = useState(0);
  const [oneOff, setOneOff] = useState(0);
  const [income, setIncome] = useState(measuredIncome);
  const [expenses, setExpenses] = useState(measuredExpenses);

  const params: ScenarioParams = {
    incomeFactor,
    expenseDeltaMonthly: expenseDelta,
    oneOffCost: oneOff,
    incomeOverride: income,
    expenseOverride: expenses,
  };

  const baseline = useMemo(
    () => computeRunway(inputs, {
      incomeFactor: 1, expenseDeltaMonthly: 0, oneOffCost: 0,
      incomeOverride: income, expenseOverride: expenses,
    }),
    [inputs, income, expenses]
  );
  const result = useMemo(() => computeRunway(inputs, params),
    [inputs, incomeFactor, expenseDelta, oneOff, income, expenses]); // eslint-disable-line react-hooks/exhaustive-deps

  const incomeAdjusted = income !== measuredIncome;
  const expensesAdjusted = expenses !== measuredExpenses;

  const presets: Preset[] = [
    { name: "Heute", hint: "unverändert",
      params: { incomeFactor: 1, expenseDeltaMonthly: 0, oneOffCost: 0 } },
    { name: "Pensum 60 %", hint: "Koch reduzieren",
      params: { incomeFactor: 0.6, expenseDeltaMonthly: 0, oneOffCost: 0 } },
    { name: "Pensum 40 %", hint: "neben der Schule",
      params: { incomeFactor: 0.4, expenseDeltaMonthly: 0, oneOffCost: 0 } },
    { name: "Berufsmatura Vollzeit", hint: "kein Lohn, Schulgeld",
      params: { incomeFactor: 0, expenseDeltaMonthly: 150, oneOffCost: 3000 } },
    { name: "Kein Einkommen", hint: "Worst Case",
      params: { incomeFactor: 0, expenseDeltaMonthly: 0, oneOffCost: 0 } },
  ];

  function apply(p: ScenarioParams) {
    setIncomeFactor(p.incomeFactor);
    setExpenseDelta(p.expenseDeltaMonthly);
    setOneOff(p.oneOffCost);
  }

  const isActive = (p: ScenarioParams) =>
    p.incomeFactor === incomeFactor &&
    p.expenseDeltaMonthly === expenseDelta &&
    p.oneOffCost === oneOff;

  const chartData = result.projection.map((p) => ({
    month: monthLabel(p.month),
    Vermögen: p.balance,
  }));

  const tone =
    result.runwayMonths === null ? "text-good"
      : result.runwayMonths >= 12 ? "text-good"
        : result.runwayMonths >= 6 ? "text-warn" : "text-bad";

  const delta =
    result.runwayMonths !== null && baseline.runwayMonths !== null
      ? result.runwayMonths - baseline.runwayMonths
      : null;

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.name}
            onClick={() => apply(p.params)}
            className={cx(
              "rounded-lg border px-3 py-2 text-left text-sm transition",
              isActive(p.params)
                ? "border-accent bg-accent-tint text-accent"
                : "border-line text-ink-soft hover:border-line-strong"
            )}
          >
            <div className="font-medium">{p.name}</div>
            <div className="text-[11px] text-ink-muted">{p.hint}</div>
          </button>
        ))}
        {saved.map((s) => (
          <button
            key={s.id}
            onClick={() =>
              apply({
                incomeFactor: Number(s.income_factor),
                expenseDeltaMonthly: Number(s.expense_delta_monthly),
                oneOffCost: Number(s.one_off_cost),
              })
            }
            className="rounded-lg border border-line px-3 py-2 text-left text-sm text-ink-soft transition hover:border-line-strong"
          >
            <div className="font-medium">{s.name}</div>
            <div className="text-[11px] text-ink-muted">gespeichert</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Regler */}
        <Card className="space-y-6">
          <CardTitle>Ausgangswerte</CardTitle>

          <div className="space-y-4">
            <div>
              <Label htmlFor="income">Einkommen pro Monat (CHF)</Label>
              <Input id="income" type="number" step={50} value={income}
                onChange={(e) => setIncome(Math.max(0, Number(e.target.value) || 0))} />
              <p className="mt-1.5 text-xs text-ink-muted">
                Gemessen: {chf(measuredIncome)}.{" "}
                {incomeAdjusted && (
                  <button onClick={() => setIncome(measuredIncome)}
                    className="text-accent-soft hover:underline">zurücksetzen</button>
                )}
              </p>
            </div>
            <div>
              <Label htmlFor="expenses">Ausgaben pro Monat (CHF)</Label>
              <Input id="expenses" type="number" step={50} value={expenses}
                onChange={(e) => setExpenses(Math.max(0, Number(e.target.value) || 0))} />
              <p className="mt-1.5 text-xs text-ink-muted">
                Gemessen: {chf(measuredExpenses)}.{" "}
                {expensesAdjusted && (
                  <button onClick={() => setExpenses(measuredExpenses)}
                    className="text-accent-soft hover:underline">zurücksetzen</button>
                )}
              </p>
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <CardTitle>Stellschrauben</CardTitle>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <Label className="mb-0">Arbeitspensum</Label>
              <span className="tabular text-sm font-medium text-ink">
                {Math.round(incomeFactor * 100)} %
              </span>
            </div>
            <input type="range" min={0} max={1.5} step={0.05} value={incomeFactor}
              onChange={(e) => setIncomeFactor(Number(e.target.value))} />
            <p className="mt-1.5 text-xs text-ink-muted">
              Ergibt {chf(result.monthlyIncome)} pro Monat
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <Label className="mb-0">Ausgaben ändern</Label>
              <span className="tabular text-sm font-medium text-ink">
                {expenseDelta >= 0 ? "+" : ""}{chf(expenseDelta)}
              </span>
            </div>
            <input type="range" min={-1000} max={2000} step={50} value={expenseDelta}
              onChange={(e) => setExpenseDelta(Number(e.target.value))} />
            <p className="mt-1.5 text-xs text-ink-muted">
              Ausgaben {chf(result.monthlyExpenses)} / Monat
            </p>
          </div>

          <div>
            <Label htmlFor="oneoff">Einmalige Kosten (CHF)</Label>
            <Input id="oneoff" type="number" step={100} value={oneOff}
              onChange={(e) => setOneOff(Number(e.target.value) || 0)} />
            <p className="mt-1.5 text-xs text-ink-muted">
              z. B. Schulgeld, Umzug, Auto
            </p>
          </div>

          <form action={saveScenario} className="space-y-2 border-t border-line pt-4">
            <input type="hidden" name="income_factor" value={incomeFactor} />
            <input type="hidden" name="expense_delta_monthly" value={expenseDelta} />
            <input type="hidden" name="one_off_cost" value={oneOff} />
            <Label htmlFor="scenario-name">Szenario merken</Label>
            <Input id="scenario-name" name="name" placeholder="Name" required />
            <Button type="submit" variant="ghost" className="w-full">Speichern</Button>
          </form>
        </Card>

        {/* Ergebnis */}
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Runway in diesem Szenario
                </div>
                <div className={cx("tabular mt-1 text-4xl font-semibold", tone)}>
                  {result.runwayMonths === null
                    ? "unbegrenzt"
                    : monthsToHuman(result.runwayMonths)}
                </div>
                <div className="mt-1 text-sm text-ink-muted">
                  {result.runwayMonths === null
                    ? `Überschuss von ${chf(result.netMonthly)} pro Monat`
                    : `Geld reicht bis ${dateLabel(result.depletionDate!.toISOString())}`}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 text-right">
                {delta !== null && Math.abs(delta) > 0.05 && (
                  <Badge tone={delta > 0 ? "good" : "bad"}>
                    {delta > 0 ? "+" : ""}{Math.round(delta)} Monate ggü. heute
                  </Badge>
                )}
                <div className="tabular text-sm text-ink-muted">
                  Start {chf(result.liquid)}
                </div>
                <div
                  className={cx(
                    "tabular text-sm font-medium",
                    result.netMonthly >= 0 ? "text-good" : "text-bad"
                  )}
                >
                  {result.netMonthly >= 0 ? "+" : ""}{chf(result.netMonthly)} / Monat
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Vermögensverlauf</CardTitle>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B8C7B" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#5B8C7B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E8E3D8" vertical={false} />
                <XAxis dataKey="month" stroke="#8A8478" fontSize={11}
                  tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis stroke="#8A8478" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  formatter={(v: number) => chf(v)}
                  contentStyle={{
                    background: "#FFFDF9", border: "1px solid #E8E3D8",
                    borderRadius: 8, fontSize: 12,
                  }}
                />
                <ReferenceLine y={0} stroke="#B9847A" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="Vermögen" stroke="#5B8C7B" strokeWidth={2}
                  fill="url(#fade)" />
              </AreaChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-ink-muted">
              Lineare Fortschreibung ohne Zinsen und ohne Teuerung. Bewusst konservativ.
            </p>
          </Card>

          {saved.length > 0 && (
            <Card>
              <CardTitle>Gespeicherte Szenarien</CardTitle>
              <ul className="divide-y divide-line">
                {saved.map((s) => {
                  const r = computeRunway(inputs, {
                    incomeFactor: Number(s.income_factor),
                    expenseDeltaMonthly: Number(s.expense_delta_monthly),
                    oneOffCost: Number(s.one_off_cost),
                  });
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <div className="text-sm text-ink">{s.name}</div>
                        <div className="text-xs text-ink-muted">
                          Pensum {Math.round(Number(s.income_factor) * 100)} %
                          {Number(s.expense_delta_monthly) !== 0 &&
                            ` · ${chf(Number(s.expense_delta_monthly))} Ausgaben`}
                          {Number(s.one_off_cost) !== 0 &&
                            ` · ${chf(Number(s.one_off_cost))} einmalig`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular text-sm text-ink">
                          {r.runwayMonths === null ? "∞" : monthsToHuman(r.runwayMonths)}
                        </span>
                        <form action={deleteScenario}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className="text-xs text-ink-muted hover:text-bad">
                            löschen
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
