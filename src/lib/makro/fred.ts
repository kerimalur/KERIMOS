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

export interface SerienDefinition {
  feld: string;
  label: string;
  /** IDs in der Reihenfolge, in der sie versucht werden. */
  ids: string[];
  /** Was die Zahl bedeutet — steht auf der Seite. */
  einheit: string;
}

/** Je Währung die Serien, die FRED liefert. */
export const FRED_SERIEN: Record<string, SerienDefinition[]> = {
  USD: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTUSM156S", "UNRATE"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["USALOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["DGS10", "IRLTLT01USM156N"] },
    { feld: "bip_yoy", label: "BIP zum Vorjahr", einheit: "%", ids: ["A191RO1Q156NBEA"] },
  ],
  EUR: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTEZM156S", "LRHUTTTTDEM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["EA19LOLITONOSTSAM", "DEULOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01EZM156N", "IRLTLT01DEM156N"] },
    { feld: "bip_yoy", label: "BIP zum Vorjahr", einheit: "%", ids: ["CLVMNACSCAB1GQEA19"] },
  ],
  GBP: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTGBM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["GBRLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01GBM156N"] },
  ],
  JPY: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTJPM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["JPNLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01JPM156N"] },
  ],
  AUD: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTAUM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["AUSLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01AUM156N"] },
  ],
  NZD: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTNZQ156S", "LRHUTTTTNZM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["NZLLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01NZM156N"] },
  ],
  CAD: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTCAM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["CANLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01CAM156N"] },
  ],
  CHF: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTCHM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["CHELOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01CHM156N"] },
  ],
};

/** Automatisch geholte Felder — der Rest bleibt Handarbeit. */
export const AUTO_FELDER = ["arbeitslos", "fruehindikator", "rendite_10j", "bip_yoy"];

export function fredKonfiguriert(): boolean {
  return Boolean(process.env.FRED_API_KEY);
}

export interface Beobachtung {
  datum: string;
  wert: number;
}

/**
 * Eine Serie holen. Gibt die letzten `limit` Werte zurück, aufsteigend.
 *
 * FRED schreibt fehlende Werte als "." — die fliegen raus, statt als 0 in
 * einer Reihe zu landen, in der 0 etwas völlig anderes hiesse.
 */
export async function holeSerie(
  id: string, limit = 26,
): Promise<{ werte: Beobachtung[]; fehler: string | null }> {
  const key = process.env.FRED_API_KEY;
  if (!key) return { werte: [], fehler: "FRED_API_KEY fehlt" };

  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", id);
  url.searchParams.set("api_key", key);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));

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

export interface SerienErgebnis {
  ccy: string;
  feld: string;
  /** Die ID, die geklappt hat. Null, wenn keine. */
  id: string | null;
  werte: Beobachtung[];
  fehler: string | null;
}

/** Alle Serien einer Währung, mit Ersatz-IDs. */
export async function holeWaehrung(ccy: string): Promise<SerienErgebnis[]> {
  const serien = FRED_SERIEN[ccy] ?? [];
  const ergebnisse: SerienErgebnis[] = [];

  for (const s of serien) {
    let letzterFehler: string | null = "keine ID versucht";
    let geschafft = false;

    for (const id of s.ids) {
      const { werte, fehler } = await holeSerie(id);
      if (!fehler && werte.length > 0) {
        ergebnisse.push({ ccy, feld: s.feld, id, werte, fehler: null });
        geschafft = true;
        break;
      }
      letzterFehler = `${id}: ${fehler}`;
    }

    if (!geschafft) {
      ergebnisse.push({ ccy, feld: s.feld, id: null, werte: [], fehler: letzterFehler });
    }
  }

  return ergebnisse;
}
