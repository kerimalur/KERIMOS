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
  /**
   * Kandidaten-IDs. Alle werden versucht, genommen wird die mit dem
   * JÜNGSTEN Wert (bei Gleichstand die weiter vorne). Grund: FRED stellt
   * OECD-Reihen still ein — sie liefern dann weiter Werte, nur alte. „Erste
   * ID, die antwortet" hätte so die Arbeitslosenquote der Eurozone von 2023
   * genommen.
   *
   * `ID@pc1` heisst: FRED rechnet selbst die Veränderung zum Vorjahr in
   * Prozent (units=pc1). Für BIP-Reihen, die nur als Niveau existieren.
   */
  ids: string[];
  /** Was die Zahl bedeutet — steht auf der Seite. */
  einheit: string;
}

/** Je Währung die Serien, die FRED liefert. */
const BIP = (ids: string[]): SerienDefinition =>
  ({ feld: "bip_yoy", label: "BIP zum Vorjahr", einheit: "%", ids });

export const FRED_SERIEN: Record<string, SerienDefinition[]> = {
  USD: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["UNRATE", "LRHUTTTTUSM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["USALOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["DGS10", "IRLTLT01USM156N"] },
    { feld: "bip_yoy", label: "BIP zum Vorjahr", einheit: "%", ids: ["A191RO1Q156NBEA"] },
  ],
  EUR: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTEZM156S", "LRHUTTTTEAM156S", "LRHUTTTTDEM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["EA19LOLITONOSTSAM", "DEULOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01EZM156N", "IRLTLT01DEM156N"] },
    // Früher ohne @pc1 — damit stand das BIP-NIVEAU (2.9 Mio. EUR) als
    // „Veränderung in %" in der Rechnung.
    BIP(["CLVMNACSCAB1GQEA19@pc1", "CLVMNACSCAB1GQEA20@pc1", "CLVMNACSCAB1GQDE@pc1"]),
  ],
  GBP: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTGBM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["GBRLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01GBM156N"] },
    BIP(["NGDPRSAXDCGBQ@pc1", "CLVMNACSCAB1GQUK@pc1"]),
  ],
  JPY: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTJPM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["JPNLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01JPM156N"] },
    BIP(["JPNRGDPEXP@pc1", "NGDPRSAXDCJPQ@pc1"]),
  ],
  AUD: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTAUM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["AUSLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01AUM156N"] },
    BIP(["NGDPRSAXDCAUQ@pc1", "AUSGDPRQDSMEI@pc1"]),
  ],
  NZD: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTNZQ156S", "LRHUTTTTNZM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["NZLLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01NZM156N"] },
    BIP(["NGDPRSAXDCNZQ@pc1", "NZLGDPRQDSMEI@pc1"]),
  ],
  CAD: [
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTCAM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["CANLOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01CAM156N"] },
    BIP(["NGDPRSAXDCCAQ@pc1", "CANGDPRQDSMEI@pc1"]),
  ],
  CHF: [
    // Die Monatsreihe gibt es für die Schweiz nicht (HTTP 400) — nur Quartale.
    { feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", ids: ["LRHUTTTTCHQ156S", "LRUNTTTTCHQ156S", "LRHUTTTTCHM156S"] },
    { feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "Index", ids: ["CHELOLITONOSTSAM"] },
    { feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", ids: ["IRLTLT01CHM156N"] },
    BIP(["CLVMNACSCAB1GQCH@pc1", "NGDPRSAXDCCHQ@pc1"]),
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
  kandidat: string, limit = 26,
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

export interface SerienErgebnis {
  ccy: string;
  feld: string;
  /** Die ID, die geklappt hat. Null, wenn keine. */
  id: string | null;
  werte: Beobachtung[];
  fehler: string | null;
}

/** Alle Serien einer Währung — je Feld die Kandidaten-ID mit dem jüngsten Wert. */
export async function holeWaehrung(ccy: string): Promise<SerienErgebnis[]> {
  const serien = FRED_SERIEN[ccy] ?? [];
  const ergebnisse: SerienErgebnis[] = [];

  for (const s of serien) {
    const versuche = await Promise.all(s.ids.map(async (id) => ({ id, ...(await holeSerie(id)) })));
    const gut = versuche.filter((v) => !v.fehler && v.werte.length > 0);

    if (gut.length === 0) {
      ergebnisse.push({
        ccy, feld: s.feld, id: null, werte: [],
        fehler: versuche.map((v) => `${v.id}: ${v.fehler}`).join(" · ") || "keine ID versucht",
      });
      continue;
    }

    const juengster = (v: typeof gut[number]) => v.werte[v.werte.length - 1].datum;
    const beste = gut.reduce((a, b) => (juengster(b) > juengster(a) ? b : a));
    ergebnisse.push({ ccy, feld: s.feld, id: beste.id, werte: beste.werte, fehler: null });
  }

  return ergebnisse;
}
