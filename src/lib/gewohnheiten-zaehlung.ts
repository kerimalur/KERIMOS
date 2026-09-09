import { addDays } from "@/lib/time";

/**
 * Die Zählung der Gewohnheiten — bewusst ohne Datenbank und ohne Framework.
 *
 * `lib/gewohnheiten.ts` trägt `server-only` und lässt sich deshalb nicht aus
 * einem Skript heraus aufrufen. Genau diese Rechnung ist aber das, was schief
 * gehen kann: eine Serie, die am Abend auf null springt, oder ein Raster, das
 * nicht am Montag beginnt. Deshalb steht sie hier und wird über
 * `npm run check:gewohnheiten` geprüft.
 */

/** Wie weit das Raster zurückreicht: vier Kalenderwochen. */
export const RASTER_WOCHEN = 4;

export interface RasterTag {
  datum: string;
  getan: boolean;
  /** Tag der laufenden Woche, der noch nicht da ist. */
  zukunft: boolean;
}

/**
 * Wie viele Tage am Stück bis heute?
 *
 * Ist heute noch offen, zählt ab gestern weiter — sonst stünde die Serie bis
 * zum Abend jeden Tag auf null, obwohl sie ungebrochen ist. Erst ein
 * ausgelassenes Gestern beendet sie wirklich.
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
 * Vier Kalenderwochen, Montag bis Sonntag, die laufende zuletzt.
 *
 * Am Montag ausgerichtet und nicht an den letzten 28 Tagen, damit die Spalten
 * Wochentage sind. „Montags fehle ich immer" sieht man nur, wenn Montag
 * untereinander steht.
 *
 * @param wochenstart Montag der laufenden Woche (ISO).
 */
export function baueRaster(
  getan: Set<string>, heute: string, wochenstart: string,
): RasterTag[] {
  const start = addDays(wochenstart, -7 * (RASTER_WOCHEN - 1));
  return Array.from({ length: RASTER_WOCHEN * 7 }, (_, i) => {
    const datum = addDays(start, i);
    return { datum, getan: getan.has(datum), zukunft: datum > heute };
  });
}

/** Tage im Zeitraum von `von` bis `bis`, beide einschliesslich. */
export function zaehleZeitraum(getan: Set<string>, von: string, bis: string): number {
  let n = 0;
  for (const tag of getan) if (tag >= von && tag <= bis) n++;
  return n;
}
