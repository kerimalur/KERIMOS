import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeRunway } from "@/lib/runway";
import { chf, monthsToHuman, dateLabel } from "@/lib/format";

import { Card, CardTitle, Stat, Badge, Empty } from "@/components/ui";
import { SetupWizard } from "@/components/setup-wizard";
import { CashflowChart } from "@/components/cashflow-chart";
import type { AccountBalance, MonthlyCashflow, RunwayInputs, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Cockpit() {
  const supabase = await createClient();

  const [
    { data: accounts }, { data: inputsRows }, { data: cashflow }, { data: recent },
  ] = await Promise.all([
    supabase.from("v_account_balances").select("*").eq("archived", false).order("sort_order"),
    supabase.rpc("runway_inputs", { months_lookback: 3 }),
    supabase.from("v_monthly_cashflow").select("*").order("month", { ascending: false }).limit(6),
    supabase.from("transactions").select("*").order("occurred_on", { ascending: false }).limit(6),
  ]);

  const accountList = (accounts ?? []) as AccountBalance[];
  if (accountList.length === 0) {
    return (
      <div className="py-10">
        <SetupWizard />
      </div>
    );
  }

  const inputs = ((inputsRows as RunwayInputs[] | null)?.[0] ?? {
    liquid: 0, net_worth: 0, avg_income: 0, avg_expenses: 0,
    recurring_fixed: 0, months_with_data: 0,
  }) as RunwayInputs;

  const now = computeRunway(inputs);
  const noIncome = computeRunway(inputs, {
    incomeFactor: 0, expenseDeltaMonthly: 0, oneOffCost: 0,
  });

  const months = (cashflow ?? []).slice().reverse() as MonthlyCashflow[];
  const txns = (recent ?? []) as Transaction[];

  const runwayTone =
    noIncome.runwayMonths === null ? "good"
      : noIncome.runwayMonths >= 12 ? "good"
        : noIncome.runwayMonths >= 6 ? "warn" : "bad";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-ink">Geld</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Stand {dateLabel(new Date().toISOString())}
        </p>
      </div>

      {/* Kennzahlen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat
            label="Runway ohne Einkommen"
            tone={runwayTone}
            value={
              noIncome.runwayMonths === null
                ? "unbegrenzt"
                : monthsToHuman(noIncome.runwayMonths)
            }
            sub={
              noIncome.depletionDate
                ? `Leer am ${dateLabel(noIncome.depletionDate.toISOString())}`
                : "Einnahmen decken die Ausgaben"
            }
          />
        </Card>
        <Card>
          <Stat label="Liquide" value={chf(inputs.liquid)}
            sub={`Vermögen gesamt ${chf(inputs.net_worth)}`} />
        </Card>
        <Card>
          <Stat
            label="Monatlicher Saldo"
            tone={now.netMonthly >= 0 ? "good" : "bad"}
            value={`${now.netMonthly >= 0 ? "+" : ""}${chf(now.netMonthly)}`}
            sub={`${chf(now.monthlyIncome)} ein · ${chf(now.monthlyExpenses)} aus`}
          />
        </Card>
        <Card>
          <Stat label="Fixkosten / Monat" value={chf(inputs.recurring_fixed)}
            sub={
              now.expenseBasis === "recurring"
                ? "Basis der Berechnung"
                : `Ø Ausgaben ${chf(inputs.avg_expenses)}`
            } />
        </Card>
      </div>

      {now.expenseBasis === "recurring" && (
        <div className="rounded-lg border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn">
          Gerechnet wird noch mit den hinterlegten Fixkosten. Sobald zwei bis drei Monate
          Transaktionen erfasst sind, schaltet KerimOS automatisch auf deine echten
          Durchschnittswerte um.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cashflow */}
        <Card className="lg:col-span-2">
          <CardTitle>Ein- und Ausgaben je Monat</CardTitle>
          {months.length > 0 ? (
            <CashflowChart data={months} />
          ) : (
            <Empty>
              Noch keine Transaktionen.{" "}
              <Link href="/transaktionen" className="text-accent hover:underline">
                Erste erfassen
              </Link>{" "}
              oder{" "}
              <Link href="/import" className="text-accent hover:underline">
                Bankauszug importieren
              </Link>
              .
            </Empty>
          )}
        </Card>

        {/* Konten */}
        <Card>
          <CardTitle>Konten</CardTitle>
          <ul className="space-y-2.5">
            {accountList.map((a) => (
              <li key={a.account_id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-ink-soft">
                  {a.name}
                  {!a.include_in_runway && <Badge>nicht im Runway</Badge>}
                </span>
                <span className="tabular text-sm font-medium text-ink">
                  {chf(Number(a.balance))}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/konten"
            className="mt-4 block text-xs text-accent transition hover:underline">
            Konten verwalten →
          </Link>
        </Card>
      </div>

      {/* Letzte Buchungen */}
      <Card>
        <CardTitle>Zuletzt erfasst</CardTitle>
        {txns.length > 0 ? (
          <ul className="divide-y divide-line">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">
                    {t.description || t.counterparty || "Ohne Bezeichnung"}
                  </div>
                  <div className="text-xs text-ink-muted">{dateLabel(t.occurred_on)}</div>
                </div>
                <span
                  className={`tabular shrink-0 text-sm font-medium ${
                    Number(t.amount) >= 0 ? "text-good" : "text-ink-soft"
                  }`}
                >
                  {Number(t.amount) >= 0 ? "+" : ""}
                  {chf(Number(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Noch nichts erfasst.</Empty>
        )}
      </Card>
    </div>
  );
}
