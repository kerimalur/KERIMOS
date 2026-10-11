/**
 * Handelstag und Sitzungsgrenzen im Devisenmarkt (11.10.2026).
 *
 * Wie bei TradingView/OANDA beginnt ein Handelstag um 17:00 New York. Eine
 * Kerze am Sonntag um 22:00 UTC gehört damit schon zum Montag. Rein und ohne
 * Abhängigkeiten, damit der Backtest-Lauf (tools/backtest) sie direkt nutzt.
 */

const MS_H = 3_600_000;
const MS_D = 86_400_000;

/** Versatz New York zu UTC in Stunden: −4 in der Sommerzeit, sonst −5 (US-Regel seit 2007). */
export function nyVersatz(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  const wt1 = new Date(Date.UTC(y, 2, 1)).getUTCDay();
  const ersterSoMaerz = 1 + ((7 - wt1) % 7);
  const start = Date.UTC(y, 2, ersterSoMaerz + 7, 7); // 2. Sonntag März, 02:00 lokal
  const wt2 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const ersterSoNov = 1 + ((7 - wt2) % 7);
  const ende = Date.UTC(y, 10, ersterSoNov, 6); // 1. Sonntag Nov., 02:00 lokal
  return ms >= start && ms < ende ? -4 : -5;
}

/** Handelstag (YYYY-MM-DD) eines Zeitpunkts: ab 17:00 New York zählt der Folgetag. */
export function handelstag(ms: number): string {
  const lokal = ms + nyVersatz(ms) * MS_H;
  let tag = Math.floor(lokal / MS_D) * MS_D;
  if ((lokal - tag) / MS_H >= 17) tag += MS_D;
  return new Date(tag).toISOString().slice(0, 10);
}

/** Ende eines Handelstags in ms (17:00 New York an diesem Datum). */
export function sitzungsEnde(tagIso: string): number {
  const mitternacht = Date.parse(`${tagIso}T00:00:00Z`);
  const v = nyVersatz(mitternacht + 22 * MS_H);
  return mitternacht + (17 - v) * MS_H;
}

/** Schlüssel des 4-Stunden-Blocks, ausgerichtet am Sitzungsbeginn 17:00 New York. */
export function vierStundenBlock(ms: number): number {
  const lokal = ms + nyVersatz(ms) * MS_H;
  return Math.floor((lokal - 17 * MS_H) / (4 * MS_H));
}
