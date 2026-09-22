/**
 * Fragen zu einem Live-Trade — wie beim Backtest, nur für echtes Geld.
 *
 * Seit 22.09.2026. Die Antworten stehen als JSON in `trades.journal_fragen`,
 * weil sich die Fragen ändern werden, sobald die ersten 30 Trades zeigen,
 * welche etwas trennen und welche nicht. Eine Spalte je Frage hiesse, für
 * jede Änderung die Datenbank anzufassen.
 *
 * Bewusst ohne Datenbank und ohne `server-only`: Formular (Client) und
 * Auswertung (Server) lesen dieselbe Liste. Wer eine Frage ergänzt, ergänzt
 * sie hier — Formular, Filter und Auswertung ziehen automatisch nach.
 *
 * Nur Auswahlfragen werden ausgewertet. Freitext (Learning) lässt sich nicht
 * gruppieren; er steht beim Trade und in der Liste der Learnings.
 */

import type { Ergebnis } from "@/lib/trading/journal";

export interface Frage {
  key: string;
  frage: string;
  optionen: { wert: string; label: string }[];
  /** Nur bei diesen Ergebnissen fragen. Leer = immer. */
  nurBei?: Ergebnis[];
}

export const FRAGEN: Frage[] = [
  {
    key: "plan",
    frage: "Nach Plan gehandelt?",
    optionen: [
      { wert: "ja", label: "Ja, komplett" },
      { wert: "teilweise", label: "Teilweise" },
      { wert: "nein", label: "Nein" },
    ],
  },
  {
    key: "einstieg",
    frage: "Wie war der Einstieg?",
    optionen: [
      { wert: "plan", label: "Nach Plan" },
      { wert: "zu_frueh", label: "Zu früh" },
      { wert: "zu_spaet", label: "Zu spät / hinterher" },
      { wert: "impuls", label: "Aus dem Impuls" },
    ],
  },
  {
    key: "ausstieg",
    frage: "Wie war der Ausstieg?",
    optionen: [
      { wert: "plan", label: "Nach Plan (TP / SL / BE)" },
      { wert: "zu_frueh", label: "Zu früh von Hand" },
      { wert: "zu_spaet", label: "Zu spät / laufen lassen" },
      { wert: "sl_verschoben", label: "Stop verschoben" },
    ],
  },
  {
    key: "zustand",
    frage: "Wie warst du drauf?",
    optionen: [
      { wert: "ruhig", label: "Ruhig, klar" },
      { wert: "ungeduldig", label: "Ungeduldig" },
      { wert: "fomo", label: "FOMO" },
      { wert: "muede", label: "Müde / gestresst" },
      { wert: "revanche", label: "Wollte Verlust zurückholen" },
    ],
  },
  {
    key: "fundamental",
    frage: "Hast du die Fundamentallage vorher angeschaut?",
    optionen: [
      { wert: "dafuer", label: "Ja — sprach dafür" },
      { wert: "dagegen", label: "Ja — sprach dagegen" },
      { wert: "neutral", label: "Ja — neutral" },
      { wert: "nicht", label: "Nicht angeschaut" },
    ],
  },
  {
    key: "gegenlauf",
    frage: "Wie weit lief er gegen dich, bevor er aufging?",
    nurBei: ["win"],
    optionen: [
      { wert: "bis_025", label: "Kaum — bis 0,25 R" },
      { wert: "bis_05", label: "Bis 0,5 R" },
      { wert: "bis_075", label: "Bis 0,75 R" },
      { wert: "knapp", label: "Knapp am Stop" },
    ],
  },
  {
    key: "vorlauf",
    frage: "Wie weit lief er für dich, bevor er drehte?",
    nurBei: ["loss", "breakeven"],
    optionen: [
      { wert: "kein", label: "Nie im Plus" },
      { wert: "bis_05", label: "Bis 0,5 R" },
      { wert: "bis_1", label: "Bis 1 R" },
      { wert: "ueber_1", label: "Über 1 R" },
    ],
  },
  {
    key: "nochmal",
    frage: "Würdest du den Trade genau so wieder nehmen?",
    optionen: [
      { wert: "ja", label: "Ja" },
      { wert: "anders", label: "Ja, aber anders ausgeführt" },
      { wert: "nein", label: "Nein" },
    ],
  },
];

/** Antworten: key → wert. Dazu optional der Freitext `learning`. */
export type Antworten = Record<string, string>;

export const LEARNING_KEY = "learning";

export function frageFuer(key: string): Frage | undefined {
  return FRAGEN.find((f) => f.key === key);
}

export function labelFuer(key: string, wert: string): string {
  return frageFuer(key)?.optionen.find((o) => o.wert === wert)?.label ?? wert;
}

/** Gilt die Frage für dieses Ergebnis? */
export function fragGilt(f: Frage, ergebnis: Ergebnis | null): boolean {
  if (!f.nurBei || f.nurBei.length === 0) return true;
  return ergebnis !== null && f.nurBei.includes(ergebnis);
}

/** Aus der Datenbank lesen — alles, was keine Zeichenkette ist, fliegt raus. */
export function alsAntworten(roh: unknown): Antworten {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return {};
  const aus: Antworten = {};
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) aus[k] = v.trim();
  }
  return aus;
}

/**
 * Antworten aus einem Formular. Übernommen wird nur, was eine bekannte Frage
 * mit einer bekannten Option ist — ein manipuliertes Feld landet so nicht in
 * der Auswertung. Fragen, die zum Ergebnis nicht passen, fallen weg.
 */
export function antwortenAusFormular(
  lies: (k: string) => string, ergebnis: Ergebnis | null,
): Antworten {
  const aus: Antworten = {};
  for (const f of FRAGEN) {
    if (!fragGilt(f, ergebnis)) continue;
    const v = lies(`frage_${f.key}`);
    if (f.optionen.some((o) => o.wert === v)) aus[f.key] = v;
  }
  const learning = lies(LEARNING_KEY).slice(0, 2000);
  if (learning) aus[LEARNING_KEY] = learning;
  return aus;
}

/* ------------------------------------------------------------- Auswertung */

export interface AntwortZeile {
  wert: string;
  label: string;
  n: number;
  wins: number;
  losses: number;
  /** 0–100, nur aus Gewinnen und Verlusten. Null ohne beides. */
  winrate: number | null;
  /** Ø signiertes R. */
  schnittR: number | null;
}

export interface FragenBlock {
  key: string;
  frage: string;
  beantwortet: number;
  zeilen: AntwortZeile[];
}

/** Ab so vielen Trades je Antwort ist eine Winrate mehr als Zufall-Rauschen. */
export const MIN_JE_ANTWORT = 5;

/**
 * Je Frage und Antwort: wie viele Trades, welche Winrate, welches Ø-R.
 * Nimmt geschlossene Trades mit Ergebnis und bereits signiertem R entgegen.
 */
export function werteFragenAus(
  trades: { ergebnis: Ergebnis | null; r: number; antworten: Antworten }[],
): FragenBlock[] {
  const mitErgebnis = trades.filter((t) => t.ergebnis !== null);
  return FRAGEN.map((f) => {
    const zeilen = f.optionen.map((o) => {
      const gruppe = mitErgebnis.filter((t) => t.antworten[f.key] === o.wert);
      const wins = gruppe.filter((t) => t.ergebnis === "win").length;
      const losses = gruppe.filter((t) => t.ergebnis === "loss").length;
      return {
        wert: o.wert,
        label: o.label,
        n: gruppe.length,
        wins, losses,
        winrate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
        schnittR: gruppe.length > 0
          ? gruppe.reduce((s, t) => s + t.r, 0) / gruppe.length : null,
      };
    });
    return {
      key: f.key,
      frage: f.frage,
      beantwortet: zeilen.reduce((s, z) => s + z.n, 0),
      zeilen,
    };
  });
}
