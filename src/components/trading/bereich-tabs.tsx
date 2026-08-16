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
  // leuchten auf /trading/cockpit/board gleich zwei Reiter.
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

/* --------------------------------------------------- Die drei Reiter-Sätze */

/**
 * Cockpit: was ist gerade los am Chart.
 *
 * Radar und Heatmap behalten bewusst ihre alten Adressen. Sie unter
 * /trading/cockpit/… zu schieben hätte nur die URL hübscher gemacht und dafür
 * jeden gespeicherten Link gebrochen — die Reiter funktionieren so genauso.
 */
export const COCKPIT_REITER: Reiter[] = [
  { href: "/trading/cockpit", label: "Lebenszyklus", exakt: true },
  { href: "/trading/radar", label: "Radar" },
  { href: "/trading/heatmap", label: "Heatmap" },
  { href: "/trading/cockpit/board", label: "GVA-Board" },
  { href: "/trading/cockpit/news", label: "News" },
];

/**
 * Confluences: warum — die fundamentale Lage.
 *
 * Jetzt / Rückblick / Bilanz stehen NICHT hier: das sind Abfragen auf
 * derselben Adresse (?ansicht=…), und `usePathname` kennt keine Query.
 * Sie bleiben in der Seite selbst, sonst leuchteten hier immer alle drei.
 */
export const CONFLUENCE_REITER: Reiter[] = [
  { href: "/trading/confluence", label: "Confluences" },
  { href: "/trading/ranking", label: "Ranking" },
];

/** Backtest: eintragen und auswerten. */
export const BACKTEST_REITER: Reiter[] = [
  { href: "/trading/backtest", label: "Eintragen", exakt: true },
  { href: "/trading/backtest/auswertung", label: "Auswertung" },
  { href: "/trading/backtest/kategorien", label: "Kategorien" },
];
