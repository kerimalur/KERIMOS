/**
 * Routinen — Ziele und was man dafür tut (26.09.2026).
 *
 * Kerims Gedanke: Ziele zu haben ist schön, aber man soll sehen, was man
 * dafür TUT. Schreibt man es auf, merkt man schnell, wenn es zu wenig ist.
 * Deshalb hängt an jedem Ziel eine Liste von Handlungen mit Wochentagen —
 * und die Seite zählt, wie oft pro Woche man etwas für das Ziel tut.
 *
 * Alles hier ist rein rechnerisch und ohne Datenbank prüfbar
 * (`npm run check:routinen`).
 */

export interface Handlung {
  id: string;
  ziel_id: string;
  titel: string;
  /** Wochentage wie Date.getDay(): 0 = Sonntag … 6 = Samstag. */
  tage: number[];
  /** "HH:MM" oder null — mit Uhrzeit kommt eine eigene Push-Meldung. */
  uhrzeit: string | null;
  zuletzt_erinnert: string | null;
  reihenfolge: number;
}

export interface RoutineZiel {
  id: string;
  titel: string;
  notiz: string;
  reihenfolge: number;
  handlungen: Handlung[];
}

/** In der Anzeige beginnt die Woche am Montag. */
export const WOCHENTAGE: { tag: number; kurz: string }[] = [
  { tag: 1, kurz: "Mo" }, { tag: 2, kurz: "Di" }, { tag: 3, kurz: "Mi" },
  { tag: 4, kurz: "Do" }, { tag: 5, kurz: "Fr" }, { tag: 6, kurz: "Sa" }, { tag: 0, kurz: "So" },
];

/** Uhrzeit, zu der die Sammelmeldung für Handlungen ohne eigene Zeit kommt. */
export const SAMMEL_MINUTEN = 7 * 60;

/** Wie lange nach der Sollzeit eine Meldung noch nachgeholt wird. */
export const NACHHOLFENSTER = 90;

export function minutenAus(uhrzeit: string | null): number | null {
  if (!uhrzeit) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(uhrzeit);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** "07:30:00" → "07:30" */
export const uhrzeitKurz = (u: string | null) => (u ? u.slice(0, 5) : null);

export function istHeute(h: Handlung, wochentag: number): boolean {
  return h.tage.includes(wochentag);
}

/** Wie oft pro Woche man etwas für das Ziel tut. */
export function proWoche(z: RoutineZiel): number {
  return z.handlungen.reduce((s, h) => s + h.tage.length, 0);
}

/** Heute fällige Handlungen, nach Ziel gruppiert; Ziele ohne heutige Handlung fallen weg. */
export function heuteFaellig(ziele: RoutineZiel[], wochentag: number) {
  return ziele
    .map((z) => ({
      ziel: z,
      handlungen: z.handlungen
        .filter((h) => istHeute(h, wochentag))
        .sort((a, b) => (minutenAus(a.uhrzeit) ?? 9999) - (minutenAus(b.uhrzeit) ?? 9999)),
    }))
    .filter((g) => g.handlungen.length > 0);
}

export interface Jetzt {
  datum: string;
  wochentag: number;
  minuten: number;
}

/**
 * Was der Cron-Lauf jetzt melden muss.
 *
 * Eine Handlung mit Uhrzeit wird gemeldet, sobald die Zeit erreicht ist —
 * und bis zu 90 Minuten danach noch nachgeholt, falls ein Lauf ausfällt.
 * Handlungen ohne Uhrzeit gehen gesammelt um 07:00 raus. `zuletzt_erinnert`
 * verhindert, dass etwas am selben Tag zweimal kommt, egal wie oft der
 * Cron-Job anklopft.
 */
export function faelligeErinnerungen(handlungen: Handlung[], j: Jetzt): {
  einzeln: Handlung[]; sammel: Handlung[];
} {
  const heute = handlungen.filter((h) => istHeute(h, j.wochentag) && h.zuletzt_erinnert !== j.datum);
  const imFenster = (soll: number) => j.minuten >= soll && j.minuten - soll < NACHHOLFENSTER;

  return {
    einzeln: heute.filter((h) => {
      const m = minutenAus(h.uhrzeit);
      return m !== null && imFenster(m);
    }),
    sammel: imFenster(SAMMEL_MINUTEN)
      ? heute.filter((h) => minutenAus(h.uhrzeit) === null)
      : [],
  };
}
