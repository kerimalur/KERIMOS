import Link from "next/link";

/** Kopf der schlanken Seiten ausserhalb des Tradings: zurück + Titel. */
export function SeitenKopf({
  titel, unterzeile, rechts,
}: { titel: string; unterzeile?: React.ReactNode; rechts?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
          ← Startseite
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink">{titel}</h1>
        {unterzeile && <p className="mt-0.5 text-sm text-ink-muted">{unterzeile}</p>}
      </div>
      {rechts}
    </div>
  );
}
