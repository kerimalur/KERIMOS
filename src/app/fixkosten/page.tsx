import { createClient } from "@/lib/supabase/server";
import {
  createRecurring, toggleRecurring, deleteRecurring, adoptRecurringCandidate,
} from "@/lib/actions";
import { monthlyEquivalent } from "@/lib/money";
import { Button, Card, CardTitle, Input, Label, Select, Badge, Empty, cx } from "@/components/ui";
import { chf, dateLabel, todayISO } from "@/lib/format";
import {
  INTERVAL_LABEL, type Category, type RecurringItem, type FixedCostCandidate,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FixkostenPage() {
  const supabase = await createClient();
  const [{ data: items }, { data: cats }, { data: cands }] = await Promise.all([
    supabase.from("recurring_items").select("*").order("active", { ascending: false }).order("label"),
    supabase.from("categories").select("*").eq("archived", false).order("name"),
    supabase.from("v_fixed_cost_candidates").select("*")
      .order("irregularity", { ascending: true }).limit(80),
  ]);

  const list = (items ?? []) as RecurringItem[];
  const categories = (cats ?? []) as Category[];
  const catById = new Map(categories.map((c) => [c.id, c]));

  // Was schon als Fixposten erfasst ist, muss nicht mehr vorgeschlagen werden
  const known = list.map((i) => i.label.toLowerCase());
  const alle = ((cands ?? []) as FixedCostCandidate[])
    .filter((c) => Math.abs(Number(c.amount)) >= 2)
    .filter((c) => !known.some((k) => k.includes(c.pattern.trim().slice(0, 12))));

  // Zuerst die gleichmässigen und noch laufenden, danach der Rest
  const candidates = alle
    .filter((c) => c.looks_fixed)
    .sort((a, b) =>
      Number(b.still_running) - Number(a.still_running) ||
      Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, 25);
  const unsicher = alle.filter((c) => !c.looks_fixed).length;

  const monthlyOut = list
    .filter((i) => i.active && Number(i.amount) < 0)
    .reduce((s, i) => s + Math.abs(monthlyEquivalent(Number(i.amount), i.interval)), 0);
  const monthlyIn = list
    .filter((i) => i.active && Number(i.amount) > 0)
    .reduce((s, i) => s + monthlyEquivalent(Number(i.amount), i.interval), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Fixkosten &amp; feste Einnahmen</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {chf(monthlyOut)} raus · {chf(monthlyIn)} rein · Saldo{" "}
          <span className={monthlyIn - monthlyOut >= 0 ? "text-good" : "text-bad"}>
            {chf(monthlyIn - monthlyOut)}
          </span>{" "}
          pro Monat
        </p>
      </div>

      {candidates.length > 0 && (
        <Card>
          <CardTitle>Aus deinen Buchungen erkannt</CardTitle>
          <p className="mb-4 max-w-3xl text-sm text-ink-muted">
            Mindestens dreimal derselbe Betrag — und vor allem in gleichmässigem
            Abstand. Der zweite Teil ist entscheidend: ein Kaffee für 3.00 kommt auch
            achtzigmal vor, aber unregelmässig. Was du übernimmst, landet in den
            Fixkosten und markiert seine Kategorie als fix.
            {unsicher > 0 && (
              <> {unsicher} weitere Posten wiederholen sich zu unregelmässig und
              werden nicht vorgeschlagen.</>
            )}
          </p>

          <ul className="divide-y divide-line">
            {candidates.map((c) => {
              const cat = c.category_id ? catById.get(c.category_id) : undefined;
              const amount = Number(c.amount);
              const label = c.sample.slice(0, 60);
              return (
                <li key={`${c.pattern}-${c.amount}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm text-ink">{label}</span>
                      <Badge>{INTERVAL_LABEL[c.guessed_interval]}</Badge>
                      {cat && <Badge tone="accent">{cat.name}</Badge>}
                      {!c.still_running && <Badge tone="warn">läuft nicht mehr</Badge>}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {c.hits}× identisch · {dateLabel(c.first_seen)} bis {dateLabel(c.last_seen)}
                      {c.avg_gap_days !== null && ` · alle ${Math.round(Number(c.avg_gap_days))} Tage`}
                      {c.irregularity !== null && Number(c.irregularity) <= 0.1 && (
                        <span className="text-good"> · sehr regelmässig</span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className={cx("tabular text-sm font-medium",
                      amount >= 0 ? "text-good" : "text-ink")}>
                      {amount >= 0 ? "+" : ""}{chf(amount)}
                    </span>
                    <form action={adoptRecurringCandidate}>
                      <input type="hidden" name="label" value={label} />
                      <input type="hidden" name="amount" value={amount} />
                      <input type="hidden" name="interval" value={c.guessed_interval} />
                      <input type="hidden" name="day_of_month" value={c.day_of_month} />
                      <input type="hidden" name="start_date" value={c.first_seen} />
                      <input type="hidden" name="category_id" value={c.category_id ?? ""} />
                      <input type="hidden" name="account_id" value={c.account_id ?? ""} />
                      <Button variant="ghost" type="submit" className="px-2.5 py-1 text-xs">
                        Übernehmen
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardTitle>Wiederkehrende Posten</CardTitle>
          {list.length === 0 ? (
            <Empty>Noch nichts hinterlegt.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((i) => {
                const amount = Number(i.amount);
                const perMonth = monthlyEquivalent(amount, i.interval);
                return (
                  <li key={i.id}
                    className={cx("flex flex-wrap items-center justify-between gap-3 py-3",
                      !i.active && "opacity-50")}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-ink">{i.label}</span>
                        <Badge>{INTERVAL_LABEL[i.interval]}</Badge>
                        {!i.active && <Badge tone="warn">pausiert</Badge>}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {chf(Math.abs(amount))} {INTERVAL_LABEL[i.interval]}
                        {i.interval !== "monthly" &&
                          ` · entspricht ${chf(Math.abs(perMonth))} / Monat`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cx("tabular text-sm font-medium",
                        amount >= 0 ? "text-good" : "text-ink")}>
                        {amount >= 0 ? "+" : "−"}{chf(Math.abs(perMonth))}
                      </span>
                      <form action={toggleRecurring}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="active" value={String(!i.active)} />
                        <button className="text-xs text-ink-muted transition hover:text-ink-soft">
                          {i.active ? "pausieren" : "aktivieren"}
                        </button>
                      </form>
                      <form action={deleteRecurring}>
                        <input type="hidden" name="id" value={i.id} />
                        <button className="text-xs text-ink-muted transition hover:text-bad">
                          löschen
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardTitle>Posten hinzufügen</CardTitle>
          <form action={createRecurring} className="space-y-3">
            <div>
              <Label htmlFor="label">Bezeichnung</Label>
              <Input id="label" name="label" required placeholder="z. B. Krankenkasse" />
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="interval">Rhythmus</Label>
                <Select id="interval" name="interval" defaultValue="monthly">
                  {Object.entries(INTERVAL_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="day_of_month">am Tag</Label>
                <Input id="day_of_month" name="day_of_month" type="number" min={1} max={31}
                  defaultValue={1} />
              </div>
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
              <Label htmlFor="start_date">Ab</Label>
              <Input id="start_date" name="start_date" type="date" defaultValue={todayISO()} />
            </div>
            <Button type="submit" className="w-full">Anlegen</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
