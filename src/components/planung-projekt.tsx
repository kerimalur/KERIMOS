import {
  projektUmbenennen, projektLoeschen,
  meilensteinAnlegen, meilensteinAbhaken, meilensteinLoeschen,
} from "@/lib/planung-actions";
import type { Projekt } from "@/lib/planung-typen";
import { Bar, Button, Card, Input, cx } from "@/components/ui";

/**
 * Eine Projektkachel — Name, offene Aufgaben, und der Fortschritt, falls es
 * Meilensteine gibt.
 *
 * **Warum der Balken die Meilensteine misst und nicht die Aufgaben.** „5 von
 * 8 Aufgaben erledigt" wäre eine Aussage über Betriebsamkeit: wer während
 * eines Umzugs zwanzig Kleinigkeiten einträgt, fällt im Balken zurück,
 * obwohl er vorangekommen ist. Und ein Projekt ohne Ende („Haushalt") hätte
 * einen Balken, der nie voll wird und deshalb nichts sagt.
 *
 * Ein Meilenstein ist das, was Kerim selbst als Etappe benennt. Wer keine
 * setzt, bekommt keinen Balken — das ist die richtige Vorgabe, kein
 * fehlendes Feature.
 *
 * Etappen lassen sich jederzeit nachtragen, abhaken und löschen. Ein Projekt
 * ändert unterwegs seine Etappen; ein Modell, das nur beim Anlegen zuhört,
 * wäre nach zwei Wochen falsch.
 */
export function PlanungProjekt({ p }: { p: Projekt }) {
  const fertig = p.meilensteine.filter((m) => m.erledigt).length;
  const gesamt = p.meilensteine.length;
  const anteil = gesamt > 0 ? (fertig / gesamt) * 100 : 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: p.farbe }} />
          <span className="truncate font-display text-base font-bold text-ink">
            {p.name}
          </span>
        </span>
        <span className="tabular shrink-0 text-xs text-ink-muted">
          {p.offen > 0 ? `${p.offen} offen` : p.gesamt > 0 ? "fertig" : "leer"}
        </span>
      </div>

      {/* Der Balken erscheint nur mit Meilensteinen. Ohne sie stünde da eine
          Grafik, die entweder immer leer oder immer voll ist. */}
      {gesamt > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-ink-muted">
              {fertig} von {gesamt} Etappen
            </span>
            {fertig === gesamt && (
              <span className="text-[11px] font-medium text-good">durch</span>
            )}
          </div>
          <Bar pct={anteil} color={p.farbe} />
        </div>
      )}

      {/* Die Etappen selbst. Immer sichtbar, wenn es welche gibt — sie sind
          der Grund, warum man auf ein Projekt schaut. */}
      {gesamt > 0 && (
        <ul className="mt-3 space-y-0.5">
          {p.meilensteine.map((m) => (
            <li key={m.id} className="group flex items-center gap-2">
              <form action={meilensteinAbhaken} className="shrink-0">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="done" value={m.erledigt ? "0" : "1"} />
                <button type="submit"
                  aria-label={m.erledigt ? "wieder öffnen" : "erledigt"}
                  className={cx(
                    "grid h-[16px] w-[16px] place-items-center rounded border",
                    "text-[9px] transition duration-150 ease-tactile active:scale-90",
                    m.erledigt
                      ? "border-good/50 bg-good-tint text-good-bright"
                      : "border-line-strong text-transparent hover:border-accent")}>
                  ✓
                </button>
              </form>

              <span className={cx("min-w-0 flex-1 truncate text-xs",
                m.erledigt ? "text-ink-faint line-through" : "text-ink-soft")}>
                {m.name}
              </span>

              <form action={meilensteinLoeschen} className="shrink-0">
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" aria-label="Etappe löschen"
                  className="px-1 text-[11px] text-ink-faint opacity-0 transition
                             hover:text-bad group-hover:opacity-100">
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* Eine Zeile zum Nachtragen, immer da. Kein Dialog: eine Etappe ist
          ein Name und sonst nichts — ein Popup dafür wäre mehr Weg als Inhalt. */}
      <form action={meilensteinAnlegen} className="mt-2 flex items-center gap-1.5">
        <input type="hidden" name="project_id" value={p.id} />
        <Input name="name" required aria-label="Neue Etappe"
          placeholder={gesamt === 0 ? "Etappe hinzufügen …" : "weitere Etappe …"}
          className="w-full py-1 text-xs" />
        <Button type="submit" variant="ghost" className="shrink-0 px-2 py-1 text-xs">
          +
        </Button>
      </form>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-ink-faint
                            transition hover:text-ink-muted">
          Projekt ändern
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <form action={projektUmbenennen} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={p.id} />
            <Input name="name" defaultValue={p.name} required
              aria-label="Name" className="w-36 py-1 text-xs" />
            <Input name="color" type="color" defaultValue={p.farbe}
              aria-label="Farbe" className="h-8 w-12 p-1" />
            <Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs">
              Speichern
            </Button>
          </form>
          <form action={projektLoeschen}>
            <input type="hidden" name="id" value={p.id} />
            <Button type="submit" variant="danger" className="px-2.5 py-1 text-xs">
              Löschen
            </Button>
          </form>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Löschen entfernt das Projekt und seine Etappen. Die {p.gesamt}{" "}
          zugehörigen Aufgaben bleiben stehen und stehen danach ohne Projekt da.
        </p>
      </details>
    </Card>
  );
}
