import Link from "next/link";
import { JournalTabs } from "@/components/journal-tabs";

/**
 * Eigene Tab-Leiste für das Journal — wie bei Gym und Essen.
 *
 * Die Hauptnavigation (`components/nav.tsx`) trägt schon acht Trading-Einträge;
 * die sieben Journal-Seiten dort zusätzlich unterzubringen hiesse, fünfzehn
 * Links über zwei Reihen zu verteilen. Ein Bereich, der eine eigene
 * Arbeitsweise hat, bringt besser seine eigene Leiste mit.
 */
export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Journal</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Jeder Trade, jede These, jede Woche — die Grundlage für alles, was
            danach ausgewertet wird.
          </p>
        </div>
        <Link href="/trading" className="text-xs text-accent-soft transition hover:underline">
          ← Trading-Übersicht
        </Link>
      </div>

      <JournalTabs />
      {children}
    </div>
  );
}
