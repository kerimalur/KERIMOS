/**
 * Die Rechnung hinter der Gym-Analyse.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit
 * `tools/checks/muskel-analyse.mts`.
 *
 * Zwei Entscheidungen stecken hier drin, beide von Kerim am 24.08.2026:
 *
 * 1. **Nebenmuskeln zählen halb.** Ein Satz Bankdrücken ist ein Satz Brust
 *    und ein halber Satz Trizeps. Umschaltbar, weil beide Sichten stimmen —
 *    „nur direkt" sagt, worauf man es angelegt hat, „mit indirekt" sagt, was
 *    der Muskel tatsächlich abbekommen hat.
 * 2. **Die Grenzen gelten je Muskelgruppe** und sind einstellbar. Waden und
 *    Core brauchen andere Zahlen als der Rücken.
 */

/** Vorgabe, solange nichts eigenes gesetzt ist. Verbreitete Faustregel. */
export const STANDARD = { min: 10, max: 20 } as const;

export interface Grenzen { min: number; max: number }

/**
 * Gruppen ohne Körperteil. Cardio ist eine Muskelgruppe in der Datenbank,
 * damit Laufen und Rudern irgendwo hingehören — am Modell hat es nichts zu
 * suchen, und ein Urteil „zu wenig Cardio-Sätze" wäre Unsinn.
 */
export const OHNE_KOERPER = ["Cardio"];

export interface Rohwert {
  id: string;
  name: string;
  direkt: number;
  indirekt: number;
  tage: number;
}

/** Gewichtete Sätze. Nebenmuskeln zählen halb — oder gar nicht. */
export function saetze(w: Pick<Rohwert, "direkt" | "indirekt">, mitIndirekt: boolean): number {
  return w.direkt + (mitIndirekt ? w.indirekt * 0.5 : 0);
}

/**
 * Sätze pro Woche.
 *
 * Der Zeitraum kommt in Tagen und wird auf Wochen umgerechnet — sonst wäre
 * „letzter Monat" gegen „letzte Woche" nicht vergleichbar und jede Umschaltung
 * ergäbe eine andere Beurteilung derselben Gewohnheit.
 */
export function proWoche(saetzeGesamt: number, zeitraumTage: number): number {
  if (!(zeitraumTage > 0)) return 0;
  return saetzeGesamt / (zeitraumTage / 7);
}

export type Urteil = "wenig" | "knapp" | "rahmen" | "viel";

export const URTEIL_WORT: Record<Urteil, string> = {
  wenig: "deutlich zu wenig",
  knapp: "unter dem Rahmen",
  rahmen: "im Rahmen",
  viel: "über dem Rahmen",
};

export function urteil(wert: number, g: Grenzen = STANDARD): Urteil {
  if (wert >= g.min && wert <= g.max) return "rahmen";
  if (wert > g.max) return "viel";
  // Die Hälfte der Untergrenze ist die Schwelle zwischen „knapp darunter"
  // und „findet praktisch nicht statt". Ohne diese Trennung sähen 9 Sätze
  // und 0 Sätze gleich aus, und das ist der Unterschied, auf den es ankommt.
  return wert >= g.min / 2 ? "knapp" : "wenig";
}

export function grenzenFuer(id: string, eigene: Record<string, Grenzen>): Grenzen {
  const g = eigene[id];
  if (!g) return { ...STANDARD };
  const min = Number(g.min), max = Number(g.max);
  // Verdrehte oder unsinnige Werte fallen auf die Vorgabe zurück, statt eine
  // Gruppe für immer als „über dem Rahmen" zu markieren.
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    return { ...STANDARD };
  }
  return { min, max };
}

/**
 * Farbrampe: ein Farbton, dunkel nach hell. Auf dunklem Grund ist hell das
 * „mehr" — eine Rampe, die zum Grund hin dunkler wird, liest sich dort genau
 * falsch herum. Der Ton ist der Bernstein des Hauses.
 *
 * **Die Rampe ist absolut, nicht je Gruppe skaliert.** Sonst hiesse ein
 * heller Wadenmuskel etwas anderes als ein heller Rücken, und der Blick über
 * den ganzen Körper — der einzige Grund für ein Modell — wäre wertlos. Die
 * Farbe sagt WIE VIEL. Ob es genug ist, sagt das Wort daneben.
 */
const STOPS: [number, [number, number, number]][] = [
  [0, [0x2A, 0x22, 0x19]],
  [5, [0x6B, 0x4A, 0x27]],
  [10, [0xA8, 0x70, 0x3A]],
  [16, [0xE7, 0xA9, 0x6B]],
  [22, [0xF7, 0xD3, 0xAB]],
];

export function rampe(wertProWoche: number): [number, number, number] {
  const x = Math.max(0, Math.min(22, wertProWoche));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (x <= b) {
      const t = (x - a) / (b - a);
      return [0, 1, 2].map((j) => Math.round(ca[j] + (cb[j] - ca[j]) * t)) as
        [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export const alsHex = (rgb: [number, number, number]) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** Für three.js: 0xRRGGBB als Zahl. */
export const alsZahl = (rgb: [number, number, number]) =>
  (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
