/** Zwischenzustand, solange eine Seite ihre Daten holt. */
export default function Loading() {
  return (
    <div className="space-y-4 py-8">
      <div className="h-6 w-40 animate-pulse rounded-lg bg-sand" />
      <div className="h-28 animate-pulse rounded-2xl bg-sand/70" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-sand/60" />
        ))}
      </div>
    </div>
  );
}
