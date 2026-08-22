"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Reiter innerhalb eines Trading-Bereichs.
 *
 * Die Navigation oben hat seit dem Umbau nur noch **eine** Zeile mit sechs
 * Bereichen. Vorher gab es eine zweite Zeile mit Detailseiten, und genau die
 * war das Problem: man musste jedes Mal entscheiden, ob etwas ein
 * Hauptabschnitt oder ein Nebenabschnitt ist, und die Antwort war nie
 * offensichtlich. Jetzt gilt: oben der Bereich, hier drin die Ansicht.
 */

export interface Reiter {
  href: string;
  label: string;
  /** Nur exakter Treffer zählt — für Reiter, die Präfix eines anderen sind. */
  exakt?: boolean;
}

export function BereichTabs({ reiter }: { reiter: Reiter[] }) {
  const pfad = usePathname();

  // Aktiv ist der längste passende Eintrag, nicht jeder passende. Sonst
  // leuchten auf /trading/backtest/auswertung gleich zwei Reiter.
  const treffer = reiter
    .map((r) => r.href)
    .filter((h) => pfad === h || pfad.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex flex-wrap gap-1.5">
      {reiter.map((r) => {
        const aktiv = r.exakt ? pfad === r.href : r.href === treffer;
        return (
          <Link key={r.href} href={r.href}
            className={cx(
              "rounded-xl px-3.5 py-1.5 text-sm transition duration-150 ease-tactile active:scale-95",
              aktiv
                ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                : "border border-line bg-sand text-ink-muted hover:text-ink")}>
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------ Die zwei Reiter-Sätze */

/**
 * Confluences: die fundamentale Lage.
 *
 * Zwei Reiter, seit dem Umbau vom 22.08.2026. **Ranking** ist die Übersicht
 * (Q-Score je Währung, wöchentlich aus dem ML-Modell), **Monty** die Tiefe
 * (Commercials gegen Retail, Saisonalität).
 *
 * Weg sind Terminal und Jetzt: das Fünf-Faktoren-Modell aus Zins, Realzins und
 * Risiko-Regime stand als zweites, konkurrierendes Urteil neben Monty, und
 * Kerim handelt nach Monty. Rückblick steht jetzt im Backtest, Bilanz im
 * Journal — beide sind Auswertungen eigener Trades und nicht Marktlage.
 */
export const CONFLUENCE_REITER: Reiter[] = [
  { href: "/trading/ranking", label: "Ranking" },
  { href: "/trading/confluence", label: "Monty" },
];

/**
 * Backtest: eintragen und auswerten.
 *
 * „Rückblick · Confluence" ist bewusst so beschriftet: es ist die
 * Fundamental-Lage eines vergangenen Handelstages, nicht der Wochenrückblick
 * aus dem Journal. Ohne den Zusatz hätte man zwei Rückblicke ohne Unterschied.
 */
export const BACKTEST_REITER: Reiter[] = [
  { href: "/trading/backtest", label: "Eintragen", exakt: true },
  { href: "/trading/backtest/auswertung", label: "Auswertung" },
  { href: "/trading/backtest/kategorien", label: "Kategorien" },
  { href: "/trading/backtest/rueckblick", label: "Rückblick · Confluence" },
];
