import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const MENU_APP = "https://men-plan-kerim-alurs-projects.vercel.app";

/**
 * Alles, was man selten braucht: Rezepte, Lebensmittel, Auswertung,
 * Einstellungen. Liegt noch in der Menü-App und wird nach Prep übernommen.
 */
const BEREICHE = [
  { href: `${MENU_APP}/rezepte`, titel: "Rezepte",
    text: "Mengen pro Portion, Favoriten, Kategorien" },
  { href: `${MENU_APP}/datenbank`, titel: "Lebensmittel",
    text: "Kalorien, Protein, Preis pro 100" },
  { href: `${MENU_APP}/auswertung`, titel: "Auswertung",
    text: "Verlauf von Kalorien, Protein und Kosten" },
  { href: `${MENU_APP}/mehr`, titel: "Einstellungen",
    text: "Tagesziele, Standard-Frühstück, Vorlagen" },
];

export default function EssenMehrPage() {
  return (
    <>
      <Card>
        <CardTitle>Mehr</CardTitle>
        <ul className="divide-y divide-line">
          {BEREICHE.map((b) => (
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
      </Card>

      <Card>
        <CardTitle>Übernahme</CardTitle>
        <p className="text-sm text-ink-muted">
          Heute, Plan und Einkauf laufen in KerimOS. Prep, Rezepte, Lebensmittel
          und Auswertung folgen — bis dahin öffnen die Verweise oben die Menü-App,
          die auf derselben Datenbank arbeitet.
        </p>
      </Card>
    </>
  );
}
