"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Tab-Leiste des Essen-Bereichs.
 *
 * Auf dem Handy klebt sie unten am Rand - dort liegt der Daumen. Am Computer
 * sitzt sie oben als normale Reiterzeile.
 */
const TABS = [
  { href: "/m/Essen", label: "Heute" },
  { href: "/m/Essen/plan", label: "Plan" },
  { href: "/m/Essen/prep", label: "Prep" },
  { href: "/m/Essen/einkauf", label: "Einkauf" },
  { href: "/m/Essen/mehr", label: "Mehr" },
];

export function EssenTabs() {
  const path = usePathname();
  // "Mehr" bleibt aktiv, solange man in einem seiner Unterbereiche ist
  const aktiv = (href: string) => {
    if (href === "/m/Essen") return path === href;
    if (href === "/m/Essen/mehr") {
      return path.startsWith(href)
        || path.startsWith("/m/Essen/rezepte")
        || path.startsWith("/m/Essen/lebensmittel");
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
