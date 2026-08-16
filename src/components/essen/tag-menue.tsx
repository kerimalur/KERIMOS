"use client";
import { useState } from "react";
import { tagLoeschen, tagVerschieben, tagKopieren } from "@/lib/essen-tag-actions";
import { Button, Input, cx } from "@/components/ui";

/**
 * Die drei Pünktchen an jedem Wochentag.
 *
 * Ein Klick öffnet die Auswahl: welche Mahlzeiten, wohin, und was damit
 * geschehen soll. Standardmässig sind alle angehakt — der häufige Fall ist
 * „ganzer Tag", der wichtige Fall ist „nur drei von fünf". Beides mit
 * derselben Oberfläche.
 *
 * Bewusst kein Dialog-Element und kein Portal: die Karte klappt unter dem
 * Tag auf. Auf dem Handy ist ein aufklappender Block leichter zu treffen als
 * ein Overlay, das man wieder wegtippen muss.
 */

export interface MenueMahlzeit {
  id: string;
  meal_type: string;
  name: string;
  kcal: number;
}

const TYP_LABEL: Record<string, string> = {
  fruehstueck: "Frühstück",
  mittagessen: "Mittag",
  abendessen: "Abend",
  snack: "Snack",
};

export function TagMenue({
  datum, mahlzeiten, standardZiel,
}: {
  datum: string;
  mahlzeiten: MenueMahlzeit[];
  /** Vorschlag fürs Zielfeld — der Folgetag. */
  standardZiel: string;
}) {
  const [offen, setOffen] = useState(false);

  if (mahlzeiten.length === 0) {
    return (
      <span className="px-1 text-ink-faint" title="Keine Mahlzeiten an diesem Tag">
        ⋯
      </span>
    );
  }

  return (
    <span className="relative">
      <button type="button" onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        title="Tag verschieben, kopieren oder löschen"
        className={cx("rounded-lg px-1.5 py-0.5 text-sm transition",
          offen ? "bg-accent text-ink-on" : "text-ink-faint hover:text-ink")}>
        ⋯
      </button>

      {offen && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-2xl border border-line
                        bg-card p-3 shadow-card">
          <form className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-ink">
                Was soll mit?
              </div>
              <ul className="space-y-1">
                {mahlzeiten.map((m) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg
                                      px-1.5 py-1 text-xs hover:bg-sand">
                      <input type="checkbox" name="mahlzeit" value={m.id}
                        defaultChecked className="accent-accent" />
                      <span className="text-ink-muted">
                        {TYP_LABEL[m.meal_type] ?? m.meal_type}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">{m.name}</span>
                      <span className="tabular shrink-0 text-ink-faint">{m.kcal}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label htmlFor={`ziel-${datum}`}
                className="mb-1 block text-xs font-medium text-ink">
                Zieltag
              </label>
              <Input id={`ziel-${datum}`} name="ziel" type="date"
                defaultValue={standardZiel} className="text-xs" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button type="submit" formAction={tagVerschieben}
                variant="ghost" className="px-2.5 py-1 text-xs">
                Verschieben
              </Button>
              <Button type="submit" formAction={tagKopieren}
                variant="ghost" className="px-2.5 py-1 text-xs">
                Kopieren
              </Button>
              <Button type="submit" formAction={tagLoeschen}
                variant="danger" className="ml-auto px-2.5 py-1 text-xs">
                Löschen
              </Button>
            </div>

            <p className="text-[11px] leading-relaxed text-ink-faint">
              <strong>Verschieben</strong> nimmt die Mahlzeiten von hier weg,
              <strong> Kopieren</strong> lässt sie stehen und legt sie zusätzlich
              beim Zieltag an. Löschen braucht keinen Zieltag.
            </p>
          </form>
        </div>
      )}
    </span>
  );
}
