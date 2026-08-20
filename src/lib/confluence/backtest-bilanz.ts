import "server-only";
import { ladeFuerSpanne, type Ladebericht } from "./daten";
import { baueRegime, bewertePaar, FAKTOR_LABEL, type RegimeLage, type FaktorKey, type PaarUrteil } from "./faktoren";
import { gruppiere, vergleiche, vetoBilanz, aufteilung, type Gruppe, type Vergleich, type VetoBilanz, type Aufteilung } from "./bilanz";
import { cotBildFuer, cotPaarUrteil } from "./cot-divergenz";
import { ladeKurse } from "./daten";
import { saisonZum, type Fenster } from "./saison";
import {
  nachErgebnis, nachDimension, DIM_STANDARD,
  type DimKey, type DimStand, type ErgebnisAuswertung, type DimErfolg,
} from "./auswertung";
import {
  ergebnisKreuz, faktorBilanz, auffaellige, jahresVerteilung, zeitBefund,
  vetoSicht, cotSicht,
  type TiefenTrade, type KreuzZeile, type FaktorZeile, type Auffaellig,
  type JahresZeile, type ZeitBefund, type SichtVergleich,
} from "./tiefe";
import { berechneR, RESULT_LABEL, type BacktestResult, type NativeBacktestTrade } from "@/lib/backtest-types";

/**
 * Die Backtest-Trades gegen die Fundamentallage IHRES Handelstages.
 *
 * Der Unterschied zur Bilanz-Ansicht auf der Confluence-Seite ist nur die
 * Quelle: dort das Live-Journal, hier das Backtest-Journal. Die Rechnung ist
 * bewusst dieselbe (`bilanz.ts`), damit beide Auswertungen nicht auseinander-
 * laufen können — dazu die tiefere Aufschlüsselung aus `tiefe.ts`.
 *
 * Wichtig für die Deutung, und deshalb hier und nicht nur im UI notiert:
 *
 * 1. Ein Backtest ist kein Out-of-Sample-Test. Kerim hat die Setups am Chart
 *    gesucht, in Kenntnis dessen, was danach kam — die Trefferquote ist
 *    dadurch nach oben verzerrt. Was hier trotzdem aussagekräftig ist, ist der
 *    UNTERSCHIED zwischen den Lagern: die Verzerrung trifft beide Seiten
 *    gleich, weil beim Erfassen niemand auf die Zinsdifferenz geschaut hat.
 * 2. Die Fundamentaldaten sind mit Publikationsverzug gerechnet (siehe
 *    reihen.ts). Ohne das wäre der Vergleich ein Selbstbetrug.
 * 3. Bei GBP-Paaren fällt der Faktor Zinserwartung aus — es gibt keine freie
 *    2-Jahres-Quelle für GBP. Die Faktor-Tabelle weist das als „ohne Aussage"
 *    aus, statt es zu verstecken.
 */

/** Ergebnis-Schlüssel in der Reihenfolge, in der sie in der Kreuztabelle stehen. */
export const KREUZ_ERGEBNISSE: BacktestResult[] = ["full_tp", "teil_tp_be", "breakeven", "sl"];
export const KREUZ_LABEL = KREUZ_ERGEBNISSE.map((k) => RESULT_LABEL[k]);

/** Alle fünf Faktoren, in der Reihenfolge der Seite. */
export const FAKTOR_KEYS: FaktorKey[] = ["zins", "erwartung", "real", "regime", "cot"];
export { FAKTOR_LABEL };

export interface BacktestFundamentalBild {
  ausgewertet: number;
  /** Skips und Trades ohne verwertbares Datum/Paar. */
  uebersprungen: number;
  von: string | null;
  bis: string | null;
  gruppen: Gruppe[];
  vergleich: Vergleich;
  veto: VetoBilanz;
  verteilung: Aufteilung[];
  kreuz: KreuzZeile[];
  /** Dieselben Trades, zweimal gelesen — zum Vergleichen. */
  sichten: SichtVergleich[];
  /** Vom Ergebnis her: was hatten die Full TPs gemeinsam, was die SLs? */
  ergebnisDims: ErgebnisAuswertung;
  /** Die Gegenrichtung: trennt eine Dimension die Trefferquote? */
  dimErfolg: DimErfolg[];
  /** Welche Dimensionen gerade ausgewertet werden. */
  dims: DimKey[];
  saisonFenster: Fenster;
  jahre: JahresZeile[];
  zeit: ZeitBefund;
  faktoren: FaktorZeile[];
  auffaellig: Auffaellig[];
  trades: TiefenTrade[];
  bericht: Ladebericht | null;
  /** Paare in dieser Auswertung — steht im UI, damit klar ist, was vermischt wurde. */
  paare: string[];
}

const LEER: BacktestFundamentalBild = {
  ausgewertet: 0, uebersprungen: 0, von: null, bis: null,
  gruppen: [], vergleich: {
    mit: { n: 0, treffer: 0, quote: null, unten: null, oben: null },
    gegen: { n: 0, treffer: 0, quote: null, unten: null, oben: null },
    abstand: null, abstandR: null, befund: "zu-wenig",
    satz: "Noch keine gewerteten Backtest-Trades.",
  },
  veto: {
    mitVeto: { n: 0, treffer: 0, quote: null, unten: null, oben: null },
    ohneVeto: { n: 0, treffer: 0, quote: null, unten: null, oben: null },
    satz: "Noch keine Trades.",
  },
  verteilung: [], kreuz: [], sichten: [],
  ergebnisDims: { grundraten: [], zeilen: [], gesamt: 0 },
  dimErfolg: [], dims: [], saisonFenster: 20,
  jahre: [], zeit: {
    anteilFrueh: null, anteilSpaet: null, trennDatum: null, verdaechtig: false,
    satz: "Noch keine Trades.",
  },
  faktoren: [], auffaellig: [], trades: [],
  bericht: null, paare: [],
};

export interface FundamentalOptionen {
  /** Welche Dimensionen ausgewertet werden. Standard: COT und Saison. */
  dims?: DimKey[];
  /** Fenster für die Saisonalität in Jahren. */
  saisonFenster?: Fenster;
}

export async function baueBacktestFundamental(
  alle: NativeBacktestTrade[],
  opt: FundamentalOptionen = {},
): Promise<BacktestFundamentalBild> {
  const dims = opt.dims ?? DIM_STANDARD;
  const saisonFenster: Fenster = opt.saisonFenster ?? 20;
  // Skips haben kein Ergebnis, das sich einer Lage zuordnen liesse. Ein Paar
  // ohne sechs Buchstaben (Tippfehler beim Erfassen) fällt hier heraus, statt
  // still als "keine Daten" durchzulaufen und die Gruppe "ohne Urteil"
  // aufzublähen.
  const brauchbar = alle.filter(
    (t) => t.result !== "skip"
      && /^\d{4}-\d{2}-\d{2}/.test(t.occurred_on ?? "")
      && (t.pair ?? "").replace(/[^A-Za-z]/g, "").length >= 6,
  );
  if (brauchbar.length === 0) return LEER;

  const tage = brauchbar.map((t) => t.occurred_on.slice(0, 10)).sort();
  const von = tage[0];
  const bis = tage[tage.length - 1];

  const { daten, bericht } = await ladeFuerSpanne(von, bis);

  // Kurse nur für die Paare holen, die überhaupt vorkommen — und nur, wenn
  // Saisonalität ausgewertet wird. Bei einer Session ist das ein Paar; über
  // alle Sessions könnten es 28 werden, deshalb ist die Auswahl eng gefasst.
  const paare = [...new Set(brauchbar.map(
    (t) => t.pair.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)))];
  const kurse = new Map<string, Awaited<ReturnType<typeof ladeKurse>>>();
  if (dims.includes("saison")) {
    for (const p of paare) kurse.set(p, await ladeKurse(p));
  }

  // Das Regime hängt nur am Datum, nicht am Paar — einmal je Tag reicht.
  const regimeJeTag = new Map<string, RegimeLage>();
  const regimeFuer = (tag: string) => {
    let r = regimeJeTag.get(tag);
    if (!r) { r = baueRegime(daten, tag); regimeJeTag.set(tag, r); }
    return r;
  };

  const trades: TiefenTrade[] = brauchbar.map((t) => {
    const tag = t.occurred_on.slice(0, 10);
    const richtung: -1 | 1 = t.direction === "short" ? -1 : 1;
    const u = bewertePaar(daten, t.pair, tag, regimeFuer(tag), richtung);
    // r_multiple ist beim Erfassen gesetzt; fehlt es (Altbestand), wird es aus
    // Ergebnis und geplantem RR nachgerechnet — dieselbe Formel wie im Formular.
    const r = t.r_multiple ?? berechneR(t.result, t.rr_geplant) ?? 0;

    return {
      id: t.id, datum: tag, paar: u.paar, richtung, r,
      gewonnen: r > 0 ? true : r < 0 ? false : null,
      urteil: u.urteil, dafuer: u.dafuer, dagegen: u.dagegen, vetoAktiv: u.vetoAktiv,
      ergebnis: t.result,
      faktoren: u.faktoren.map((f) => ({ key: f.key, dir: f.dir })),
      link: t.tradingview_link ?? t.screenshot_url ?? null,
      cot: cotStandFuer(u.basis, u.quote, tag, richtung),
      dims: dimStaende(u, tag, richtung),
    };
  });

  function dimStaende(u: PaarUrteil, tag: string, richtung: -1 | 1): DimStand[] {
    const werte: Partial<Record<DimKey, -1 | 0 | 1>> = {};

    if (dims.includes("cot")) {
      const b = cotBildFuer(daten, u.basis, tag);
      const q = cotBildFuer(daten, u.quote, tag);
      werte.cot = (cotPaarUrteil(b, q).dir * richtung) as -1 | 0 | 1;
    }

    if (dims.includes("saison")) {
      // saisonZum benutzt ausschliesslich Jahre VOR dem Stichtag — sonst
      // wüsste der Rückblick, wie der Monat ausging, den er beurteilt.
      const m = saisonZum(kurse.get(u.paar) ?? [], tag, saisonFenster);
      werte.saison = ((m?.richtung ?? 0) * richtung) as -1 | 0 | 1;
    }

    if (dims.includes("qscore")) {
      // Netto ist schon auf das Paar bezogen; hier nur noch auf den Trade
      // drehen. Die Schwelle hält kleine Ausschläge draussen.
      const netto = u.netto * richtung;
      werte.qscore = netto >= 0.1 ? 1 : netto <= -0.1 ? -1 : 0;
    }

    if (dims.includes("veto")) {
      // Gedreht: „dafür" heisst, es stand KEIN Veto im Weg. Ein Veto gegen
      // die Gegenrichtung ist keine Zustimmung, deshalb nur zwei Zustände.
      werte.veto = u.veto.gegen === richtung ? -1 : u.veto.gegen === 0 ? 0 : 1;
    }

    return dims.map((key) => ({ key, wert: werte[key] ?? 0 }));
  }

  function cotStandFuer(
    basis: string, quote: string, tag: string, richtung: -1 | 1,
  ) {
    const b = cotBildFuer(daten, basis, tag);
    const q = cotBildFuer(daten, quote, tag);
    if (b.kommRang === null && q.kommRang === null) return null;
    const paar = cotPaarUrteil(b, q);
    return {
      kommBasis: b.kommRang, kommQuote: q.kommRang,
      retailBasis: b.retailRang, retailQuote: q.retailRang,
      // Auf den TRADE gedreht: bei einem Short spricht dir = −1 dafür.
      div: (paar.dir * richtung) as -1 | 0 | 1,
    };
  }

  const gruppen = gruppiere(trades);

  return {
    ausgewertet: trades.length,
    uebersprungen: alle.length - trades.length,
    von, bis, gruppen,
    vergleich: vergleiche(gruppen),
    veto: vetoBilanz(trades),
    verteilung: aufteilung(trades),
    kreuz: ergebnisKreuz(trades, KREUZ_ERGEBNISSE),
    sichten: [vetoSicht(trades), cotSicht(trades)],
    ergebnisDims: nachErgebnis(
      trades, dims,
      KREUZ_ERGEBNISSE.map((k) => ({ key: k, label: RESULT_LABEL[k] })),
    ),
    dimErfolg: nachDimension(trades, dims),
    dims, saisonFenster,
    jahre: jahresVerteilung(trades),
    zeit: zeitBefund(trades),
    faktoren: faktorBilanz(trades, FAKTOR_KEYS),
    auffaellig: auffaellige(trades, "sl", "full_tp"),
    trades: trades.sort((a, b) => b.datum.localeCompare(a.datum)),
    bericht,
    paare: [...new Set(trades.map((t) => t.paar))].sort(),
  };
}
