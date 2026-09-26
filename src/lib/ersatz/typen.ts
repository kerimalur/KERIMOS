/**
 * Gewohnheiten ersetzen statt verbieten (26.09.2026).
 *
 * Kerims Gedanke: eine schlechte Gewohnheit direkt streichen endet im
 * Jojo-Effekt. Stattdessen: den Auslöser akzeptieren und festlegen, was
 * danach passiert — „Wenn mir langweilig ist, dann mache ich 10
 * Backtest-Trades statt am Handy zu hängen". Die alte Gewohnheit verliert
 * sich, weil die neue denselben Platz einnimmt.
 *
 * Drei Regeln, die das Werkzeug einhält:
 *
 *  1. Es zählt nur Erfolge. Keine Rückfall-Liste — wer seine Fehler schwarz
 *     auf weiss sieht, gibt an schlechten Tagen eher ganz auf.
 *  2. Der Ersatz muss dasselbe Bedürfnis bedienen wie die alte Gewohnheit
 *     (Langeweile, Stress, Belohnung). Deshalb das Feld „was sie dir gibt".
 *  3. Es dauert. Eine neue Gewohnheit braucht im Median etwa 66 Tage, bis
 *     sie automatisch läuft (Lally et al., 2010; Spanne 18–254). Die Anzeige
 *     zeigt den Weg dorthin, nicht einen Streak, der beim ersten Aussetzer
 *     auf null fällt.
 *
 * Rein rechnerisch, prüfbar mit `npm run check:ersatz`.
 */

export interface Ersatz {
  id: string;
  gewohnheit: string;
  ausloeser: string;
  bedeutung: string;
  ersatz: string;
  aktiv: boolean;
  erstellt: string;
  /** Tage (YYYY-MM-DD), an denen der Ersatz geklappt hat — mehrfach möglich. */
  erfolge: string[];
}

/** Median bis zur Automatik laut Lally et al. (2010). */
export const TAGE_BIS_GEWOHNHEIT = 66;

const tagMs = 86_400_000;
const tage = (von: string, bis: string) =>
  Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / tagMs);

/** Montag der Woche eines Datums. */
function montag(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Erfolge je Woche, die letzten `wochen` Wochen bis heute, älteste zuerst. */
export function wochenReihe(erfolge: string[], heute: string, wochen = 8): { woche: string; anzahl: number }[] {
  const diese = montag(heute);
  const out: { woche: string; anzahl: number }[] = [];
  for (let i = wochen - 1; i >= 0; i--) {
    const d = new Date(`${diese}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const w = d.toISOString().slice(0, 10);
    out.push({ woche: w, anzahl: erfolge.filter((e) => montag(e) === w).length });
  }
  return out;
}

export interface Fortschritt {
  /** Tage seit dem ersten Erfolg. Null, solange es keinen gibt. */
  dabeiSeit: number | null;
  /** Tage (unterschiedliche Kalendertage) mit mindestens einem Erfolg. */
  erfolgsTage: number;
  gesamt: number;
  /** 0…1 — Erfolgstage gegen die 66 Tage bis zur Automatik. */
  anteil: number;
  phase: "start" | "aufbau" | "festigung" | "sitzt";
  phaseText: string;
  /** Trend der letzten vier abgeschlossenen Wochen gegen die vier davor. */
  trend: "hoch" | "gleich" | "runter" | "neu";
}

/**
 * Wie weit die neue Gewohnheit ist.
 *
 * Gemessen an Erfolgstagen, nicht an einem Streak: ein verpasster Tag setzt
 * nichts zurück (auch das zeigt Lally: einzelne Aussetzer ändern am Aufbau
 * kaum etwas).
 */
export function fortschritt(e: Ersatz, heute: string): Fortschritt {
  const sortiert = [...e.erfolge].sort();
  const erfolgsTage = new Set(sortiert).size;
  const anteil = Math.min(1, erfolgsTage / TAGE_BIS_GEWOHNHEIT);
  const phase = erfolgsTage === 0 ? "start"
    : anteil < 0.3 ? "aufbau" : anteil < 1 ? "festigung" : "sitzt";

  // Nur ABGESCHLOSSENE Wochen vergleichen: die laufende ist am Montag fast
  // leer und würde jeden Trend nach unten ziehen.
  const reihe = wochenReihe(e.erfolge, heute, 9).slice(0, 8);
  const vorher = reihe.slice(0, 4).reduce((s, w) => s + w.anzahl, 0);
  const jetzt = reihe.slice(4).reduce((s, w) => s + w.anzahl, 0);
  const trend = vorher === 0 ? (jetzt > 0 ? "neu" : "gleich")
    : jetzt > vorher * 1.15 ? "hoch" : jetzt < vorher * 0.85 ? "runter" : "gleich";

  return {
    dabeiSeit: sortiert[0] ? tage(sortiert[0], heute) : null,
    erfolgsTage,
    gesamt: e.erfolge.length,
    anteil,
    phase,
    phaseText: {
      start: "Noch nicht gestartet — der erste Ersatz ist der wichtigste.",
      aufbau: "Aufbau — der Auslöser zieht noch zur alten Gewohnheit. Normal.",
      festigung: "Festigung — der Ersatz kommt öfter von selbst.",
      sitzt: "Sitzt — die neue Gewohnheit hat den Platz eingenommen.",
    }[phase],
    trend,
  };
}
