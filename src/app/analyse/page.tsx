import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, Stat, Badge, Empty, cx } from "@/components/ui";
import { CashflowChart } from "@/components/cashflow-chart";
import { chf, monthLabel } from "@/lib/format";
import type { Category, MonthlyCashflow } from "@/lib/types";

export const dynamic = "force-dynamic";

const ZEITRAEUME = [
  { key: "3", label: "3 Monate", months: 3 },
  { key: "6", label: "6 Monate", months: 6 },
  { key: "12", label: "12 Monate", months: 12 },
  { key: "alles", label: "Alles", months: 600 },
];

function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function AnalysePage({
  searchParams,
}: {
  searchParams: Promise<{ z?: string }>;
}) {
  const sp = await searchParams;
  const zeitraum = ZEITRAEUME.find((z) => z.key === sp.z) ?? ZEITRAEUME[2];
  const from = monthsAgo(zeitraum.months);

  const supabase = await createClient();
  const [{ data: cashflow }, { data: catMonthly }, { data: cats }, { data: merchants },
         { count: offen }] = await Promise.all([
    supabase.from("v_monthly_cashflow").select("*")
      .gte("month", from).order("month"),
    supabase.from("v_category_monthly").select("*").gte("month", from),
    supabase.from("categories").select("*"),
    supabase.from("v_merchant_totals").select("*").gte("month", from),
    supabase.from("transactions").select("id", { count: "exact", head: true })
      .is("category_id", null).eq("is_transfer", false),
  ]);

  const months = (cashflow ?? []) as MonthlyCashflow[];
  const categories = (cats ?? []) as Category[];
  const catById = new Map(categories.map((c) => [c.id, c]));

  const income = months.reduce((s, m) => s + Number(m.income), 0);
  const expenses = months.reduce((s, m) => s + Number(m.expenses), 0);
  const savings = months.reduce((s, m) => s + Number(m.savings), 0);
  const n = Math.max(1, months.length);
  const sparquote = income > 0 ? (income - expenses) / income : 0;

  // Ausgaben je Kategorie
  const proKategorie = new Map<string, number>();
  for (const row of (catMonthly ?? []) as { category_id: string; net: number }[]) {
    const cat = catById.get(row.category_id);
    if (!cat || cat.kind !== "expense" || cat.is_savings) continue;
    proKategorie.set(row.category_id,
      (proKategorie.get(row.category_id) ?? 0) + Math.abs(Number(row.net)));
  }
  const kategorien = [...proKategorie.entries()]
    .map(([id, sum]) => ({ cat: catById.get(id)!, sum }))
    .filter((k) => k.cat && k.sum > 0)
    .sort((a, b) => b.sum - a.sum);
  const maxKat = Math.max(1, ...kategorien.map((k) => k.sum));

  // Grösste Empfänger
  const proEmpfaenger = new Map<string, { sample: string; sum: number; hits: number }>();
  for (const m of (merchants ?? []) as
       { merchant: string; sample: string; total: number; hits: number }[]) {
    if (Number(m.total) >= 0) continue;
    const cur = proEmpfaenger.get(m.merchant) ?? { sample: m.sample, sum: 0, hits: 0 };
    cur.sum += Math.abs(Number(m.total));
    cur.hits += m.hits;
    proEmpfaenger.set(m.merchant, cur);
  }
  const empfaenger = [...proEmpfaenger.values()].sort((a, b) => b.sum - a.sum).slice(0, 15);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Analyse</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {months.length > 0
              ? `${monthLabel(months[0].month)} bis ${monthLabel(months[months.length - 1].month)}`
              : "Noch keine Daten"}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-sand p-1">
          {ZEITRAEUME.map((z) => (
            <Link key={z.key} href={`/analyse?z=${z.key}`}
              className={cx("rounded-lg px-3 py-1.5 text-sm transition",
                z.key === zeitraum.key ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
              {z.label}
            </Link>
          ))}
        </div>
      </div>

      {(offen ?? 0) > 0 && (
        <div className="rounded-xl bg-warn-tint px-4 py-3 text-sm text-warn">
          {offen} Buchungen haben keine Kategorie — sie fehlen in der Aufteilung unten.{" "}
          <Link href="/import" className="underline">Regeln anwenden</Link>
        </div>
      )}

      <Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Einnahmen" tone="good" value={chf(income)}
            sub={`${chf(income / n)} pro Monat`} />
          <Stat label="Ausgaben" tone="bad" value={chf(expenses)}
            sub={`${chf(expenses / n)} pro Monat`} />
          <Stat label="Gespart & investiert" value={chf(savings)}
            sub="zählt nicht als Ausgabe" />
          <Stat label="Sparquote"
            tone={sparquote >= 0.2 ? "good" : sparquote >= 0 ? "warn" : "bad"}
            value={`${Math.round(sparquote * 100)} %`}
            sub={`${chf(income - expenses)} übrig`} />
        </div>
      </Card>

      <Card>
        <CardTitle>Ein- und Ausgaben je Monat</CardTitle>
        {months.length > 0 ? <CashflowChart data={months} />
          : <Empty>Keine Buchungen im Zeitraum.</Empty>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Wohin das Geld geht</CardTitle>
          {kategorien.length === 0 ? (
            <Empty>Noch nichts kategorisiert.</Empty>
          ) : (
            <ul className="space-y-3">
              {kategorien.map(({ cat, sum }) => (
                <li key={cat.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cat.color }} />
                      <span className="text-sm text-ink">{cat.name}</span>
                      {cat.is_fixed && <Badge tone="accent">fix</Badge>}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="tabular text-sm text-ink">{chf(sum)}</span>
                      <span className="tabular w-16 text-right text-xs text-ink-muted">
                        {chf(sum / n)}/Mt.
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sand">
                    <div className="h-full rounded-full"
                      style={{ width: `${(sum / maxKat) * 100}%`, background: cat.color }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>Grösste Empfänger</CardTitle>
          {empfaenger.length === 0 ? (
            <Empty>Keine Ausgaben im Zeitraum.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {empfaenger.map((e) => (
                <li key={e.sample} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {e.sample.slice(0, 44)}
                    </span>
                    <span className="text-xs text-ink-muted">{e.hits}× im Zeitraum</span>
                  </span>
                  <span className="tabular shrink-0 text-sm text-ink">{chf(e.sum)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
