/**
 * Der Tagesrückblick — drei Zeilen, jeden Abend.
 *
 * Der Zweck ist nicht Dokumentation, sondern Bewusstsein: zu merken, was aus
 * einem Tag geworden ist. Deshalb drei feste Fragen statt eines leeren Felds
 * — vor einem leeren Feld sitzt man abends und schreibt nichts — und deshalb
 * kurz genug, dass er auch an müden Tagen passiert.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit
 * `tools/checks/tagesrueckblick.mts`.
 */

export interface Rueckblick {
  datum: string;
  erreicht: string;
  liegengeblieben: string;
  morgen: string;
}

export const LEER: Omit<Rueckblick, "datum"> = {
  erreicht: "", liegengeblieben: "", morgen: "",
};

/**
 * Was noch frei geschrieben wird.
 *
 * „Was habe ich erreicht?" ist seit dem 24.08.2026 raus. Die Frage bekam
 * immer eine Antwort — abends findet man irgendetwas, das nach Ertrag
 * aussieht — und prüfte damit nichts. An ihrer Stelle steht der **Abgleich**
 * (`lib/abgleich.ts`): die Zeilen von gestern Abend, einzeln abgefragt.
 *
 * Das Feld `erreicht` bleibt in der Datenbank, damit die alten Einträge
 * lesbar bleiben. Gefragt wird danach nicht mehr.
 */
export const FRAGEN = [
  {
    feld: "liegengeblieben" as const,
    titel: "Was ist liegengeblieben?",
    hinweis: "Ohne Rechtfertigung — nur festhalten.",
  },
  {
    feld: "morgen" as const,
    titel: "Was ist morgen das Wichtigste?",
    hinweis: "Eine Sache. Nicht drei.",
  },
];

/** Ist überhaupt etwas eingetragen? Leere Rückblicke werden nicht gespeichert. */
export function hatInhalt(r: Omit<Rueckblick, "datum">): boolean {
  return [r.erreicht, r.liegengeblieben, r.morgen].some((t) => t.trim().length > 0);
}

/** Wie viele Fragen beantwortet sind — für die Anzeige „1 von 2". */
export const ANZAHL_FRAGEN = FRAGEN.length;

export function beantwortet(r: Omit<Rueckblick, "datum">): number {
  return FRAGEN.filter((f) => r[f.feld].trim().length > 0).length;
}

/**
 * Aus einem Formular lesen und dabei säubern.
 *
 * Getrimmt und auf 500 Zeichen begrenzt: Der Rückblick soll in einer Minute
 * gehen. Wer mehr schreiben will, tut das im Wochenrückblick — dort ist Platz
 * dafür vorgesehen.
 */
export const MAX_ZEICHEN = 500;

export function ausFormular(
  hole: (name: string) => string | null,
): Omit<Rueckblick, "datum"> {
  const text = (name: string): string =>
    (hole(name) ?? "").trim().slice(0, MAX_ZEICHEN);
  return {
    erreicht: text("erreicht"),
    liegengeblieben: text("liegengeblieben"),
    morgen: text("morgen"),
  };
}

/** Kurzfassung für die Startseite und die Telegram-Erinnerung. */
export function zusammenfassung(r: Rueckblick | null): string {
  if (!r || !hatInhalt(r)) return "Heute noch nichts festgehalten.";
  const n = beantwortet(r);
  // Reihenfolge: erst der Vorsatz für morgen, dann was liegenblieb. `erreicht`
  // ist Altbestand und wird nur noch gezeigt, wenn sonst nichts dasteht.
  const erste = r.morgen.trim() || r.liegengeblieben.trim() || r.erreicht.trim();
  const kurz = erste.length > 80 ? `${erste.slice(0, 77)}…` : erste;
  return `${n} von ${ANZAHL_FRAGEN} beantwortet · ${kurz}`;
}

/**
 * Wie viele der letzten Tage einen Rückblick haben.
 *
 * Steht auf der Seite, weil eine Serie das Einzige ist, was diese Gewohnheit
 * trägt. Eine Lücke ist kein Drama — zwei Wochen Lücke heissen, dass die
 * Erinnerung nicht funktioniert.
 */
export function serie(vorhandeneTage: string[], heute: string): number {
  const gesetzt = new Set(vorhandeneTage);
  let tage = 0;
  const d = new Date(`${heute}T12:00:00`);
  // Heute darf fehlen, ohne die Serie zu brechen - der Abend ist ja noch da.
  if (!gesetzt.has(heute)) d.setDate(d.getDate() - 1);
  for (;;) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!gesetzt.has(iso)) break;
    tage++;
    d.setDate(d.getDate() - 1);
  }
  return tage;
}
