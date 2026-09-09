"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Tab-Leiste des Gym-Bereichs - gleiche Bauart wie im Essen-Bereich.
 * Auf dem Handy klebt sie unten am Rand, am Computer sitzt sie oben.
 */
/**
 * Drei Reiter, seit der Umbau vom 09.09.2026 die Planung und die Auswertung
 * entfernt hat: Trainingstage, Übungen, Kalender, Muskelbalance, Fortschritt
 * je Übung und das manuelle Erfassen sind weg. Sie setzten alle eine Eingabe
 * voraus, die seit der Uhr niemand mehr macht.
 *
 * Was bleibt, ist der Weg durch den Bereich: war ich da (Übersicht), was war
 * (Verlauf), was hat die Uhr geschickt (Garmin).
 */
const TABS = [
  { href: "/gym", label: "Übersicht" },
  { href: "/gym/verlauf", label: "Verlauf" },
  { href: "/gym/garmin", label: "Garmin" },
];

/**
 * @param offeneImporte Trainings, die in der Garmin-Vorschau auf Prüfung warten.
 *   Ohne diesen Hinweis bleibt der Prüfschritt unsichtbar und die Einheiten
 *   liegen wochenlang ungenutzt herum.
 */
export function GymTabs({ offeneImporte = 0 }: { offeneImporte?: number }) {
  const path = usePathname();
  const aktiv = (href: string) =>
    href === "/gym" ? path === href : path.startsWith(href);

  const hinweis = (href: string) =>
    href === "/gym/garmin" && offeneImporte > 0 ? offeneImporte : null;

  return (
    <>
      {/* Computer: Reiterzeile oben */}
      <nav className="hidden flex-wrap items-center gap-1 rounded-xl bg-sand p-1 sm:flex">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href}
            className={cx("flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition",
              aktiv(t.href) ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
            {t.label}
            {hinweis(t.href) && (
              <span className="rounded-md bg-accent px-1.5 text-[11px] font-semibold text-ink-on">
                {hinweis(t.href)}
              </span>
            )}
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
            {hinweis(t.href) && (
              <span className="ml-1 rounded-md bg-accent px-1 text-[10px] font-semibold text-ink-on">
                {hinweis(t.href)}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </>
  );
}
