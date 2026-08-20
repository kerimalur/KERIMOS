import "server-only";
import { fetchTrades } from "@/lib/trading/journal";
import { ladeFuerStichtag, ladeFuerSpanne, ladeLaborUrteil, type Ladebericht, type LaborUrteil } from "./daten";
import { alsInstrument } from "./rechnen";
import { montagVon } from "./reihen";
import {
  baueRegime, bewertePaar, bewerteAlle, waehrungsBild, baueMatrix, handelbare, G8,
  type PaarUrteil, type RegimeLage, type WaehrungsBild,
  type MatrixZelle, type AmpelUrteil,
} from "./faktoren";
import {
  gruppiere, vergleiche, vetoBilanz, aufteilung,
  type TradeUrteil, type Gruppe, type Vergleich, type VetoBilanz, type Aufteilung,
} from "./bilanz";

/**
 * Was die Confluence-Seite anzeigt — an einem Ort zusammengetragen.
 *
 * Die drei Ansichten benutzen absichtlich dieselbe Rechnung mit
 * unterschiedlichem Stichtag:
 *   Jetzt      → heute
 *   Rückblick  → der Tag, den Kerim eingibt
 *   Bilanz     → der Tag jedes einzelnen eigenen Trades
 * Dadurch können sie gar nicht auseinanderlaufen. Zeigte der Rückblick etwas
 * anderes als „Jetzt" am selben Tag, wäre die ganze Seite wertlos.
 */

export type Ansicht = "terminal" | "monty" | "jetzt" | "rueckblick" | "bilanz";

/* ------------------------------------------------------------- Jetzt */

export interface JetztBild {
  stichtag: string;
  regime: RegimeLage;
  paare: PaarUrteil[];
  waehrungen: WaehrungsBild[];
  /** 8×8, Zeile = Basis, Spalte = Quote. Für das Terminal. */
  matrix: MatrixZelle[][];
  /** Nur die grünen Paare, stärkste zuerst. */
  handelbar: { u: PaarUrteil; a: AmpelUrteil }[];
  bericht: Ladebericht;
}

export async function baueJetzt(stichtag: string): Promise<JetztBild> {
  const { daten, bericht } = await ladeFuerStichtag(stichtag);
  const regime = baueRegime(daten, stichtag);
  const paare = bewerteAlle(daten, stichtag, regime);
  // Sortiert nach score, nicht nach saldo: der Score sagt, wie DEUTLICH eine
  // Währung vorne liegt, der Saldo nur, in wie vielen Paaren. Bei acht
  // Währungen entscheidet das regelmässig über die Reihenfolge.
  const waehrungen = G8.map((c) => waehrungsBild(daten, c, stichtag, paare))
    .sort((a, b) => b.score - a.score);

  return {
    stichtag, regime, paare, waehrungen,
    matrix: baueMatrix(paare), handelbar: handelbare(paare), bericht,
  };
}

/* ------------------------------------------------------------- Rückblick */

export interface RueckblickBild {
  stichtag: string;
  paar: string;
  richtung: -1 | 0 | 1;
  urteil: PaarUrteil;
  regime: RegimeLage;
  labor: LaborUrteil | null;
  bericht: Ladebericht;
  /** Trades aus dem Journal, die an diesem Tag auf diesem Paar liefen. */
  eigeneTrades: { id: string; richtung: -1 | 1; r: number; ergebnis: string | null }[];
}

export async function baueRueckblick(
  paar: string, stichtag: string, richtung: -1 | 0 | 1,
): Promise<RueckblickBild> {
  const [{ daten, bericht }, labor, trades] = await Promise.all([
    ladeFuerStichtag(stichtag),
    ladeLaborUrteil(alsInstrument(paar), montagVon(stichtag)),
    // Nur dieser eine Tag: die Frage lautet „hatte ICH an dem Tag Rückenwind",
    // nicht „wie lief das Paar". Das Paar wird bewusst NICHT in der Abfrage
    // gefiltert - im Journal steht mal "EURUSD", mal "EUR/USD", und ein
    // exakter Vergleich in SQL würde die Hälfte still übersehen.
    fetchTrades({ von: stichtag, bis: stichtag }),
  ]);

  const regime = baueRegime(daten, stichtag);
  const urteil = bewertePaar(daten, paar, stichtag, regime, richtung);

  return {
    stichtag, paar, richtung, urteil, regime, labor, bericht,
    eigeneTrades: trades
      .filter((t) => t.pair.toUpperCase().replace(/[^A-Z]/g, "") === urteil.paar)
      .map((t) => ({
        id: t.id,
        richtung: (t.direction === "short" ? -1 : 1) as -1 | 1,
        r: t.rMultiple,
        ergebnis: t.result,
      })),
  };
}

/* ------------------------------------------------------------- Bilanz */

export interface BilanzBild {
  /** Wie viele Trades überhaupt auswertbar waren. */
  ausgewertet: number;
  uebersprungen: number;
  von: string | null;
  bis: string | null;
  gruppen: Gruppe[];
  vergleich: Vergleich;
  veto: VetoBilanz;
  verteilung: Aufteilung[];
  trades: TradeUrteil[];
  bericht: Ladebericht | null;
}

const LEERE_BILANZ: BilanzBild = {
  ausgewertet: 0, uebersprungen: 0, von: null, bis: null,
  gruppen: [], vergleich: {
    mit: { n: 0, treffer: 0, quote: null, unten: null, oben: null },
    gegen: { n: 0, treffer: 0, quote: null, unten: null, oben: null },
    abstand: null, abstandR: null, befund: "zu-wenig",
    satz: "Noch keine Trades im Journal, die sich auswerten lassen.",
  },
  veto: {
    mitVeto: { n: 0, treffer: 0, quote: null, unten: null, oben: null },
    ohneVeto: { n: 0, treffer: 0, quote: null, unten: null, oben: null },
    satz: "Noch keine Trades.",
  },
  verteilung: [], trades: [], bericht: null,
};

/**
 * Die eigentliche Prüfung: die eigenen Trades, aufgeteilt nach Rückenwind.
 *
 * Jeder Trade wird mit dem Stand SEINES Handelstages bewertet — nicht mit
 * dem von heute. Genau dafür steht der Publikationsverzug in `reihen.ts`;
 * ohne ihn wäre dieser Vergleich ein Selbstbetrug.
 */
export async function baueBilanz(): Promise<BilanzBild> {
  const alle = await fetchTrades();
  // Nur entschiedene Trades: ein offener Trade hat kein Ergebnis, das man
  // einem Rückenwind zuordnen könnte.
  // "breakeven", nicht "be" - so heisst der Wert im Journal (Ergebnis-Typ in
  // trading/journal.ts). Mit "be" hätte der Filter alle Break-even-Trades
  // still verworfen, statt sie in die Gruppengrösse zu zählen.
  const brauchbar = alle.filter(
    (t) => t.date && t.pair
      && (t.result === "win" || t.result === "loss" || t.result === "breakeven"),
  );
  if (brauchbar.length === 0) return LEERE_BILANZ;

  const tage = brauchbar.map((t) => t.date.slice(0, 10)).sort();
  const von = tage[0];
  const bis = tage[tage.length - 1];

  const { daten, bericht } = await ladeFuerSpanne(von, bis);

  // Das Regime hängt nur am Datum, nicht am Paar - einmal je Tag reicht,
  // sonst wird es bei 200 Trades unnötig oft gerechnet.
  const regimeJeTag = new Map<string, RegimeLage>();
  const regimeFuer = (tag: string) => {
    let r = regimeJeTag.get(tag);
    if (!r) { r = baueRegime(daten, tag); regimeJeTag.set(tag, r); }
    return r;
  };

  const urteile: TradeUrteil[] = brauchbar.map((t) => {
    const tag = t.date.slice(0, 10);
    const richtung: -1 | 1 = t.direction === "short" ? -1 : 1;
    const u = bewertePaar(daten, t.pair, tag, regimeFuer(tag), richtung);
    return {
      id: t.id, datum: tag, paar: u.paar, richtung,
      // Verluste zählen negativ, egal mit welchem Vorzeichen sie im Journal
      // stehen - dieselbe Konvention wie in trading/journal.ts.
      r: t.result === "win" ? Math.abs(t.rMultiple)
        : t.result === "loss" ? -Math.abs(t.rMultiple || 1)
          : 0, // breakeven

      gewonnen: t.result === "win" ? true : t.result === "loss" ? false : null,
      urteil: u.urteil, dafuer: u.dafuer, dagegen: u.dagegen, vetoAktiv: u.vetoAktiv,
    };
  });

  const gruppen = gruppiere(urteile);

  return {
    ausgewertet: urteile.length,
    uebersprungen: alle.length - brauchbar.length,
    von, bis, gruppen,
    vergleich: vergleiche(gruppen),
    veto: vetoBilanz(urteile),
    verteilung: aufteilung(urteile),
    trades: urteile.sort((a, b) => b.datum.localeCompare(a.datum)),
    bericht,
  };
}
