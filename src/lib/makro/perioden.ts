/**
 * Reine Hilfen für die Makro-Reihen — ohne Server-Abhängigkeit, damit sie
 * auch im Browser laufen (Nachladen der OECD-Daten, siehe
 * components/makro/browser-nachladen.tsx).
 */

export interface Beobachtung {
  datum: string;
  wert: number;
}

/** "2026-08" → 2026-08-01, "2026-Q2" → 2026-04-01, "2026" → 2026-01-01. */
export function periodeZuDatum(p: string): string | null {
  const s = p.trim();
  let m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = /^(\d{4})-?Q([1-4])$/.exec(s);
  if (m) return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  m = /^(\d{4})$/.exec(s);
  if (m) return `${m[1]}-01-01`;
  m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

/** Aufsteigend nach Datum, nur echte Zahlen, höchstens die letzten 26. */
export function sortiert(w: Beobachtung[]): Beobachtung[] {
  return w.filter((x) => Number.isFinite(x.wert))
    .sort((a, b) => a.datum.localeCompare(b.datum)).slice(-26);
}

/**
 * OECD-CSV (format=csvfile) nach Land aufteilen. Die Spalten werden über
 * die Kopfzeile gefunden, nicht über ihre Position — die OECD ändert die
 * Reihenfolge je nach Dataset.
 */
export function parseOecdCsv(text: string): Map<string, Beobachtung[]> {
  const zeilen = text.trim().split(/\r?\n/);
  const kopf = (zeilen[0] ?? "").split(",");
  const iLand = kopf.indexOf("REF_AREA");
  const iZeit = kopf.indexOf("TIME_PERIOD");
  const iWert = kopf.indexOf("OBS_VALUE");
  if (iLand < 0 || iZeit < 0 || iWert < 0) throw new Error("unerwartetes CSV-Format der OECD");

  const je = new Map<string, Beobachtung[]>();
  for (const z of zeilen.slice(1)) {
    const c = z.split(",");
    const datum = periodeZuDatum(c[iZeit] ?? "");
    const wert = Number(c[iWert]);
    if (!datum || c[iWert] === "" || !Number.isFinite(wert)) continue;
    const liste = je.get(c[iLand]) ?? [];
    liste.push({ datum, wert });
    je.set(c[iLand], liste);
  }
  for (const [k, v] of je) je.set(k, sortiert(v));
  return je;
}
