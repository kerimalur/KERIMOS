import Link from "next/link";
import { fetchBacktestCategories } from "@/lib/supabase/backtest";
import {
  addBacktestTag, renameBacktestTag, archiveBacktestTag, reaktiviereBacktestTag,
} from "@/lib/backtest-actions";
import { Card, CardTitle, Input, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Eigene Unterseite statt Karte auf /trading/backtest - Tag-Pflege ist
 * seltene Wartung, keine tägliche Ansicht. Ausgelagert, damit der
 * Haupttab beim täglichen Erfassen nicht überfüllt wirkt.
 */
export default async function BacktestKategorienPage() {
  const categoriesAlle = await fetchBacktestCategories(true); // inkl. archivierte

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Kategorien</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Tags fürs Backtest-Journal - hinzufügen, umbenennen, archivieren.{" "}
          <Link href="/trading/backtest" className="text-accent-soft hover:underline">
            Zurück zum Journal ↗
          </Link>
        </p>
      </div>

      <Card>
        <p className="mb-4 text-xs text-ink-muted">
          Archivierte Tags verschwinden nur aus dem Trade-Formular, bestehende
          Trades behalten sie.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {categoriesAlle.map((cat) => {
            const aktive = cat.tags.filter((t) => !t.archived);
            const archiviert = cat.tags.filter((t) => t.archived);
            return (
              <div key={cat.id}>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {cat.label}
                </div>
                <ul className="mb-2 space-y-1.5">
                  {aktive.map((t) => (
                    <li key={t.id} className="flex items-center gap-1.5">
                      <form action={renameBacktestTag} className="flex flex-1 items-center gap-1.5">
                        <input type="hidden" name="id" value={t.id} />
                        <Input name="label" defaultValue={t.label} className="h-8 py-1 text-xs" />
                        <button type="submit" className="text-xs text-ink-faint transition hover:text-accent-soft">
                          speichern
                        </button>
                      </form>
                      <form action={archiveBacktestTag}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-ink-faint transition hover:text-bad">
                          archivieren
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={addBacktestTag} className="flex items-center gap-1.5">
                  <input type="hidden" name="category_id" value={cat.id} />
                  <Input name="label" placeholder="Neuer Tag" className="h-8 flex-1 py-1 text-xs" />
                  <Button type="submit" variant="ghost" className="h-8 px-2.5 py-1 text-xs">+</Button>
                </form>
                {archiviert.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-ink-faint">
                      {archiviert.length} archiviert
                    </summary>
                    <ul className="mt-1.5 space-y-1">
                      {archiviert.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-1.5 text-xs text-ink-faint">
                          <span>{t.label}</span>
                          <form action={reaktiviereBacktestTag}>
                            <input type="hidden" name="id" value={t.id} />
                            <button className="text-accent-soft hover:underline">reaktivieren</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
