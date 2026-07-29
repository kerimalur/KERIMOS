import { createClient } from "@/lib/supabase/server";
import {
  createGoal, updateGoal, deleteGoal, addMilestone, toggleMilestone, deleteMilestone,
} from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, Select, Badge, Empty, cx } from "@/components/ui";
import { goalStanding, formatProgress, TONE_LABEL } from "@/lib/goals";
import { dateLabel, todayISO } from "@/lib/format";
import { createTradingClient } from "@/lib/supabase/trading";
import {
  BUCKET_LABEL, GOAL_KIND_LABEL,
  type Activity, type Category, type GoalMilestone, type GoalProgress,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ZielePage() {
  const supabase = await createClient();
  const [{ data: goalRows }, { data: msRows }, { data: cats }, { data: acts }] =
    await Promise.all([
      supabase.from("v_goal_progress").select("*").order("sort_order").order("target_date"),
      supabase.from("goal_milestones").select("*").order("sort_order").order("target_date"),
      supabase.from("categories").select("*").eq("archived", false).order("name"),
      supabase.from("activities").select("*").eq("archived", false).order("name"),
    ]);

  // Zählt die dokumentierten Backtest-Trades aus der Trading-Datenbank.
  // Null bedeutet: kein Zugang eingerichtet, dann gilt der manuelle Wert.
  const backtestTrades = await (async () => {
    const trading = createTradingClient();
    if (!trading) return null;
    const { data } = await trading.from("backtest_sessions").select("trades");
    const alle = (data ?? []).flatMap(
      (s) => (s.trades ?? []) as { result?: string }[]
    );
    return alle.filter((t) => t.result === "win" || t.result === "loss" || t.result === "be").length;
  })();

  const goals = (goalRows ?? []) as GoalProgress[];
  const milestones = (msRows ?? []) as GoalMilestone[];
  const categories = (cats ?? []) as Category[];
  const activities = (acts ?? []) as Activity[];

  const active = goals.filter((g) => g.status === "active");
  const rest = goals.filter((g) => g.status !== "active");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Ziele</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Die Ampel vergleicht deinen Fortschritt mit der verstrichenen Zeit. Ein Ziel
          bei 40 Prozent ist grün, wenn erst ein Drittel der Frist um ist — und rot,
          wenn nächste Woche Abgabe wäre.
        </p>
      </div>

      {goals.length === 0 && (
        <Empty>
          Noch keine Ziele. Fang mit dem an, das dich wirklich beschäftigt —
          Berufsmatura 2027 oder 200 dokumentierte Backtest-Trades.
        </Empty>
      )}

      {[...active, ...rest].map((g) => {
        const target = g.target_amount === null ? null : Number(g.target_amount);
        // Backtest-Ziele zählen sich selbst: die Trades stehen im Journal,
        // von Hand nachtragen wäre nur eine Fehlerquelle.
        const istBacktest = /backtest/i.test(g.title);
        const progress = istBacktest && backtestTrades !== null
          ? backtestTrades
          : Number(g.progress ?? 0);
        const s = goalStanding(progress, target, g.start_date, g.target_date, g.status);
        const own = milestones.filter((m) => m.goal_id === g.id);

        return (
          <Card key={g.id} className={cx(g.status !== "active" && "opacity-60")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium text-ink">{g.title}</h2>
                  <Badge>{GOAL_KIND_LABEL[g.kind]}</Badge>
                  <Badge tone={s.tone === "done" ? "good" : s.tone === "neutral" ? "neutral" : s.tone}>
                    {TONE_LABEL[s.tone]}
                  </Badge>
                </div>
                {g.description && (
                  <p className="mt-1 text-sm text-ink-muted">{g.description}</p>
                )}
              </div>

              <div className="text-right">
                <div className="tabular text-lg font-medium text-ink">
                  {formatProgress(g.kind, progress, g.unit)}
                  {target !== null && (
                    <span className="text-ink-muted">
                      {" "}/ {formatProgress(g.kind, target, g.unit)}
                    </span>
                  )}
                </div>
                {g.target_date && (
                  <div className="text-xs text-ink-muted">
                    bis {dateLabel(g.target_date)}
                    {s.daysLeft !== null && (
                      <> · {s.daysLeft >= 0 ? `${s.daysLeft} Tage` : `${-s.daysLeft} Tage über`}</>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Fortschrittsbalken mit Soll-Marke */}
            {target !== null && (
              <div className="mt-4">
                <div className="relative h-2.5 overflow-hidden rounded-full bg-sand">
                  <div className={cx("h-full rounded-full",
                    s.tone === "bad" ? "bg-bad" : s.tone === "warn" ? "bg-warn" : "bg-accent")}
                    style={{ width: `${Math.min(100, s.share * 100)}%` }} />
                  {s.timeShare !== null && (
                    <div className="absolute top-0 h-full w-px bg-ink-muted"
                      style={{ left: `${s.timeShare * 100}%` }}
                      title="Hier müsstest du zeitlich stehen" />
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
                  <span>{Math.round(s.share * 100)} % erreicht</span>
                  {s.timeShare !== null && (
                    <span>
                      Soll {Math.round(s.timeShare * 100)} %
                      {s.delta !== null && Math.abs(s.delta) >= 1 && (
                        <span className={s.delta >= 0 ? "text-good" : "text-bad"}>
                          {" "}({s.delta > 0 ? "+" : ""}{Math.round(s.delta)} pp)
                        </span>
                      )}
                    </span>
                  )}
                  {s.neededPerWeek !== null && s.neededPerWeek > 0 && s.tone !== "done" && (
                    <span>
                      nötig: {formatProgress(g.kind, s.neededPerWeek, g.unit)} pro Woche
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Meilensteine */}
            {own.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
                {own.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <form action={toggleMilestone}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="done" value={String(!m.done_at)} />
                      <button className={cx(
                        "grid h-4 w-4 place-items-center rounded border text-[10px] transition",
                        m.done_at ? "border-accent bg-accent text-white" : "border-line hover:border-line-strong"
                      )}>
                        {m.done_at ? "✓" : ""}
                      </button>
                    </form>
                    <span className={cx("flex-1 text-sm",
                      m.done_at ? "text-ink-faint line-through" : "text-ink-soft")}>
                      {m.title}
                    </span>
                    {m.target_date && (
                      <span className="text-xs text-ink-muted">{dateLabel(m.target_date)}</span>
                    )}
                    <form action={deleteMilestone}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="text-xs text-ink-faint transition hover:text-bad">✕</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-xs text-ink-muted transition hover:text-ink-soft">
                Bearbeiten
              </summary>

              <form action={updateGoal} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={g.id} />
                <div className="min-w-40 flex-1">
                  <Label htmlFor={`t-${g.id}`}>Titel</Label>
                  <Input id={`t-${g.id}`} name="title" defaultValue={g.title} />
                </div>
                <div className="w-28">
                  <Label htmlFor={`z-${g.id}`}>Zielwert</Label>
                  <Input id={`z-${g.id}`} name="target_amount" type="number" step="any"
                    defaultValue={target ?? ""} />
                </div>
                <div className="w-40">
                  <Label htmlFor={`d-${g.id}`}>Frist</Label>
                  <Input id={`d-${g.id}`} name="target_date" type="date"
                    defaultValue={g.target_date ?? ""} />
                </div>
                <div className="w-28">
                  <Label htmlFor={`m-${g.id}`}>Stand manuell</Label>
                  <Input id={`m-${g.id}`} name="manual_progress" type="number" step="any"
                    defaultValue={g.manual_progress ?? ""} placeholder="auto" />
                </div>
                <div className="w-32">
                  <Label htmlFor={`s-${g.id}`}>Status</Label>
                  <Select id={`s-${g.id}`} name="status" defaultValue={g.status}>
                    <option value="active">aktiv</option>
                    <option value="paused">pausiert</option>
                    <option value="done">erreicht</option>
                    <option value="dropped">verworfen</option>
                  </Select>
                </div>
                <Input name="description" defaultValue={g.description ?? ""}
                  placeholder="Beschreibung" className="min-w-48 flex-1" />
                <Button variant="ghost" type="submit">Speichern</Button>
                <button formAction={deleteGoal}
                  className="text-xs text-ink-faint transition hover:text-bad">
                  löschen
                </button>
              </form>

              <form action={addMilestone} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="goal_id" value={g.id} />
                <div className="min-w-48 flex-1">
                  <Label htmlFor={`ms-${g.id}`}>Meilenstein</Label>
                  <Input id={`ms-${g.id}`} name="title" required
                    placeholder="z. B. 50 Trades dokumentiert" />
                </div>
                <div className="w-40">
                  <Label htmlFor={`msd-${g.id}`}>bis</Label>
                  <Input id={`msd-${g.id}`} name="target_date" type="date" />
                </div>
                <Button variant="ghost" type="submit">Hinzufügen</Button>
              </form>
            </details>
          </Card>
        );
      })}

      {/* Neues Ziel */}
      <Card>
        <CardTitle>Ziel anlegen</CardTitle>
        <form action={createGoal} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Label htmlFor="title">Titel</Label>
              <Input id="title" name="title" required
                placeholder="z. B. 200 Trades backtesten" />
            </div>
            <div className="w-40">
              <Label htmlFor="kind">Art</Label>
              <Select id="kind" name="kind" defaultValue="milestone">
                {Object.entries(GOAL_KIND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <Label htmlFor="target_amount">Zielwert</Label>
              <Input id="target_amount" name="target_amount" type="number" step="any" />
            </div>
            <div className="w-24">
              <Label htmlFor="unit">Einheit</Label>
              <Input id="unit" name="unit" placeholder="Trades" />
            </div>
            <div className="w-40">
              <Label htmlFor="start_date">Ab</Label>
              <Input id="start_date" name="start_date" type="date" defaultValue={todayISO()} />
            </div>
            <div className="w-40">
              <Label htmlFor="target_date">Frist</Label>
              <Input id="target_date" name="target_date" type="date" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="linked_category_ids">
                Fortschritt aus Kategorien (Geldziele)
              </Label>
              <Select id="linked_category_ids" name="linked_category_ids" multiple
                className="h-28">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.kind === "income" ? "Ein" : "Aus"})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="linked_activity_ids">
                Fortschritt aus Aktivitäten (Zeitziele)
              </Label>
              <Select id="linked_activity_ids" name="linked_activity_ids" multiple
                className="h-28">
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({BUCKET_LABEL[a.bucket]})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Input name="description" placeholder="Beschreibung (optional)" />
          <Button type="submit">Anlegen</Button>
          <p className="text-xs text-ink-muted">
            Mehrfachauswahl mit gedrückter Strg-Taste. Ohne Verknüpfung trägst du den
            Stand von Hand ein oder hakst Meilensteine ab.
          </p>
        </form>
      </Card>
    </div>
  );
}
