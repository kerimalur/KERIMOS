"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardTitle, cx } from "@/components/ui";
import type { ChecklistPunkt } from "@/lib/backtest-types";

/**
 * Checkliste vor dem Trade.
 *
 * Die Haken sind bewusst NICHT gespeichert: die Liste soll bei jedem Setup
 * neu durchgegangen werden, nicht einmal abgehakt bleiben. "Alles
 * zurücksetzen" ist deshalb der normale Schritt zwischen zwei Trades.
 */
export function BacktestCheckliste({ punkte }: { punkte: ChecklistPunkt[] }) {
  const [gehakt, setGehakt] = useState<Set<string>>(new Set());

  if (punkte.length === 0) {
    return (
      <Card>
        <CardTitle>Checkliste</CardTitle>
        <p className="text-xs text-ink-muted">
          Noch keine Punkte.{" "}
          <Link href="/trading/backtest/kategorien" className="text-accent-soft hover:underline">
            In den Einstellungen anlegen ↗
          </Link>
        </p>
      </Card>
    );
  }

  const alle = punkte.length;
  const fertig = punkte.filter((p) => gehakt.has(p.id)).length;
  const komplett = fertig === alle;

  function umschalten(id: string) {
    setGehakt((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id); else neu.add(id);
      return neu;
    });
  }

  return (
    <Card className={cx(komplett && "border-good/40")}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Checkliste</CardTitle>
        <span className="flex items-center gap-3">
          <span className={cx("tabular text-xs", komplett ? "text-good" : "text-ink-muted")}>
            {fertig} / {alle}
          </span>
          {fertig > 0 && (
            <button type="button" onClick={() => setGehakt(new Set())}
              className="text-xs text-ink-faint transition hover:text-ink-soft">
              zurücksetzen
            </button>
          )}
          <Link href="/trading/backtest/kategorien" title="Checkliste bearbeiten"
            className="text-xs text-ink-faint transition hover:text-accent-soft">
            bearbeiten
          </Link>
        </span>
      </div>

      <ul className="space-y-1">
        {punkte.map((p) => {
          const an = gehakt.has(p.id);
          return (
            <li key={p.id}>
              <label className={cx(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition",
                an ? "text-ink-faint line-through" : "text-ink-soft hover:bg-sand/60")}>
                <input type="checkbox" checked={an} onChange={() => umschalten(p.id)}
                  className="accent-accent" />
                {p.label}
              </label>
            </li>
          );
        })}
      </ul>

      {komplett && (
        <p className="mt-2 text-xs text-good">Alles geprüft.</p>
      )}
    </Card>
  );
}
