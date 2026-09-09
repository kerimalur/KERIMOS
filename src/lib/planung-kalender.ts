/**
 * Der Kalender-Aufbau — bewusst ohne Datenbank und ohne Framework.
 *
 * `lib/planung.ts` trägt `server-only` und lässt sich deshalb nicht aus einem
 * Skript heraus aufrufen. Die Datumsrechnung ist aber genau das, was
 * unbemerkt schiefgeht: ein Monat, der am falschen Wochentag beginnt, oder
 * ein Februar mit 28 Tagen im Schaltjahr. Deshalb steht sie hier und hängt an
 * `npm run check:planung`.
 *
 * Dieselbe Bauart wie `gewohnheiten-zaehlung.ts` — und absichtlich nicht
 * dieselbe Datei: der Habit-Tracker rastert nach Gewohnheit, der Kalender
 * nach Aufgabe. Ein gemeinsames Raster hätte beiden Seiten ihre Eigenheiten
 * ausgetrieben.
 */

/** Ein Tag im Kalenderraster. */
export interface KalenderTag {
  datum: string;
  /** Gehört nicht zum angezeigten Monat, füllt nur die Zeile auf. */
  ausserhalb: boolean;
  heute: boolean;
}

/** Ein Tag weiter (negativ: zurück), rein über die ISO-Schreibweise. */
export function tagPlus(datum: string, n: number): string {
  const d = new Date(datum + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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

/** „September 2026" — für die Kopfzeile. */
export function monatsLabel(monat: string): string {
  const [j, m] = monat.slice(0, 7).split("-").map(Number);
  return `${MONATSNAMEN[m - 1]} ${j}`;
}

/** Wochentag als 0 = Montag … 6 = Sonntag. */
export function wochentagMo0(datum: string): number {
  // UTC-Mittag, damit keine Zeitzone den Tag kippt.
  const tag = new Date(datum + "T12:00:00Z").getUTCDay();
  return (tag + 6) % 7;
}

/** Montag der Woche, in der `datum` liegt. */
export function wochenStart(datum: string): string {
  return tagPlus(datum, -wochentagMo0(datum));
}

/**
 * Eine Woche, Montag bis Sonntag.
 *
 * Die Vorgabe auf der Startseite. Der Monat beantwortet „wann habe ich
 * Zeit", die Woche „was ist jetzt dran" — und das ist die Frage, mit der man
 * morgens auf die Seite schaut. Kein Tag ist hier `ausserhalb`: eine Woche
 * hat keine Nachbartage, die sie auffüllen müsste.
 *
 * @param montag Irgendein Tag der gewünschten Woche.
 */
export function baueWoche(montag: string, heute: string): KalenderTag[] {
  const start = wochenStart(montag);
  return Array.from({ length: 7 }, (_, i) => {
    const datum = tagPlus(start, i);
    return { datum, ausserhalb: false, heute: datum === heute };
  });
}

/**
 * Ein Monat als Raster, Montag bis Sonntag, in vollen Wochen.
 *
 * Vorne und hinten mit den Nachbartagen aufgefüllt (`ausserhalb`), damit die
 * Spalten Wochentage bleiben. Diese Tage sind sichtbar und im Kalender auch
 * gültige Ablegeziele — anders als beim Habit-Raster, wo sie nur stören
 * würden: eine Aufgabe auf den 1. des Folgemonats zu ziehen ist eine völlig
 * normale Absicht.
 */
export function baueMonat(monat: string, heute: string): KalenderTag[] {
  const erster = monatsStart(monat);
  const naechster = monatPlus(erster, 1);

  const tage: KalenderTag[] = [];
  let tag = tagPlus(erster, -wochentagMo0(erster));

  // Sechs Wochen decken jeden Monat ab; die Grenze ist eine Bremse gegen
  // eine Endlosschleife, nicht die eigentliche Bedingung.
  for (let i = 0; i < 6 * 7; i++) {
    tage.push({
      datum: tag,
      ausserhalb: tag < erster || tag >= naechster,
      heute: tag === heute,
    });
    tag = tagPlus(tag, 1);
    if (tag >= naechster && wochentagMo0(tag) === 0) break;
  }
  return tage;
}

/**
 * Wie dringend ist eine Aufgabe?
 *
 * Nur drei Stufen, und die mittlere ist der Grund für die Unterscheidung:
 * „heute" verlangt eine Entscheidung, „überfällig" einen Vorwurf, alles
 * andere nichts. Mehr Stufen hiesse, dass man die Liste liest statt handelt.
 */
export type Dringlichkeit = "ueberfaellig" | "heute" | "spaeter" | "ohne";

export function dringlichkeit(
  faellig: string | null, heute: string,
): Dringlichkeit {
  if (!faellig) return "ohne";
  if (faellig < heute) return "ueberfaellig";
  if (faellig === heute) return "heute";
  return "spaeter";
}
