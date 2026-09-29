/**
 * Rechnen für die Wochenaussicht (29.09.2026) — rein, ohne Datenbank.
 *
 * Gemessen wird wie ein Swing-Trade auf Kerims Zeitrahmen: Einstieg zur
 * Eröffnung der Montagskerze, Ausstieg zum Schluss der Freitagskerze nach
 * 1, 2 oder 3 Wochen. Hauptmass sind 2 Wochen.
 *
 * Tageskerzen von OANDA beginnen um 17:00 New York — die Montagskerze öffnet
 * also Sonntagabend (UTC). Deshalb der Versatz von 4 Stunden vor Mitternacht:
 * so trifft die Grenze die richtige Kerze, egal ob der Zeitstempel ein Datum
 * oder der genaue Öffnungszeitpunkt ist.
 */
export interface Tageskerze { zeit: string; open: number; close: number }

export const HORIZONTE = [1, 2, 3] as const;
export type Horizont = (typeof HORIZONTE)[number];

const TAG = 86_400_000;
const VERSATZ = 4 * 3_600_000;

const zeitVon = (k: Tageskerze) => Date.parse(k.zeit.length === 10 ? `${k.zeit}T00:00:00Z` : k.zeit);

/** Montag der Woche (UTC-Datum), in der `jetzt` liegt. */
export function montagVon(jetzt: Date): string {
  const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
  const tag = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() - tag);
  return d.toISOString().slice(0, 10);
}

/** Ab wann Horizont n messbar ist: Samstag nach Woche n. */
export function messbarAb(woche: string, n: number): number {
  return Date.parse(`${woche}T00:00:00Z`) + (7 * n - 2) * TAG;
}

export interface Messung {
  einstieg: number | null;
  kurse: Partial<Record<Horizont, number>>;
  prozent: Partial<Record<Horizont, number>>;
  pips: Partial<Record<Horizont, number>>;
}

export function messe(
  kerzen: Tageskerze[], woche: string, seite: "long" | "short", paar: string, jetzt: number,
): Messung {
  const sortiert = [...kerzen].sort((a, b) => zeitVon(a) - zeitVon(b));
  const start = Date.parse(`${woche}T00:00:00Z`) - VERSATZ;
  const erste = sortiert.find((k) => zeitVon(k) >= start);
  const out: Messung = { einstieg: erste?.open ?? null, kurse: {}, prozent: {}, pips: {} };
  if (!erste) return out;
  const richtung = seite === "long" ? 1 : -1;
  const pipFaktor = /JPY/.test(paar) ? 100 : 10_000;
  for (const n of HORIZONTE) {
    if (jetzt < messbarAb(woche, n)) continue;
    const grenze = Date.parse(`${woche}T00:00:00Z`) + 7 * n * TAG - VERSATZ;
    const letzte = [...sortiert].reverse().find((k) => zeitVon(k) < grenze && zeitVon(k) >= start);
    if (!letzte) continue;
    out.kurse[n] = letzte.close;
    out.prozent[n] = Math.round(((letzte.close / erste.open - 1) * 100 * richtung) * 1000) / 1000;
    out.pips[n] = Math.round((letzte.close - erste.open) * pipFaktor * richtung * 10) / 10;
  }
  return out;
}
