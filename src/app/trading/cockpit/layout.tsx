import { BereichTabs, COCKPIT_REITER } from "@/components/trading/bereich-tabs";

/**
 * Cockpit — was ist gerade los am Chart.
 *
 * Die Reiter stehen im Layout, nicht in den einzelnen Seiten: sonst müsste
 * man sie in jede neue Unterseite von Hand einbauen und vergisst es genau
 * einmal. Ein Layout umschliesst alles in diesem Abschnitt automatisch.
 */
export default function CockpitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <BereichTabs reiter={COCKPIT_REITER} />
      {children}
    </div>
  );
}
