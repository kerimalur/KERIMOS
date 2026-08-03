import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { Essenszeiten } from "@/components/essenszeiten";

export const dynamic = "force-dynamic";

/** Alles jetzt in KerimOS - die alte Menü-App wird nicht mehr gebraucht. */
const HIER = [
  { href: "/m/Essen/rezepte", titel: "Rezepte",
    text: "Mengen pro Portion, Favoriten, Zutaten bearbeiten" },
  { href: "/m/Essen/lebensmittel", titel: "Lebensmittel",
    text: "Kalorien, Protein, Kohlenhydrate, Fett, Preis" },
  { href: "/m/Essen/analyse", titel: "Auswertung",
    text: "Verlauf von Kalorien, Protein und Kosten, Rankings" },
  { href: "/m/Essen/einstellungen", titel: "Einstellungen",
    text: "Tagesziele, Standard-Mahlzeiten, Event-Regeln, Kategorien" },
];

export default function EssenMehrPage() {
  return (
    <div className="space-y-5">
    <Essenszeiten />

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
    </div>
  );
}
