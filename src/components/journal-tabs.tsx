"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

/**
 * Tab-Leiste des Journals. Gleiche Bauart wie `gym-tabs.tsx` und
 * `essen-tabs.tsx` — ein Muster im Projekt, nicht drei.
 */

/**
 * Fuenf Tabs, seit 21.08.2026. Raus sind Outlook, Kalender und Rueckblick:
 *
 * - **Outlook** doppelte die Beobachtungsliste auf der Trading-Uebersicht.
 * - **Kalender** war eine dritte Ansicht derselben Trades.
 * - **Rueckblick** wertete den Backtest aus und gehoert deshalb in den
 *   Backtest, nicht ins Live-Journal.
 *
 * Was bleibt, ist der Ablauf: wo steht das Konto, welche Trades gab es, wie
 * lief die Kurve, nach welcher Strategie, auf welchem Konto.
 */
const TABS = [
  { href: "/trading/journal", label: "Übersicht" },
  { href: "/trading/journal/trades", label: "Trades" },
  { href: "/trading/journal/equity", label: "Equity" },
  { href: "/trading/journal/strategien", label: "Strategien" },
  { href: "/trading/journal/konten", label: "Konten" },
];

export function JournalTabs() {
  const path = usePathname();

  // Der längste passende Pfad gewinnt, sonst leuchtet auf
  // /trading/journal/trades auch "Übersicht" mit.
  const treffer = TABS.map((t) => t.href)
    .filter((h) => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cx(
            "rounded-xl px-3 py-1.5 text-sm transition duration-150 ease-tactile active:scale-95",
            t.href === treffer
              ? "bg-accent font-medium text-ink-on shadow-glow-accent"
              : "text-ink-muted hover:bg-sand hover:text-ink-soft",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
