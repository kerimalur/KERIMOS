import { BereichTabs, CONFLUENCE_REITER } from "@/components/trading/bereich-tabs";

/**
 * Ranking gehört fachlich zu Confluence: es ist der Q-Score, also
 * ebenfalls Fundamentallage — nur wöchentlich statt tagesaktuell.
 *
 * Die Reiter stehen im Layout, nicht in den einzelnen Seiten: sonst müsste
 * man sie in jede neue Unterseite von Hand einbauen und vergisst es genau
 * einmal. Ein Layout umschliesst alles in diesem Abschnitt automatisch.
 */
export default function RankingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <BereichTabs reiter={CONFLUENCE_REITER} />
      {children}
    </div>
  );
}
