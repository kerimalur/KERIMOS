"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Tab-Leiste des Gym-Bereichs - gleiche Bauart wie im Essen-Bereich.
 * Auf dem Handy klebt sie unten am Rand, am Computer sitzt sie oben.
 */
/**
 * Seit die Garmin-Uhr das Tracking übernimmt, haben sich die Gewichte
 * verschoben: geplant wird nicht mehr in KerimOS, sondern auf der Uhr.
 * "Tage" und "Plan" sind damit keine täglichen Wege mehr und rutschen unter
 * "Mehr" - gelöscht wird nichts, manuelles Erfassen bleibt der Notfallweg.
 */
const TABS = [
  { href: "/gym", label: "Übersicht" },
  { href: "/gym/verlauf", label: "Verlauf" },
  { href: "/gym/garmin", label: "Garmin" },
  { href: "/gym/einstellungen", label: "Mehr" },
];

/** Unterseiten, die unter "Mehr" einsortiert sind. */
const UNTER_MEHR = [
  "/gym/uebungen", "/gym/balance", "/gym/fortschritt",
  "/gym/trainingstage", "/gym/kalender", "/gym/workout",
];

export function GymTabs() {
  const path = usePathname();
  const aktiv = (href: string) => {
    if (href === "/gym") return path === href;
    if (href === "/gym/einstellungen") {
      return path.startsWith(href) || UNTER_MEHR.some((p) => path.startsWith(p));
    }
    return path.startsWith(href);
  };

  return (
    <>
      {/* Computer: Reiterzeile oben */}
      <nav className="hidden flex-wrap items-center gap-1 rounded-xl bg-sand p-1 sm:flex">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href}
            className={cx("rounded-lg px-4 py-1.5 text-sm font-medium transition",
              aktiv(t.href) ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {/* Handy: feste Leiste unten, mit Platzhalter darüber */}
      <div className="h-16 sm:hidden" />
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line
                      bg-paper/95 backdrop-blur sm:hidden">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href}
            className={cx("flex-1 py-3 text-center text-xs font-medium transition",
              aktiv(t.href) ? "text-accent-soft" : "text-ink-muted")}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
