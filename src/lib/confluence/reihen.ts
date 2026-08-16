/**
 * Zeitreihen, immer mit Stichtag.
 *
 * Die zentrale Regel der ganzen Confluence-Seite steht in diesen Funktionen:
 * **kein Wert darf benutzt werden, bevor er veröffentlicht war.** Eine
 * Rückblick-Ansicht, die einem Trade vom März die CPI-Zahl zeigt, die erst
 * im April erschien, ist schlimmer als nutzlos — sie bestätigt rückwirkend
 * und macht jede Auswertung wertlos.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit
 * `tools/checks/confluence.mts`.
 */

export interface Punkt {
  /** "YYYY-MM-DD" */
  datum: string;
  wert: number;
}

/**
 * Veröffentlichungsverzug in Tagen, nach Rhythmus der Serie.
 *
 * Eine Monatsserie mit Stichtag 01.03. beschreibt den März und erscheint
 * Mitte April — wer sie am 20.03. benutzt, schaut in die Zukunft. Die Werte
 * sind bewusst grosszügig: lieber einen Faktor zu spät als ein Ergebnis, das
 * nur deshalb gut aussieht.
 */
export const VERZUG = {
  taeglich: 1,
  woechentlich: 3,
  /** COT: Stichtag Dienstag, Veröffentlichung Freitag. */
  cot: 3,
  monatlich: 45,
  quartalsweise: 100,
} as const;

export type Rhythmus = keyof typeof VERZUG;

/** Tage zwischen zwei ISO-Daten (b − a). */
export function tageZwischen(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** ISO-Datum plus n Tage. */
export function plusTage(datum: string, n: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Treffer {
  wert: number;
  /** Stichtag des Werts selbst. */
  datum: string;
  /** Wie alt der Wert am Stichtag war, in Tagen. */
  alterTage: number;
}

/**
 * Der jüngste Wert, der am `stichtag` **schon veröffentlicht** war.
 *
 * `reihe` muss aufsteigend sortiert sein. Der Verzug wird auf das Datum des
 * Werts addiert; erst danach gilt er als bekannt.
 */
export function wertZum(
  reihe: Punkt[], stichtag: string, verzugTage = 0,
): Treffer | null {
  for (let i = reihe.length - 1; i >= 0; i--) {
    const p = reihe[i];
    if (plusTage(p.datum, verzugTage) <= stichtag) {
      return { wert: p.wert, datum: p.datum, alterTage: tageZwischen(p.datum, stichtag) };
    }
  }
  return null;
}

/**
 * Veränderung gegenüber „vor n Tagen", beide Male mit Verzug gerechnet.
 *
 * Null, wenn einer der beiden Werte fehlt — eine Veränderung gegen einen
 * geschätzten Vergleichswert wäre eine erfundene Zahl.
 */
export function aenderung(
  reihe: Punkt[], stichtag: string, tage: number, verzugTage = 0,
): number | null {
  const jetzt = wertZum(reihe, stichtag, verzugTage);
  const frueher = wertZum(reihe, plusTage(stichtag, -tage), verzugTage);
  if (!jetzt || !frueher) return null;
  // Derselbe Datenpunkt auf beiden Seiten heisst: in diesem Fenster ist
  // nichts Neues erschienen. Das ist keine Veränderung von 0, sondern
  // keine Aussage.
  if (jetzt.datum === frueher.datum) return null;
  return jetzt.wert - frueher.wert;
}

/** Einfacher gleitender Durchschnitt der letzten `n` bekannten Werte. */
export function schnitt(
  reihe: Punkt[], stichtag: string, n: number, verzugTage = 0,
): number | null {
  const bekannt = reihe.filter((p) => plusTage(p.datum, verzugTage) <= stichtag);
  if (bekannt.length < n) return null;
  const letzte = bekannt.slice(-n);
  return letzte.reduce((s, p) => s + p.wert, 0) / n;
}

/**
 * Perzentilrang des aktuellen Werts innerhalb der letzten `fensterTage`.
 *
 * 0…100. Gerechnet wird ausschliesslich auf Werten, die am Stichtag bekannt
 * waren — sonst wäre das Perzentil selbst ein Blick in die Zukunft.
 * Null, wenn zu wenig Historie da ist; `mindestens` verhindert, dass aus
 * fünf Beobachtungen ein „98. Perzentil" wird.
 */
export function perzentil(
  reihe: Punkt[], stichtag: string, fensterTage: number,
  verzugTage = 0, mindestens = 26,
): { rang: number; wert: number; datum: string; n: number } | null {
  const jetzt = wertZum(reihe, stichtag, verzugTage);
  if (!jetzt) return null;

  const ab = plusTage(stichtag, -fensterTage);
  const fenster = reihe.filter(
    (p) => p.datum >= ab && plusTage(p.datum, verzugTage) <= stichtag,
  );
  if (fenster.length < mindestens) return null;

  const kleiner = fenster.filter((p) => p.wert < jetzt.wert).length;
  const gleich = fenster.filter((p) => p.wert === jetzt.wert).length;
  // Mittlerer Rang bei Gleichstand: sonst springt ein Perzentil bei
  // wiederholten identischen Werten um die Breite des Plateaus.
  const rang = ((kleiner + gleich / 2) / fenster.length) * 100;

  return { rang, wert: jetzt.wert, datum: jetzt.datum, n: fenster.length };
}

/** Wie frisch ist die Reihe am Stichtag? Für die Aktualitäts-Anzeige. */
export type Frische = "frisch" | "brauchbar" | "alt" | "fehlt";

export function frischeVon(alterTage: number | null, rhythmus: Rhythmus): Frische {
  if (alterTage === null) return "fehlt";
  // Gemessen wird gegen den erwarteten Abstand zweier Werte, nicht gegen
  // eine feste Tageszahl: eine Quartalsserie, die 80 Tage alt ist, ist
  // aktuell, eine Tagesserie mit demselben Alter ist tot.
  const erwartet = { taeglich: 4, woechentlich: 10, cot: 10, monatlich: 45, quartalsweise: 120 }[rhythmus];
  if (alterTage <= erwartet) return "frisch";
  if (alterTage <= erwartet * 2) return "brauchbar";
  return "alt";
}

export const FRISCHE_LABEL: Record<Frische, string> = {
  frisch: "aktuell",
  brauchbar: "etwas älter",
  alt: "veraltet",
  fehlt: "fehlt",
};

/** Montag der Woche, in der das Datum liegt (UTC, ISO-Woche). */
export function montagVon(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
