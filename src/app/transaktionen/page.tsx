import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  createTransaction, deleteTransaction, categorizeTransaction,
  linkTransactionToActivity, toggleTransfer,
} from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, Select, Empty, Badge, Stat, cx } from "@/components/ui";
import { TxnFilter } from "@/components/txn-filter";
import { Pager } from "@/components/pager";
import { chf, chf2, dateLabel, todayISO } from "@/lib/format";
import type { Account, Activity, Category, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function monthRange(month: string) {
  const start = `${month}-01`;
  const d = new Date(start + "T12:00:00");
  d.setMonth(d.getMonth() + 1);
  const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

export default async function TransaktionenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite ?? 1) || 1);
  const supabase = await createClient();

  const [{ data: cats }, { data: accs }, { data: acts }, { data: cashflow }] =
    await Promise.all([
      supabase.from("categories").select("*").eq("archived", false).order("kind").order("name"),
      supabase.from("accounts").select("*").eq("archived", false).order("sort_order"),
      supabase.from("activities").select("*").eq("archived", false).order("name"),
      supabase.from("v_monthly_cashflow").select("month").order("month", { ascending: false }),
    ]);

  const categories = (cats ?? []) as Category[];
  const accounts = (accs ?? []) as Account[];
  const activities = (acts ?? []) as Activity[];
  const months = (cashflow ?? []).map((r) => String(r.month).slice(0, 7));

  // ---- Filter anwenden ----
  const applyFilters = <T,>(q: T): T => {
    let query = q as any;
    if (sp.konto === "ohne") query = query.is("account_id", null);
    else if (sp.konto) query = query.eq("account_id", sp.konto);

    if (sp.kategorie === "ohne") query = query.is("category_id", null);
    else if (sp.kategorie) query = query.eq("category_id", sp.kategorie);

    if (sp.monat) {
      const { start, end } = monthRange(sp.monat);
      query = query.gte("occurred_on", start).lt("occurred_on", end);
    }
    if (sp.art === "ausgaben") query = query.lt("amount", 0).eq("is_transfer", false);
    else if (sp.art === "einnahmen") query = query.gt("amount", 0).eq("is_transfer", false);
    else if (sp.art === "umbuchung") query = query.eq("is_transfer", true);
    else if (sp.art === "echt") query = query.eq("is_transfer", false);

    if (sp.q) query = query.ilike("description", `%${sp.q}%`);
    return query as T;
  };

  const listQuery = applyFilters(
    supabase.from("transactions").select("*", { count: "exact" })
  )
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Summen über den gesamten Filter, nicht nur über die Seite
  const sumQuery = applyFilters(supabase.from("transactions").select("amount, is_transfer"));

  const [{ data: txns, count }, { data: sums }] = await Promise.all([listQuery, sumQuery]);

  const list = (txns ?? []) as Transaction[];
  const total = count ?? 0;
  const catById = new Map(categories.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));

  const rows = (sums ?? []) as { amount: number; is_transfer: boolean }[];
  const income = rows.filter((r) => !r.is_transfer && Number(r.amount) > 0)
    .reduce((s, r) => s + Number(r.amount), 0);
  const expense = rows.filter((r) => !r.is_transfer && Number(r.amount) < 0)
    .reduce((s, r) => s - Number(r.amount), 0);
  const transfers = rows.filter((r) => r.is_transfer)
    .reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Transaktionen</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {total} Buchungen in der aktuellen Auswahl
        </p>
      </div>

      <Card>
        <Suspense fallback={<div className="h-9" />}>
          <TxnFilter accounts={accounts} categories={categories} months={months} />
        </Suspense>

        <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <Stat label="Einnahmen" tone="good" value={chf(income)} />
          <Stat label="Ausgaben" tone="bad" value={chf(expense)} />
          <Stat label="Umbuchungen" value={chf(transfers)}
            sub="zwischen eigenen Konten, nicht gewertet" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardTitle>Verlauf</CardTitle>
          {list.length === 0 ? (
            <Empty>
              {total === 0 && !sp.q && !sp.konto && !sp.monat && !sp.kategorie && !sp.art
                ? "Noch keine Buchungen. Importiere deinen Bankauszug oder erfasse eine von Hand."
                : "Keine Buchung passt zu diesem Filter."}
            </Empty>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {list.map((t) => {
                  const amount = Number(t.amount);
                  const cat = t.category_id ? catById.get(t.category_id) : undefined;
                  const acc = t.account_id ? accById.get(t.account_id) : undefined;
                  return (
                    <li key={t.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="tabular w-20 shrink-0 text-xs text-ink-muted">
                          {dateLabel(t.occurred_on)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {t.description || t.counterparty || "—"}
                        </span>

                        {t.is_transfer ? (
                          <Badge>Umbuchung</Badge>
                        ) : (
                          <form action={categorizeTransaction} className="shrink-0">
                            <input type="hidden" name="id" value={t.id} />
                            <select
                              name="category_id"
                              defaultValue={t.category_id ?? ""}
                              className={cx(
                                "rounded-lg border bg-white px-2 py-1 text-xs outline-none",
                                cat ? "border-line text-ink-soft" : "border-warn/50 text-warn"
                              )}
                            >
                              <option value="">— Kategorie —</option>
                              {categories
                                .filter((c) => (amount >= 0 ? c.kind === "income" : c.kind === "expense"))
                                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button className="ml-1 text-xs text-accent-soft hover:underline">ok</button>
                          </form>
                        )}

                        <span className={cx("tabular w-24 shrink-0 text-right text-sm font-medium",
                          t.is_transfer ? "text-ink-muted"
                            : amount >= 0 ? "text-good" : "text-ink")}>
                          {amount >= 0 ? "+" : ""}{chf2(amount)}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[5.5rem] text-[11px] text-ink-faint">
                        {acc && <span>{acc.name}</span>}
                        <form action={toggleTransfer}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="is_transfer" value={String(!t.is_transfer)} />
                          <button className="transition hover:text-ink-muted">
                            {t.is_transfer ? "keine Umbuchung" : "als Umbuchung markieren"}
                          </button>
                        </form>
                        {activities.length > 0 && !t.is_transfer && (
                          <form action={linkTransactionToActivity} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={t.id} />
                            <select name="activity_id" defaultValue={t.activity_id ?? ""}
                              className="rounded border border-line bg-white px-1.5 py-0.5 text-[11px] text-ink-muted outline-none">
                              <option value="">— Aktivität —</option>
                              {activities.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                            <button className="text-accent-soft hover:underline">ok</button>
                          </form>
                        )}
                        <form action={deleteTransaction}>
                          <input type="hidden" name="id" value={t.id} />
                          <button className="transition hover:text-bad">löschen</button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4">
                <Suspense fallback={null}>
                  <Pager page={page} pageSize={PAGE_SIZE} total={total} />
                </Suspense>
              </div>
            </>
          )}
        </Card>

        <Card className="h-fit">
          <CardTitle>Buchung erfassen</CardTitle>
          <form action={createTransaction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="kind">Art</Label>
                <Select id="kind" name="kind" defaultValue="expense">
                  <option value="expense">Ausgabe</option>
                  <option value="income">Einnahme</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="amount">Betrag</Label>
                <Input id="amount" name="amount" type="number" step="0.05" required />
              </div>
            </div>
            <div>
              <Label htmlFor="description">Bezeichnung</Label>
              <Input id="description" name="description" placeholder="z. B. Einkauf Migros" />
            </div>
            <div>
              <Label htmlFor="occurred_on">Datum</Label>
              <Input id="occurred_on" name="occurred_on" type="date" defaultValue={todayISO()} />
            </div>
            <div>
              <Label htmlFor="category_id">Kategorie</Label>
              <Select id="category_id" name="category_id" defaultValue="">
                <option value="">— keine —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.kind === "income" ? "Ein" : "Aus"})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="account_id">Konto</Label>
              <Select id="account_id" name="account_id" defaultValue={accounts[0]?.id ?? ""}>
                <option value="">— keines —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
            <Button type="submit" className="w-full">Erfassen</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
