/**
 * Zeitrahmen des GVA-Screeners, nachgebaut in TypeScript.
 *
 * Nachgebaut und nicht vom Backend geholt, weil `/api/candles` nur "D" und
 * "W" kennt — der 3D-Block, auf dem der Screener eigentlich rechnet, ist dort
 * gar nicht abrufbar. Die Regel stammt aus `Backend/data_pipeline.py`
 * (gva_3d_block_ids): Dreiergruppen über KALENDER-Wochentage, phasiert an
 * einem festen Anker. Feiertags-Slots ohne Kerze zählen mit — sonst würden
 * die Blöcke gegenüber TradingView wandern.
 *
 * Diese Datei ist bewusst OHNE `server-only` und ohne jeden Ladepfad: reine
 * Rechnung, damit `tools/checks/kerzen.mts` sie gegen Kontrollwerte prüfen
 * kann. Dieselbe Trennung wie bei `confluence/saison.ts` und seinem Loader.
 */

export interface Kerze {
  /** "YYYY-MM-DD" — bei 3D und W der erste Tag des Blocks. */
  zeit: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Zeitrahmen = "3D" | "W";

/** Muss mit GVA_3D_ANCHOR in Backend/data_pipeline.py übereinstimmen. */
const ANKER_3D = "2026-07-09";

const MS_TAG = 86_400_000;

const alsUtc = (iso: string): number => {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(j, (m ?? 1) - 1, t ?? 1);
};

const alsIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Wochentage (Mo–Fr) von `von` bis `bis`, `bis` selbst nicht mitgezählt.
 * Negativ, wenn `bis` vor `von` liegt — genau wie numpy busday_count, auf das
 * sich die Blockgrenzen im Backend stützen.
 */
export function werktage(vonIso: string, bisIso: string): number {
  const a = alsUtc(vonIso);
  const b = alsUtc(bisIso);
  if (a === b) return 0;
  const vorwaerts = a < b;
  const start = vorwaerts ? a : b;
  const tage = Math.round((Math.abs(b - a)) / MS_TAG);

  const volleWochen = Math.floor(tage / 7);
  let zahl = volleWochen * 5;
  let rest = tage - volleWochen * 7;
  let lauf = start + volleWochen * 7 * MS_TAG;
  while (rest > 0) {
    const wt = new Date(lauf).getUTCDay();
    if (wt !== 0 && wt !== 6) zahl++;
    lauf += MS_TAG;
    rest--;
  }
  return vorwaerts ? zahl : -zahl;
}

/** Block-Nummer einer Tageskerze im 3D-Raster. Math.floor auch im Negativen. */
export function block3d(iso: string): number {
  return Math.floor(werktage(ANKER_3D, iso) / 3);
}

/**
 * Der Freitag, auf den eine Tageskerze in der Wochengruppierung fällt.
 * Entspricht pandas `resample("W-FRI")`: rechts geschlossen, Beschriftung ist
 * das Bin-Ende. Ein Samstag gehört damit schon zur Folgewoche.
 */
export function wochenSchluessel(iso: string): string {
  const ms = alsUtc(iso);
  const wt = new Date(ms).getUTCDay(); // 0 = Sonntag … 5 = Freitag
  return alsIso(ms + ((5 - wt + 7) % 7) * MS_TAG);
}

function fasseZusammen(
  kerzen: Kerze[], schluessel: (k: Kerze) => string | number,
): Kerze[] {
  const gruppen = new Map<string | number, Kerze[]>();
  for (const k of [...kerzen].sort((a, b) => a.zeit.localeCompare(b.zeit))) {
    const s = schluessel(k);
    const vorhanden = gruppen.get(s);
    if (vorhanden) vorhanden.push(k); else gruppen.set(s, [k]);
  }
  return [...gruppen.values()]
    .filter((g) => g.length > 0)
    .map((g) => ({
      // Beschriftung ist der erste Tag des Blocks, nicht der Schlüssel: bei 3D
      // ist der Schlüssel nur eine Nummer, und bei W wäre es ein Freitag, an
      // dem gar keine Kerze stehen muss.
      zeit: g[0].zeit,
      open: g[0].open,
      high: Math.max(...g.map((x) => x.high)),
      low: Math.min(...g.map((x) => x.low)),
      close: g[g.length - 1].close,
    }))
    .sort((a, b) => a.zeit.localeCompare(b.zeit));
}

export const zu3D = (tage: Kerze[]): Kerze[] => fasseZusammen(tage, (k) => block3d(k.zeit));
export const zuWoche = (tage: Kerze[]): Kerze[] => fasseZusammen(tage, (k) => wochenSchluessel(k.zeit));

/**
 * Auf welchem Zeitrahmen ist diese Linie entstanden?
 *
 * Die Signal-Tabelle speichert den Zeitrahmen nicht, und der Live-Screener
 * kennt eine getroffene Linie nicht mehr — sie ist verbraucht. Rekonstruiert
 * wird er deshalb aus der Linie selbst: Das Level einer GVA IST die Body-Kante
 * der bildenden Kerze (LONG = Body-Boden, SHORT = Body-Top). Es passt also
 * genau auf den Zeitrahmen, auf dem die Kerze steht.
 *
 * Bei Gleichstand gewinnt 3D — das ist der Zeitrahmen, auf dem der Screener
 * standardmässig läuft, und damit die wahrscheinlichere Herkunft.
 */
export function erkenneZeitrahmen(
  tage: Kerze[], datum: string, level: number, seite: "long" | "short",
): Zeitrahmen {
  const kante = (k: Kerze) =>
    seite === "long" ? Math.min(k.open, k.close) : Math.max(k.open, k.close);

  const abstand = (kerzen: Kerze[]): number => {
    const k = kerzen.find((x) => x.zeit === datum)
      // Bei W steht die Blockbeschriftung auf dem ersten Handelstag der Woche;
      // das Bildungsdatum ist der Blockanfang, kann aber um Feiertage abweichen.
      ?? kerzen.filter((x) => x.zeit <= datum).slice(-1)[0];
    return k ? Math.abs(kante(k) - level) : Number.POSITIVE_INFINITY;
  };

  return abstand(zuWoche(tage)) < abstand(zu3D(tage)) ? "W" : "3D";
}
