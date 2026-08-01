import Link from "next/link";
import { EssenTabs } from "@/components/essen-tabs";

/**
 * Rahmen des Essen-Bereichs: Kopfzeile und Tabs für alle Unterseiten.
 * Die Menüplanung lebt ab hier in KerimOS statt in einer eigenen App.
 */
export default function EssenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
            ← Startseite
          </Link>
          <h1 className="font-display mt-1 text-2xl font-bold leading-tight text-ink">Essen</h1>
        </div>
      </div>

      <EssenTabs />

      <div className="mt-5 space-y-5">{children}</div>
    </div>
  );
}
