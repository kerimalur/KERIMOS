import Link from "next/link";
import { PlanungBereich } from "@/components/planung-bereich";

export const dynamic = "force-dynamic";

/**
 * Planung als eigene Seite — derselbe Aufbau wie auf der Startseite, nur
 * ohne alles andere drumherum.
 *
 * Der Bereich steht seit dem 09.09.2026 fest auf der Startseite; diese Seite
 * bleibt für den Fall, dass man nur die Planung sehen will (der ▤-Knopf oben
 * führt hierher). Beide zeigen dieselbe Komponente — zwei Abschriften wären
 * zwei Orte für dieselbe Änderung.
 */
export default async function PlanungPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const { monat } = await searchParams;

  return (
    <div className="py-6">
      <div className="mb-5">
        <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
          ← Startseite
        </Link>
        <h1 className="font-display mt-1 text-2xl font-bold leading-tight text-ink">
          Planung
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Kalender, Aufgaben und die Projekte dahinter. Ein Eintrag braucht nur
          einen Namen — Art, Datum und Projekt kommen dazu, wenn sie etwas
          klären, und nicht vorher.
        </p>
      </div>

      <PlanungBereich monat={monat} basis="/planung" kompakt />
    </div>
  );
}
