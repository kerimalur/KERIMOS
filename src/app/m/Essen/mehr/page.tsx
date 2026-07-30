import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const MENU_APP = "https://men-plan-kerim-alurs-projects.vercel.app";

/** In KerimOS übernommen. */
const HIER = [
  { href: "/m/Essen/rezepte", titel: "Rezepte",
    text: "Mengen pro Portion, Favoriten, Zutaten bearbeiten" },
  { href: "/m/Essen/lebensmittel", titel: "Lebensmittel",
    text: "Kalorien, Protein, Kohlenhydrate, Fett, Preis" },
];

/** Noch in der Menü-App. */
const DORT = [
  { href: `${MENU_APP}/auswertung`, titel: "Auswertung",
    text: "Verlauf von Kalorien, Protein und Kosten" },
  { href: `${MENU_APP}/mehr`, titel: "Einstellungen",
    text: "Tagesziele, Standard-Frühstück" },
];

export default function EssenMehrPage() {
  return (
    <>
      <Card>
        <CardTitle>Verwalten</CardTitle>
        <ul className="divide-y divide-line">
          {HIER.map((b) => (
            <li key={b.href}>
              <Link href={b.href}
                className="flex items-center justify-between gap-3 py-3 transition hover:text-accent-soft">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{b.titel}</span>
                  <span className="block text-xs text-ink-muted">{b.text}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-faint">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Noch in der Menü-App</CardTitle>
        <ul className="divide-y divide-line">
          {DORT.map((b) => (
            <li key={b.href}>
              <Link href={b.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 py-3 transition hover:text-accent-soft">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{b.titel}</span>
                  <span className="block text-xs text-ink-muted">{b.text}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-faint">↗</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Beide Apps arbeiten auf derselben Datenbank — was du dort änderst,
          steht hier sofort.
        </p>
      </Card>
    </>
  );
}
