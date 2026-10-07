/**
 * Kopf der schlanken Seiten ausserhalb des Tradings.
 * Seit Design D (07.10.2026) ohne „← Startseite“: dafür gibt es unten die
 * Leiste mit „Heute“, und oben steht das Titelbild des Bereichs.
 */
export function SeitenKopf({
  titel, unterzeile, rechts,
}: { titel: string; unterzeile?: React.ReactNode; rechts?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink">{titel}</h1>
        {unterzeile && <p className="mt-0.5 text-sm text-ink-muted">{unterzeile}</p>}
      </div>
      {rechts}
    </div>
  );
}
