"use client";
import { useEffect } from "react";

/**
 * Auffangstelle für Fehler aus Server Components und Server Actions.
 * Ohne diese Datei zeigt Next.js seine nackte Fehlerseite ohne Rückweg.
 */
export default function Error({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Landet in den Vercel-Logs - sonst wüsste man nur, DASS etwas kaputt ist
    console.error("KerimOS:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-2xl border border-line/70 bg-card p-6">
        <h1 className="font-display text-lg font-bold text-ink">Da ist etwas schiefgegangen</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Meist genügt ein neuer Versuch. Bleibt es dabei, steht die Ursache unten —
          häufig fehlt eine Umgebungsvariable oder die Datenbank war kurz nicht erreichbar.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={reset}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-ink-on transition hover:bg-accent-soft">
            Nochmal versuchen
          </button>
          <a href="/"
            className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:border-line-strong">
            Zur Startseite
          </a>
        </div>

        <details className="mt-5">
          <summary className="cursor-pointer text-xs text-ink-faint transition hover:text-ink-muted">
            Technische Meldung
          </summary>
          <p className="mt-2 break-words font-mono text-xs text-ink-muted">
            {error.message}
            {error.digest && <span className="block mt-1">Kennung: {error.digest}</span>}
          </p>
        </details>
      </div>
    </div>
  );
}
