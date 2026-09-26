import "server-only";

/**
 * Wirtschaftsdaten automatisch holen — FRED (26.09.2026).
 *
 * Kerims Ansage: nichts mehr von Hand eintragen. Bis auf den PMI geht das
 * auch: die St. Louis Fed spiegelt in FRED die OECD-Reihen aller acht
 * Länder, und ein Key dafür ist kostenlos.
 *
 * Was NICHT geht: PMI und ISM sind lizenzierte Umfragen von S&P Global
 * beziehungsweise dem ISM. Es gibt keine offene Schnittstelle dafür. Der
 * Ersatz ist der **OECD-Frühindikator** (Composite Leading Indicator): er
 * beantwortet dieselbe Frage — läuft die Wirtschaft an oder aus —, ist frei
 * und kommt monatlich, dafür träger. Ein PMI-Feld bleibt trotzdem stehen,
 * falls Kerim die Zahl doch von Hand nachträgt.
 *
 * Jede Serie hat einen Ersatz: FRED benennt OECD-Reihen gelegentlich um oder
 * stellt sie ein. Scheitert die erste ID, wird die zweite versucht, und was
 * gar nicht kommt, steht im Bericht des Laufs — statt still zu fehlen.
 */

/*
 * Die Reihen-Liste je Währung steht seit dem 26.09.2026 in
 * lib/makro/quellen.ts — dort zusammen mit OECD, Eurostat und IMF.
 * Hier bleibt nur der FRED-Zugriff selbst.
 */

export function fredKonfiguriert(): boolean {
  return Boolean(process.env.FRED_API_KEY);
}

import type { Beobachtung } from "./perioden";
export type { Beobachtung };

/**
 * Eine Serie holen. Gibt die letzten `limit` Werte zurück, aufsteigend.
 *
 * FRED schreibt fehlende Werte als "." — die fliegen raus, statt als 0 in
 * einer Reihe zu landen, in der 0 etwas völlig anderes hiesse.
 */
export async function holeSerie(
  kandidat: string, limit = 60,
): Promise<{ werte: Beobachtung[]; fehler: string | null }> {
  const [id, units] = kandidat.split("@");
  const key = process.env.FRED_API_KEY;
  if (!key) return { werte: [], fehler: "FRED_API_KEY fehlt" };

  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", id);
  url.searchParams.set("api_key", key);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));
  if (units) url.searchParams.set("units", units);

  try {
    const antwort = await fetch(url, { cache: "no-store" });
    if (!antwort.ok) return { werte: [], fehler: `HTTP ${antwort.status}` };

    const roh = await antwort.json() as { observations?: { date: string; value: string }[] };
    const werte = (roh.observations ?? [])
      .filter((o) => o.value !== "." && o.value !== "")
      .map((o) => ({ datum: o.date, wert: Number(o.value) }))
      .filter((o) => Number.isFinite(o.wert))
      .sort((a, b) => a.datum.localeCompare(b.datum));

    return { werte, fehler: werte.length === 0 ? "keine Werte" : null };
  } catch (e) {
    return { werte: [], fehler: e instanceof Error ? e.message : "unbekannt" };
  }
}
