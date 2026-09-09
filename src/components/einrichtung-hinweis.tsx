import Link from "next/link";
import { Card } from "@/components/ui";

/**
 * „Diese Karte fehlt, weil eine Migration noch nicht gelaufen ist."
 *
 * Der Grund für diese Komponente ist ein Fehler, der einen halben Tag
 * gekostet hat: Die Gewohnheiten-Karte blendete sich bei fehlender Tabelle
 * einfach aus — dieselbe Regel wie „heute steht nichts an". Auf der
 * Startseite war danach schlicht kein Unterschied zwischen „noch nicht
 * eingerichtet" und „nichts zu tun" zu sehen, und die Suche ging in die
 * falsche Richtung.
 *
 * Stilles Ausblenden ist richtig, wenn nichts anliegt. Es ist falsch, wenn
 * etwas kaputt oder unfertig ist: dann muss die Oberfläche es sagen, und
 * zwar dort, wo man hinschaut.
 */
export function EinrichtungHinweis({
  titel, datei, ziel,
}: {
  titel: string;
  /** Die Migration, die fehlt — der Dateiname ist die ganze Anleitung. */
  datei: string;
  /** Wohin es geht, um das SQL zum Kopieren zu sehen. */
  ziel: string;
}) {
  return (
    <Card className="border-warn/30 bg-warn-tint/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase
                         tracking-[0.12em] text-ink-muted">
          {titel}
        </span>
        <Link href={ziel} className="text-xs text-accent-soft hover:underline">
          SQL ansehen ↗
        </Link>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Noch nicht eingerichtet: <code className="rounded bg-sand px-1 py-0.5 text-xs">
          {datei}
        </code> muss einmal im Supabase-SQL-Editor laufen. Bis dahin bleibt
        dieser Teil leer.
      </p>
    </Card>
  );
}
