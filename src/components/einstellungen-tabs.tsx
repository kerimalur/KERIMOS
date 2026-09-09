"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Die Abschnitte der Einstellungen.
 *
 * Seit dem 09.09.2026 gibt es genau EINEN Ort für alles, was man einmal
 * einrichtet. Vorher lagen die Einstellungen dort, wo sie benutzt wurden —
 * die Alarme unter Trading, die Gewohnheiten mitten in ihrer Liste, die
 * Kacheln auf einer eigenen Seite ohne Zusammenhang. Das las sich beim Bauen
 * logisch und war beim Suchen unmöglich: „wo stelle ich das ein" hatte je
 * nach Sache eine andere Antwort.
 *
 * Die Regel jetzt: Wird etwas täglich angefasst, steht es auf der Seite
 * seines Bereichs. Wird es einmal eingerichtet, steht es hier.
 *
 * Kacheln und Daten führen auf ihre bestehenden Seiten. Sie hierher zu
 * kopieren hiesse, zwei Orte zu pflegen, an denen dasselbe steht.
 */
const TABS = [
  { href: "/einstellungen", label: "Design" },
  { href: "/einstellungen/planung", label: "Planung" },
  { href: "/einstellungen/gewohnheiten", label: "Gewohnheiten" },
  { href: "/einstellungen/trading", label: "Trading" },
  { href: "/links", label: "Kacheln" },
  { href: "/zuruecksetzen", label: "Daten" },
];

export function EinstellungenTabs() {
  const path = usePathname();
  const aktiv = (href: string) =>
    href === "/einstellungen" ? path === href : path.startsWith(href);

  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-xl bg-sand p-1">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href}
          className={cx(
            "rounded-lg px-4 py-1.5 text-sm font-medium transition",
            aktiv(t.href) ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
