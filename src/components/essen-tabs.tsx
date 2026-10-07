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
/**
 * „Prep" ist am 24.08.2026 aus der Leiste geflogen. Seit Tage kopiert und
 * verschoben werden können, macht das Kopieren die Arbeit, die vorher der
 * Prep-Planer gemacht hat; die Rezeptideen stehen unter Rezepte, und wie oft
 * ein Gericht gekocht werden muss, sagt der Kochen-Tab. Der Kühlschrank-Stand
 * — das eine Nützliche daran — steht jetzt unten auf der Heute-Seite.
 */
const TABS = [
  { href: "/m/Essen", label: "Heute" },
  { href: "/m/Essen/plan", label: "Plan" },
  { href: "/m/Essen/kochen", label: "Kochen" },
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
        || path.startsWith("/m/Essen/lebensmittel")
        || path.startsWith("/m/Essen/analyse")
        || path.startsWith("/m/Essen/einkauf")
        || path.startsWith("/m/Essen/einstellungen");
    }
    return path.startsWith(href);
  };

  return (
    <>
      {/* Seit Design D (07.10.2026) überall oben: unten liegt jetzt die
          schwebende Leiste der ganzen App, zwei Leisten übereinander
          verwirren mehr, als sie helfen. */}
      <nav className="flex items-center gap-1 overflow-x-auto rounded-full bg-sand p-1">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href}
            className={cx("min-h-[40px] shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition",
              aktiv(t.href) ? "bg-card text-ink shadow-card" : "text-ink-muted hover:text-ink-soft")}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
