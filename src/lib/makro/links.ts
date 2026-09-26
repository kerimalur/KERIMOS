/**
 * Wo man eine Zahl von Hand holt, wenn sie fehlt oder veraltet ist.
 *
 * Trading Economics hat für fast jedes Feld eine Seite mit festem Muster
 * (tradingeconomics.com/<land>/<kennzahl>) — geprüft am 26.09.2026. Wo es
 * keine gibt, steht die Primärquelle da.
 */

const TE_LAND: Record<string, string> = {
  USD: "united-states", EUR: "euro-area", GBP: "united-kingdom", JPY: "japan",
  AUD: "australia", NZD: "new-zealand", CAD: "canada", CHF: "switzerland",
};

const TE_KENNZAHL: Record<string, string> = {
  pmi_industrie: "manufacturing-pmi",
  pmi_dienste: "services-pmi",
  bip_yoy: "gdp-growth-annual",
  arbeitslos: "unemployment-rate",
  handelsbilanz: "current-account-to-gdp",
  rendite_10j: "government-bond-yield",
  staatsschulden: "government-debt-to-gdp",
};

export interface ManuellLink {
  url: string;
  text: string;
}

export function manuellerLink(ccy: string, feld: string): ManuellLink | null {
  const land = TE_LAND[ccy];
  if (!land) return null;

  if (feld === "fruehindikator") {
    // Die OECD führt für die Schweiz und Neuseeland keinen Frühindikator
    // mehr. Der gleichwertige Ersatz ist jeweils das nationale Barometer.
    if (ccy === "CHF") {
      return {
        url: "https://kof.ethz.ch/en/forecasts-and-indicators/indicators/kof-economic-barometer.html",
        text: "KOF-Konjunkturbarometer",
      };
    }
    if (ccy === "NZD") {
      return { url: "https://tradingeconomics.com/new-zealand/business-confidence", text: "Trading Economics · Business Confidence" };
    }
    return { url: "https://www.oecd.org/en/data/indicators/composite-leading-indicator-cli.html", text: "OECD · CLI" };
  }

  if (feld === "anleihe_nachfrage") {
    const q = encodeURIComponent(`${ccy === "EUR" ? "Bund" : land.replace("-", " ")} 10 year bond auction bid to cover`);
    return { url: `https://www.google.com/search?q=${q}`, text: "Auktionsergebnis suchen" };
  }

  const k = TE_KENNZAHL[feld];
  return k ? { url: `https://tradingeconomics.com/${land}/${k}`, text: "Trading Economics" } : null;
}
