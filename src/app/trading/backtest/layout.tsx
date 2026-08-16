import { BereichTabs, BACKTEST_REITER } from "@/components/trading/bereich-tabs";

/**
 * Backtest — eintragen, auswerten, Kategorien pflegen.
 *
 * Die Reiter stehen im Layout, nicht in den einzelnen Seiten: sonst müsste
 * man sie in jede neue Unterseite von Hand einbauen und vergisst es genau
 * einmal. Ein Layout umschliesst alles in diesem Abschnitt automatisch.
 */
export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <BereichTabs reiter={BACKTEST_REITER} />
      {children}
    </div>
  );
}
