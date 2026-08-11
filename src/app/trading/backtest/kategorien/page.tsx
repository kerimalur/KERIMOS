import Link from "next/link";
import { fetchBacktestCategories, fetchChecklist } from "@/lib/supabase/backtest";
import {
  addBacktestTag, renameBacktestTag, archiveBacktestTag, reaktiviereBacktestTag,
  addChecklistPunkt, renameChecklistPunkt, archiveChecklistPunkt,
} from "@/lib/backtest-actions";
import { Card, CardTitle, Input, Button, Empty } from "@/components/ui";
import { R_FAKTOR_STANDARD, RESULT_LABEL, type BacktestResult } from "@/lib/backtest-types";

export const dynamic = "force-dynamic";

/**
 * Eigene Unterseite statt Karte auf /trading/backtest - Tag-Pflege ist
 * seltene Wartung, keine tägliche Ansicht. Ausgelagert, damit der
 * Haupttab beim täglichen Erfassen nicht überfüllt wirkt.
 */
export default async function BacktestKategorienPage() {
  const [categoriesAlle, checkliste] = await Promise.all([
    fetchBacktestCategories(true), // inkl. archivierte
    fetchChecklist(true),
  ]);
  const aktiveP = checkliste.filter((p) => !p.archived);
  const archivP = checkliste.filter((p) => p.archived);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Einstellungen</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Checkliste und Tags fürs Backtest-Journal.{" "}
          <Link href="/trading/backtest" className="text-accent-soft hover:underline">
            Zurück zum Journal ↗
          </Link>
        </p>
      </div>

      <Card>
        <CardTitle>Checkliste vor dem Trade</CardTitle>
        <p className="mb-4 text-xs text-ink-muted">
          Steht beim Eintragen immer oben. Die Haken werden bewusst nicht
          gespeichert - die Liste soll bei jedem Setup neu durchgegangen werden.
        </p>

        {aktiveP.length === 0 ? (
          <Empty>Noch kein Punkt angelegt.</Empty>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {aktiveP.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5">
                <form action={renameChecklistPunkt} className="flex flex-1 items-center gap-1.5">
                  <input type="hidden" name="id" value={p.id} />
                  <Input name="label" defaultValue={p.label} className="h-8 py-1 text-xs" />
                  <button type="submit"
                    className="shrink-0 text-xs text-ink-faint transition hover:text-accent-soft">
                    speichern
                  </button>
                </form>
                <form action={archiveChecklistPunkt}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-xs text-ink-faint transition hover:text-bad">
                    entfernen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addChecklistPunkt} className="flex items-center gap-1.5">
          <Input name="label" placeholder="Neuer Punkt, z. B. BOS per Kerzenschluss?"
            className="h-8 flex-1 py-1 text-xs" />
          <Button type="submit" variant="ghost" className="h-8 px-2.5 py-1 text-xs">+</Button>
        </form>

        {archivP.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-ink-faint">
              {archivP.length} entfernt
            </summary>
            <ul className="mt-1.5 space-y-1">
              {archivP.map((p) => (
                <li key={p.id}
                  className="flex items-center justify-between gap-2 text-xs text-ink-faint">
                  <span>{p.label}</span>
                  <form action={archiveChecklistPunkt}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="wieder" value="1" />
                    <button className="text-accent-soft hover:underline">zurückholen</button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card>
        <CardTitle>R-Berechnung</CardTitle>
        <p className="mb-3 text-xs text-ink-muted">
          So wird aus dem geplanten RR das erreichte R. Die Faktoren stammen
          aus deinem alten Sheet — über alle migrierten Trades lag das
          Verhältnis konstant bei diesen Werten.
        </p>
        <ul className="space-y-1 text-sm text-ink-soft">
          {(Object.keys(RESULT_LABEL) as BacktestResult[]).map((k) => {
            const f = R_FAKTOR_STANDARD[k];
            return (
              <li key={k} className="flex justify-between gap-3">
                <span>{RESULT_LABEL[k]}</span>
                <span className="tabular text-ink-muted">
                  {f === null ? "kein R"
                    : k === "full_tp" || k === "teil_tp_be" ? `${f} × RR`
                      : `${f > 0 ? "+" : ""}${f} R`}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] text-ink-faint">
          Im Formular lässt sich der berechnete Wert jederzeit überschreiben.
        </p>
      </Card>

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
