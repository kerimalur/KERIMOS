import { Empty, cx } from "@/components/ui";
import { INSIGHT_LABEL, type Insight, type InsightArt } from "@/lib/backtest-types";

const TON: Record<InsightArt, { rand: string; grund: string; text: string }> = {
  edge: { rand: "border-good/40", grund: "bg-good-tint", text: "text-good-bright" },
  warnung: { rand: "border-bad/40", grund: "bg-bad-tint", text: "text-bad-bright" },
  erkenntnis: { rand: "border-accent/30", grund: "bg-accent-tint", text: "text-accent-soft" },
  pruefen: { rand: "border-line", grund: "bg-sand/60", text: "text-ink-muted" },
};

/**
 * Abgeleitete Hinweise aus computeInsights(). Jede Karte nennt ihre
 * Stichprobengrösse - bei 18 Trades ist alles hier ein Indiz, kein Beleg,
 * und das soll man der Ansicht ansehen statt es im Kleingedruckten zu
 * verstecken.
 */
export function BacktestInsights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return <Empty>Noch zu wenig Trades für abgeleitete Hinweise.</Empty>;
  }

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {insights.map((ins, i) => {
        const ton = TON[ins.art];
        return (
          <div key={i}
            className={cx("animate-pop rounded-xl border p-3.5", ton.rand, ton.grund)}
            style={{ animationDelay: `${Math.min(i * 60, 500)}ms` }}>
            <div className="mb-1 flex items-center gap-2">
              <span className={cx("text-[10px] font-medium uppercase tracking-[0.1em]", ton.text)}>
                {INSIGHT_LABEL[ins.art]}
              </span>
              <span className="tabular ml-auto text-[10px] text-ink-faint">
                n = {ins.basis}
              </span>
            </div>
            <div className="text-sm font-medium text-ink">{ins.titel}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{ins.text}</p>
          </div>
        );
      })}
    </div>
  );
}
