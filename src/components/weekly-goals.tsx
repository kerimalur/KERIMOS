import { Card, CardTitle, Bar, cx } from "@/components/ui";
import type { WeeklyGoals } from "@/lib/weekly-goals";

/** Eine Zeile: Label, Stand/Ziel und ein Balken. */
function GoalRow({
  label, current, target, color, ueberErfuellt, hint,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  /** Erlaubt "mehr als Ziel" (z. B. Ausdauer 1-2x) ohne die Bar zu deckeln. */
  ueberErfuellt?: boolean;
  /** Kleine Randnotiz, z.B. wenn die Zahl nur einen Teil der Wahrheit zeigt. */
  hint?: string;
}) {
  const pct = target > 0 ? (current / target) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className={cx("tabular font-medium",
          current >= target ? "text-good" : "text-ink")}>
          {current} / {target}
          {ueberErfuellt && current > target && " · stark"}
        </span>
      </div>
      <Bar pct={pct} color={color} className="mt-1.5" />
      {hint && <div className="mt-1 text-[11px] text-ink-faint">{hint}</div>}
    </div>
  );
}

export function WeeklyGoalsCard({ data }: { data: WeeklyGoals }) {
  if (!data.trades && !data.gym && !data.steps) return null;

  return (
    <Card>
      <CardTitle>Diese Woche</CardTitle>
      <div className="space-y-3.5">
        {data.trades && (
          <GoalRow label="Backtest-Trades" current={data.trades.current}
            target={data.trades.target} color="#8B94B8"
            hint={data.trades.current === 0
              ? "Erster Aufruf diese Woche setzt den Startwert - neue Trades ab jetzt zählen sofort mit."
              : undefined} />
        )}
        {data.gym && (
          <>
            <GoalRow label="Kraft" current={data.gym.kraft} target={data.gym.kraftZiel}
              color="#C68D6B" />
            <GoalRow label="Ausdauer" current={data.gym.ausdauer}
              target={data.gym.ausdauerZiel} color="#6E9B76" ueberErfuellt />
          </>
        )}
        {data.steps && (
          <GoalRow label="Schritte diese Woche" current={data.steps.current}
            target={data.steps.ziel} color="#5FC2A6" />
        )}
      </div>
    </Card>
  );
}
