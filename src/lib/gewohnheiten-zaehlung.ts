import { addDays } from "@/lib/time";

/**
 * Die Zählung der Gewohnheiten — bewusst ohne Datenbank und ohne Framework.
 *
 * `lib/gewohnheiten.ts` trägt `server-only` und lässt sich deshalb nicht aus
 * einem Skript heraus aufrufen. Genau diese Rechnung ist aber das, was schief
 * gehen kann: eine Serie, die am Abend auf null springt, ein Raster, das nicht
 * am Montag beginnt, ein Monat mit der falschen Zahl Tage. Deshalb steht sie
 * hier und wird über `npm run check:gewohnheiten` geprüft.
 */

/** Ein eingetragener Tag. `variante` ist null, wenn die Gewohnheit keine hat. */
export interface Eintrag {
  datum: string;
  variante: string | null;
}

export interface RasterTag {
  datum: string;
  /** Was an dem Tag eingetragen ist — leer heisst nichts. */
  eintraege: Eintrag[];
  /** Tag, den es noch nicht gibt. */
  zukunft: boolean;
  /** Gehört nicht zum angezeigten Monat, füllt nur die Zeile auf. */
  ausserhalb: boolean;
}

/** Die Tage, an denen überhaupt etwas steht — Grundlage jeder Serie. */
export function tageAus(eintraege: Eintrag[]): Set<string> {
  return new Set(eintraege.map((e) => e.datum));
}

/**
 * Wie viele Tage am Stück bis heute?
 *
 * Ist heute noch offen, zählt ab gestern weiter — sonst stünde die Serie bis
 * zum Abend jeden Tag auf null, obwohl sie ungebrochen ist. Erst ein
 * ausgelassenes Gestern beendet sie wirklich.
 *
 * Gezählt werden Tage, nicht Einheiten: wer morgens Kraft und abends Ausdauer
 * macht, hat einen Tag hinter sich, keine zwei.
 */
export function streakBis(getan: Set<string>, heute: string): number {
  let tag = getan.has(heute) ? heute : addDays(heute, -1);
  let n = 0;
  while (getan.has(tag)) {
    n++;
    tag = addDays(tag, -1);
  }
  return n;
}

/**
 * Einheiten im Zeitraum, beide Grenzen einschliesslich.
 *
 * Hier zählen Einheiten und nicht Tage: „viermal diese Woche" meint viermal
 * trainiert. Ein Tag mit Kraft und Ausdauer ist zweimal.
 */
export function zaehleZeitraum(eintraege: Eintrag[], von: string, bis: string): number {
  return eintraege.filter((e) => e.datum >= von && e.datum <= bis).length;
}

/** Wie oft je Variante im Zeitraum — für „2× Push, 1× Pull". */
export function zaehleVarianten(
  eintraege: Eintrag[], von: string, bis: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of eintraege) {
    if (e.datum < von || e.datum > bis) continue;
    const k = e.variante ?? "";
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/* ------------------------------------------------------------ Monatsraster */

/** Erster Tag des Monats, in dem `datum` liegt. */
export function monatsStart(datum: string): string {
  return datum.slice(0, 7) + "-01";
}

/** `n` Monate weiter (negativ: zurück), immer auf den Ersten. */
export function monatPlus(monat: string, n: number): string {
  const [j, m] = monat.slice(0, 7).split("-").map(Number);
  const gesamt = j * 12 + (m - 1) + n;
  const jahr = Math.floor(gesamt / 12);
  const nr = (gesamt % 12) + 1;
  return `${jahr}-${String(nr).padStart(2, "0")}-01`;
}

const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** „September 2026" — für die Kopfzeile des Rasters. */
export function monatsLabel(monat: string): string {
  const [j, m] = monat.slice(0, 7).split("-").map(Number);
  return `${MONATSNAMEN[m - 1]} ${j}`;
}

/** Wochentag als 0 = Montag … 6 = Sonntag. */
function wochentagMo0(datum: string): number {
  // UTC-Mittag, damit keine Zeitzone den Tag kippt.
  const tag = new Date(datum + "T12:00:00Z").getUTCDay();
  return (tag + 6) % 7;
}

/**
 * Ein Monat als Raster, Montag bis Sonntag.
 *
 * Vorne und hinten mit den Nachbartagen aufgefüllt (`ausserhalb`), damit die
 * Spalten Wochentage bleiben: „montags fehle ich immer" sieht man nur, wenn
 * Montag untereinander steht. Angezeigt werden diese Tage blass und sie sind
 * nicht klickbar — sonst trägt man beim Blättern in den falschen Monat ein.
 *
 * @param monat Irgendein Tag des gewünschten Monats.
 * @param heute Alles danach gilt als Zukunft.
 */
export function baueMonatsRaster(
  eintraege: Eintrag[], monat: string, heute: string,
): RasterTag[] {
  const erster = monatsStart(monat);
  const naechster = monatPlus(erster, 1);

  const proTag = new Map<string, Eintrag[]>();
  for (const e of eintraege) {
    const liste = proTag.get(e.datum) ?? [];
    liste.push(e);
    proTag.set(e.datum, liste);
  }

  const start = addDays(erster, -wochentagMo0(erster));
  const tage: RasterTag[] = [];
  let tag = start;

  // Volle Wochen bis der Monat durch ist. Die Obergrenze ist eine Bremse
  // gegen eine Endlosschleife, nicht eine echte Grenze: sechs Wochen decken
  // jeden Monat ab.
  for (let i = 0; i < 6 * 7; i++) {
    tage.push({
      datum: tag,
      eintraege: proTag.get(tag) ?? [],
      zukunft: tag > heute,
      ausserhalb: tag < erster || tag >= naechster,
    });
    tag = addDays(tag, 1);
    if (tag >= naechster && wochentagMo0(tag) === 0) break;
  }
  return tage;
}

/* --------------------------------------------------------- Wochenkaestchen */

export interface Wochenstand {
  /** So viele Kästchen stehen da — das Wochenziel. 0 = gar keine. */
  gesamt: number;
  /** So viele sind gefüllt, höchstens `gesamt`. */
  gefuellt: number;
  /** Was über das Ziel hinaus getan wurde. 0, wenn nichts übrig ist. */
  ueber: number;
}

/**
 * Der Wochenfortschritt als Kästchenreihe.
 *
 * So viele Kästchen, wie das Wochenziel vorgibt — nicht sieben. Sieben Punkte
 * bei einem Ziel von vier hiessen, dass eine erfüllte Woche dauerhaft zu drei
 * Siebteln leer aussieht: die Anzeige stellte jede erreichte Woche als Mangel
 * dar. Vier Kästchen, vier Haken, fertig.
 *
 * Ohne Ziel (`ziel = 0`) gibt es keine Kästchen. Eines zu erfinden, damit die
 * Reihe vollständig aussieht, machte aus einer Beobachtung eine Bewertung —
 * dann steht dort nur die Zahl.
 *
 * Was über das Ziel hinausgeht, wird nicht abgeschnitten, sondern getrennt
 * gezählt: eine fünfte Einheit bei einem Ziel von vier ist keine Nachricht
 * wert, verschweigen sollte man sie aber auch nicht.
 */
export function wochenKaestchen(dieseWoche: number, ziel: number): Wochenstand {
  if (ziel <= 0) return { gesamt: 0, gefuellt: 0, ueber: 0 };
  return {
    gesamt: ziel,
    gefuellt: Math.min(dieseWoche, ziel),
    ueber: Math.max(0, dieseWoche - ziel),
  };
}
