"use client";

import { useRef, useTransition } from "react";
import { watchlistKategorieSetzen } from "@/lib/trading-actions";
import type { Kategorie } from "@/lib/trading/kategorien";
import { cx } from "@/components/ui";

/**
 * Einen aktiven Trade in eine andere Kategorie schieben.
 *
 * Speichert beim Umschalten, ohne Knopf daneben. Ein „Übernehmen" je Zeile
 * wäre bei zehn Zeilen zehn zusätzliche Klickziele für eine Änderung, die
 * ohnehin sofort sichtbar wird — die Zeile springt in die andere Gruppe.
 *
 * Das ist der einzige Zustand auf dieser Seite, der ohne JavaScript nicht
 * ginge. Alles andere (Anlegen, Entfernen, Alarme) läuft über normale
 * Formulare und funktioniert auch dann.
 */
export function KategorieWahl({
  id, aktuell, kategorien,
}: { id: string; aktuell: string | null; kategorien: Kategorie[] }) {
  const [laeuft, starte] = useTransition();
  const feld = useRef<HTMLSelectElement>(null);

  if (kategorien.length === 0) return null;

  return (
    <select
      ref={feld}
      defaultValue={aktuell ?? ""}
      disabled={laeuft}
      aria-label="Kategorie"
      onChange={() => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("kategorie_id", feld.current?.value ?? "");
        starte(async () => { await watchlistKategorieSetzen(fd); });
      }}
      className={cx(
        "rounded-lg border border-line/70 bg-sand px-2 py-1 text-xs text-ink-muted",
        "transition hover:text-ink disabled:opacity-50",
      )}>
      <option value="">ohne Kategorie</option>
      {kategorien.map((k) => (
        <option key={k.id} value={k.id}>{k.name}</option>
      ))}
    </select>
  );
}
