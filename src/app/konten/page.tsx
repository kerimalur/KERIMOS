import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAccount, updateAccountBalance, deleteAccount } from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, Select, Badge, Empty, Stat, cx } from "@/components/ui";
import { chf, chf2, dateLabel, todayISO } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL, type AccountBalance, type AccountStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KontenPage() {
  const supabase = await createClient();
  const [{ data: balances }, { data: statRows }] = await Promise.all([
    supabase.from("v_account_balances").select("*").eq("archived", false).order("sort_order"),
    supabase.from("v_account_stats").select("*"),
  ]);

  const accounts = (balances ?? []) as AccountBalance[];
  const stats = new Map(
    ((statRows ?? []) as AccountStats[]).map((s) => [s.account_id, s])
  );

  const total = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const liquid = accounts
    .filter((a) => a.include_in_runway)
    .reduce((s, a) => s + Number(a.balance), 0);
  const bookings = accounts.reduce(
    (s, a) => s + (stats.get(a.account_id)?.txn_count ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Konten</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {accounts.length} Konten · {bookings} Buchungen erfasst
        </p>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Vermögen gesamt" value={chf(total)} />
          <Stat label="Im Runway berücksichtigt" value={chf(liquid)}
            tone={liquid > 0 ? "good" : "neutral"} />
          <Stat label="Nicht berücksichtigt" value={chf(total - liquid)}
            sub="z. B. gebundene Anlagen" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {accounts.length === 0 && <Empty>Noch kein Konto angelegt.</Empty>}

          {accounts.map((a) => {
            const s = stats.get(a.account_id);
            return (
              <Card key={a.account_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{a.name}</span>
                      <Badge>{ACCOUNT_TYPE_LABEL[a.type]}</Badge>
                      {!a.include_in_runway && <Badge tone="warn">nicht im Runway</Badge>}
                      {(s?.uncategorized ?? 0) > 0 && (
                        <Badge tone="warn">{s!.uncategorized} ohne Kategorie</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      Basis {chf2(Number(a.base_balance))} per {dateLabel(a.base_date)}
                      {s?.first_txn && (
                        <> · Buchungen {dateLabel(s.first_txn)} bis {dateLabel(s.last_txn!)}</>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-xl font-medium text-ink">
                      {chf2(Number(a.balance))}
                    </div>
                    <Link href={`/transaktionen?konto=${a.account_id}`}
                      className="text-xs text-accent-soft transition hover:underline">
                      {s?.txn_count ?? 0} Buchungen ansehen →
                    </Link>
                  </div>
                </div>

                {s && s.txn_count > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-sand/60 p-3 text-sm">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-ink-muted">Ein</div>
                      <div className="tabular text-good">{chf(Number(s.income))}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-ink-muted">Aus</div>
                      <div className="tabular text-bad">{chf(Number(s.expenses))}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-ink-muted">Umbuchung</div>
                      <div className="tabular text-ink-muted">{chf(Number(s.transfers))}</div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <form action={updateAccountBalance} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="account_id" value={a.account_id} />
                    <div>
                      <Label htmlFor={`bal-${a.account_id}`}>Kontostand korrigieren</Label>
                      <Input id={`bal-${a.account_id}`} name="balance" type="number"
                        step="0.05" className="w-36" placeholder="CHF" required />
                    </div>
                    <div>
                      <Label htmlFor={`dat-${a.account_id}`}>per</Label>
                      <Input id={`dat-${a.account_id}`} name="snapshot_date" type="date"
                        defaultValue={todayISO()} className="w-40" />
                    </div>
                    <Button variant="ghost" type="submit">Setzen</Button>
                  </form>
                  <form action={deleteAccount}>
                    <input type="hidden" name="id" value={a.account_id} />
                    <Button variant="danger" type="submit">
                      {(s?.txn_count ?? 0) > 0
                        ? `Konto und ${s!.txn_count} Buchungen löschen`
                        : "Konto löschen"}
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}

          <p className="text-xs text-ink-muted">
            Ein gesetzter Kontostand wird zur neuen Rechenbasis. Buchungen vor diesem Datum
            verändern den Saldo danach nicht mehr — so bleibt alles stimmig, auch wenn du
            nicht jede Buchung erfasst.
          </p>
          <p className="text-xs text-ink-muted">
            Ein Konto zu löschen entfernt auch seine Buchungen. Das ist Absicht: sonst
            blieben sie unsichtbar liegen und würden beim nächsten Import als Dublette
            gelten — der Auszug liesse sich dann nicht mehr sauber neu einlesen.
          </p>
        </div>

        <Card className="h-fit">
          <CardTitle>Konto hinzufügen</CardTitle>
          <form action={createAccount} className="space-y-3">
            <div>
              <Label htmlFor="name">Bezeichnung</Label>
              <Input id="name" name="name" required placeholder="z. B. Fondssparkonto" />
            </div>
            <div>
              <Label htmlFor="type">Art</Label>
              <Select id="type" name="type" defaultValue="savings">
                {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="opening_balance">Stand (CHF)</Label>
                <Input id="opening_balance" name="opening_balance" type="number"
                  step="0.05" defaultValue={0} />
              </div>
              <div>
                <Label htmlFor="opening_date">per</Label>
                <Input id="opening_date" name="opening_date" type="date"
                  defaultValue={todayISO()} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="include_in_runway" defaultChecked
                className="h-4 w-4 rounded border-line" />
              Im Runway berücksichtigen
            </label>
            <Button type="submit" className="w-full">Anlegen</Button>
          </form>
          <p className="mt-3 text-xs text-ink-muted">
            Lege hier deine übrigen Raiffeisen-Konten an — Fondssparkonto, YoungMember
            Sparkonto, Privatkonto. Erst dann stimmt dein Vermögen und damit der Runway.
          </p>
        </Card>
      </div>
    </div>
  );
}
