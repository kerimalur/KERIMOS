import type { Quote } from "./bilanz";
import type { Fenster } from "./saison";
import type { BacktestResult } from "@/lib/backtest-types";

/**
 * Die Typen der drei Fundamental-Zeitstrahlen.
 *
 * Absichtlich getrennt von `zeitstrahl.ts`: die Rechnung dort ist
 * `server-only` (sie fasst die Datenbank an), die Zeichnung läuft im Client.
 * Ein Typ-Import aus einem server-only-Modul wird vom Compiler zwar entfernt,
 * aber darauf will man sich in einer Client-Komponente nicht verlassen.
 */

export type SpurKey = "cot" | "saison" | "qscore";

export const SPUR_REIHENFOLGE: SpurKey[] = ["cot", "saison", "qscore"];

export interface Linienpunkt {
  datum: string;
  wert: number;
}

/** Ein Kalendermonat im Saison-Zeitstrahl. */
export interface Monatsblock {
  /** Erster und letzter Tag des Monats, "YYYY-MM-DD". */
  von: string;
  bis: string;
  /** Prozentpunkte über 50 % Aufwärtsmonaten. Positiv = historisch aufwärts. */
  wert: number;
  /** Wilson-Intervall der Trefferquote enthält die 50 % nicht. */
  belegt: boolean;
  /** Bewegte Jahre, die in diesen Monat eingingen. */
  n: number;
  median: number | null;
}

export interface ZeitstrahlTrade {
  id: string;
  datum: string;
  richtung: -1 | 1;
  ergebnis: BacktestResult;
  r: number | null;
  /** Wo der Punkt auf der jeweiligen Spur sitzt. Null = Spur schweigt. */
  werte: Record<SpurKey, number | null>;
  /** +1 dafür, −1 dagegen, 0 ohne Aussage — schon auf die Richtung gedreht. */
  stand: Record<SpurKey, -1 | 0 | 1>;
}

export interface Spur {
  key: SpurKey;
  titel: string;
  erklaerung: string;
  einheit: string;
  min: number;
  max: number;
  mitte: number;
  /** Ab hier gilt die Spur als gestreckt. Null, wenn sie anders spricht. */
  schwelleOben: number | null;
  schwelleUnten: number | null;
  linie: Linienpunkt[];
  gegenLinie: Linienpunkt[] | null;
  linieTitel: string;
  gegenTitel: string | null;
  bloecke: Monatsblock[] | null;
  /** Trefferquote der Trades, bei denen die Spur dafür bzw. dagegen stand. */
  dafuer: Quote;
  dagegen: Quote;
  stumm: number;
  befund: string;
  getrennt: boolean;
  /** Gesetzt, wenn die Quelle nichts hergab — dann wird nichts gezeichnet. */
  luecke: string | null;
}

export interface ZeitstrahlBild {
  paar: string;
  /** Gezeichnete Spanne — etwas grosszügiger als der erste/letzte Trade. */
  von: string;
  bis: string;
  ersterTrade: string;
  letzterTrade: string;
  spuren: Spur[];
  trades: ZeitstrahlTrade[];
  saisonFenster: Fenster;
  /** Warum kein Bild möglich war. Null, wenn alles gut ging. */
  fehler: string | null;
}
