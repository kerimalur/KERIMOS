/**
 * Kennzahlen eines Backtest-Laufs (11.10.2026). Rein, ohne Datenbank.
 */

export interface TradeZeile {
  paar: string;
  seite: "long" | "short";
  trefferT: number;
  einstiegT: number;
  ausstiegT: number;
  status: "tp" | "sl" | "zeit";
  rBrutto: number;
  rNetto: number;
}

export interface Kennzahlen {
  trades: number;
  tp: number;
  sl: number;
  zeit: number;
  trefferquote: number | null;
  rBrutto: number;
  rNetto: number;
  schnittNetto: number | null;
  profitFaktor: number | null;
  maxDrawdownR: number;
  t: number | null;
  /** Längste Verlustserie. */
  serieVerluste: number;
}

export function kennzahlen(trades: TradeZeile[]): Kennzahlen {
  const sortiert = [...trades].sort((a, b) => a.ausstiegT - b.ausstiegT);
  const n = sortiert.length;
  const tp = sortiert.filter((x) => x.status === "tp").length;
  const sl = sortiert.filter((x) => x.status === "sl").length;
  const rB = sortiert.reduce((s, x) => s + x.rBrutto, 0);
  const rN = sortiert.reduce((s, x) => s + x.rNetto, 0);
  const gewinne = sortiert.filter((x) => x.rNetto > 0).reduce((s, x) => s + x.rNetto, 0);
  const verluste = -sortiert.filter((x) => x.rNetto < 0).reduce((s, x) => s + x.rNetto, 0);
  let spitze = 0, kurve = 0, dd = 0, serie = 0, maxSerie = 0;
  for (const x of sortiert) {
    kurve += x.rNetto;
    spitze = Math.max(spitze, kurve);
    dd = Math.max(dd, spitze - kurve);
    serie = x.rNetto < 0 ? serie + 1 : 0;
    maxSerie = Math.max(maxSerie, serie);
  }
  const mittel = n ? rN / n : null;
  const sd = n > 1 && mittel !== null ? Math.sqrt(sortiert.reduce((s, x) => s + (x.rNetto - mittel) ** 2, 0) / (n - 1)) : null;
  const rund = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    trades: n, tp, sl, zeit: n - tp - sl,
    trefferquote: tp + sl ? rund(tp / (tp + sl), 3) : null,
    rBrutto: rund(rB, 2), rNetto: rund(rN, 2),
    schnittNetto: mittel === null ? null : rund(mittel, 3),
    profitFaktor: verluste > 0 ? rund(gewinne / verluste, 2) : null,
    maxDrawdownR: rund(dd, 2),
    t: sd && sd > 0 && mittel !== null ? rund(mittel / (sd / Math.sqrt(n)), 2) : null,
    serieVerluste: maxSerie,
  };
}
