"use client";
import { useState } from "react";
import { tagLoeschen, tagVerschieben, tagKopieren } from "@/lib/essen-tag-actions";
import { Button, Input, cx } from "@/components/ui";

/**
 * Die drei Pünktchen an einem Tag.
 *
 * Ein Klick öffnet die Auswahl: welche Mahlzeiten, wohin, und was damit
 * geschehen soll. Standardmässig sind alle angehakt — der häufige Fall ist
 * „ganzer Tag", der wichtige Fall ist „nur drei von fünf". Beides mit
 * derselben Oberfläche.
 *
 * Zwei Varianten, weil es zwei sehr verschiedene Orte gibt:
 *
 *   dropdown  Klappt unter dem Tag auf. Für breite Zeilen — Whiteboard und
 *             Wochenliste. Auf dem Handy leichter zu treffen als ein Overlay,
 *             das man wieder wegtippen muss.
 *   blatt     Legt sich als Blatt über den Bildschirm. Für das Monatsraster:
 *             eine Tageskachel ist keine 50 Pixel breit, ein 288 Pixel
 *             breites Fenster daran zu verankern läuft je nach Spalte links
 *             oder rechts aus dem Bild. Das Blatt hat dieses Problem nicht
 *             und nennt oben das Datum, weil es losgelöst von der Kachel steht.
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
  datum, mahlzeiten, standardZiel, variante = "dropdown",
}: {
  datum: string;
  mahlzeiten: MenueMahlzeit[];
  /** Vorschlag fürs Zielfeld — der Folgetag. */
  standardZiel: string;
  variante?: "dropdown" | "blatt";
}) {
  const [offen, setOffen] = useState(false);
  const blatt = variante === "blatt";

  if (mahlzeiten.length === 0) {
    // Im Monatsraster gar nichts zeigen: eine graue Ellipse in jeder leeren
    // Kachel wäre nur Rauschen. In der Zeile darf der Platzhalter stehen
    // bleiben, damit die Spalten nicht springen.
    if (blatt) return null;
    return (
      <span className="px-1 text-ink-faint" title="Keine Mahlzeiten an diesem Tag">
        ⋯
      </span>
    );
  }

  const inhalt = (
    <form className="space-y-3">
      {blatt && (
        <div className="text-xs font-medium text-ink">
          {new Date(datum + "T12:00:00").toLocaleDateString("de-CH", {
            weekday: "long", day: "numeric", month: "long",
          })}
        </div>
      )}

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
        <label htmlFor={`ziel-${variante}-${datum}`}
          className="mb-1 block text-xs font-medium text-ink">
          Zieltag
        </label>
        <Input id={`ziel-${variante}-${datum}`} name="ziel" type="date"
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
  );

  return (
    <span className="relative">
      <button type="button" onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        aria-label={`Mahlzeiten vom ${datum} verschieben, kopieren oder löschen`}
        title="Tag verschieben, kopieren oder löschen"
        className={cx("rounded-lg transition",
          blatt ? "px-1 py-0 text-[11px] leading-none" : "px-1.5 py-0.5 text-sm",
          offen ? "bg-accent text-ink-on"
            // Im Monatsraster sitzt der Punkt auch auf eingefärbten Kacheln —
            // ink-faint verschwindet dort, ink-muted trägt noch.
            : blatt ? "text-ink-muted hover:text-ink"
              : "text-ink-faint hover:text-ink")}>
        ⋯
      </button>

      {offen && !blatt && (
        <div className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)]
                        rounded-2xl border border-line bg-card p-3 shadow-card">
          {inhalt}
        </div>
      )}

      {offen && blatt && (
        <>
          {/* Tippen daneben schliesst. Als Knopf, damit es auch mit der
              Tastatur erreichbar ist und nicht nur mit der Maus. */}
          <button type="button" aria-label="Schliessen"
            onClick={() => setOffen(false)}
            className="fixed inset-0 z-40 cursor-default bg-ink/50" />
          <div className="fixed inset-x-3 bottom-3 z-50 max-h-[80vh] overflow-y-auto
                          rounded-2xl border border-line bg-card p-3 shadow-card
                          sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-80
                          sm:-translate-x-1/2 sm:-translate-y-1/2">
            {inhalt}
          </div>
        </>
      )}
    </span>
  );
}
