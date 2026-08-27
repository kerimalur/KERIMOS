import { wilson, type Quote } from "./bilanz";
import type { TiefenTrade } from "./tiefe";

/**
 * Auswertung vom ERGEBNIS her gedacht, nicht von der Lage.
 *
 * Der Unterschied ist der ganze Punkt dieser Datei. „Wie liefen Trades mit
 * Rückenwind" ist eine Darstellung. „Nimm alle Full TPs — was hatten die
 * gemeinsam" ist eine Auswertung. Beides rechnet auf denselben Zeilen, aber
 * nur das Zweite beantwortet die Frage, die man beim Backtesten wirklich hat.
 *
 * ─── Die Zahl, ohne die das Ganze wertlos wäre ───
 *
 * „62 % der Full TPs liefen mit den Commercials" klingt nach einem Befund und
 * ist keiner, solange man nicht weiss, wie oft die Commercials ÜBERHAUPT
 * dafür standen. Waren es über alle Trades auch 62 %, sagt die Zahl exakt
 * nichts. Deshalb steht neben jedem Anteil die Grundrate über alle Trades und
 * die Abweichung davon — und die Abweichung ist das Ergebnis, nicht der
 * Anteil.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/auswertung.mts`.
 */

export type DimKey = "cot" | "saison" | "qscore" | "veto";

export const DIM_LABEL: Record<DimKey, string> = {
  cot: "Commercials gegen Retail",
  saison: "Saisonalität",
  qscore: "Confluence-Score",
  veto: "COT-Veto (Fonds & Real Money)",
};

export const DIM_ERKLAERUNG: Record<DimKey, string> = {
  cot: "Standen Commercials und Nicht-Meldepflichtige gleichzeitig an entgegengesetzten "
    + "Rändern ihrer drei Jahre — und zwar für deine Richtung?",
  saison: "Zeigte der Kalendermonat historisch belegt in deine Richtung? Belegt heisst: "
    + "das Intervall der Trefferquote enthält die 50 % nicht.",
  qscore: "Das Netto der fünf Confluence-Faktoren am Handelstag, auf deine Richtung gedreht.",
  veto: "Stand die Positionierung der schnellen Gelder schon überfüllt in deiner Richtung? "
    + "Hier gedreht: dafür heisst, es stand KEIN Veto im Weg.",
};

/**
 * Was ohne Zutun angezeigt wird.
 *
 * Veto und Confluence-Score sind absichtlich aus: ausgewertet wird nach
 * Commercials-gegen-Retail und Saisonalität. Wer alles gleichzeitig
 * einschaltet, findet garantiert irgendwo einen Ausschlag — vier Dimensionen
 * über vier Ergebnisklassen sind sechzehn Zahlen, und ein paar davon sind
 * immer auffällig.
 */
export const DIM_STANDARD: DimKey[] = ["cot", "saison"];

export const DIM_ALLE: DimKey[] = ["cot", "saison", "qscore", "veto"];

/** Wie eine Dimension zum Trade stand: +1 dafür, −1 dagegen, 0 ohne Aussage. */
export interface DimStand {
  key: DimKey;
  wert: -1 | 0 | 1;
}

/** Aus einer Komma-Liste in der Adresszeile die gültigen Dimensionen lesen. */
export function dimensionenAus(roh: string | null): DimKey[] {
  if (roh === null) return DIM_STANDARD;
  // Leere Auswahl ist eine Auswahl — dann zeigt die Seite die Ergebnisse ohne
  // Dimensionen, statt heimlich auf den Standard zurückzufallen.
  return roh.split(",").map((s) => s.trim())
    .filter((s): s is DimKey => (DIM_ALLE as string[]).includes(s));
}

/* ------------------------------------------------------------- Grundrate */

export interface DimBasis {
  key: DimKey;
  dafuer: number;
  dagegen: number;
  stumm: number;
  /** Anteil dafür an den Trades, bei denen die Dimension überhaupt sprach. */
  anteil: number | null;
  quote: Quote;
}

function zaehle(trades: TiefenTrade[], key: DimKey): DimBasis {
  let dafuer = 0, dagegen = 0, stumm = 0;
  for (const t of trades) {
    const w = t.dims?.find((d) => d.key === key)?.wert ?? 0;
    if (w > 0) dafuer++;
    else if (w < 0) dagegen++;
    else stumm++;
  }
  // Stumme Trades bleiben aus dem Nenner: eine Dimension ohne Aussage ist
  // kein dagegen. Sonst sähe eine Quelle mit Lücken automatisch schlecht aus.
  const gesprochen = dafuer + dagegen;
  return {
    key, dafuer, dagegen, stumm,
    anteil: gesprochen > 0 ? dafuer / gesprochen : null,
    quote: wilson(dafuer, gesprochen),
  };
}

/* --------------------------------------------------- Ergebnis x Dimension */

export interface ErgebnisDim extends DimBasis {
  /** Anteil dieser Ergebnisklasse minus Grundrate, in Prozentpunkten. */
  abweichung: number | null;
  /**
   * True, wenn das Intervall dieser Klasse die Grundrate nicht mehr enthält.
   * Nur dann ist die Abweichung mehr als Rauschen.
   */
  auffaellig: boolean;
}

export interface ErgebnisZeile {
  ergebnis: string;
  label: string;
  n: number;
  dims: ErgebnisDim[];
}

export interface ErgebnisAuswertung {
  grundraten: DimBasis[];
  zeilen: ErgebnisZeile[];
  gesamt: number;
}

/**
 * Nimm alle Trades einer Ergebnisklasse — was hatten sie gemeinsam?
 *
 * Genau die Frage „alle TPs ineinander, wie viele liefen mit den
 * Commercials". Die Antwort steht in `abweichung`, nicht in `anteil`.
 */
export function nachErgebnis(
  trades: TiefenTrade[],
  dims: DimKey[],
  ergebnisse: { key: string; label: string }[],
): ErgebnisAuswertung {
  const grundraten = dims.map((k) => zaehle(trades, k));
  const basisNach = new Map(grundraten.map((g) => [g.key, g]));

  const zeilen = ergebnisse.map(({ key, label }) => {
    const eigene = trades.filter((t) => t.ergebnis === key);
    return {
      ergebnis: key,
      label,
      n: eigene.length,
      dims: dims.map((k) => {
        const hier = zaehle(eigene, k);
        const basis = basisNach.get(k)!;
        const abweichung = hier.anteil !== null && basis.anteil !== null
          ? (hier.anteil - basis.anteil) * 100 : null;
        // Strenger Test: die Grundrate muss ausserhalb des Intervalls dieser
        // Klasse liegen. Bei zwölf Full TPs ist fast nichts auffällig — das
        // ist die richtige Antwort auf zwölf Trades.
        const auffaellig = hier.quote.n > 0 && basis.anteil !== null
          && hier.quote.unten !== null && hier.quote.oben !== null
          && (basis.anteil < hier.quote.unten || basis.anteil > hier.quote.oben);
        return { ...hier, abweichung, auffaellig };
      }),
    };
  });

  return { grundraten, zeilen, gesamt: trades.length };
}

/* ------------------------------------------------------- Dimension x Erfolg */

export interface DimTeil {
  n: number;
  quote: Quote;
  erwartung: number | null;
}

export interface DimErfolg {
  key: DimKey;
  label: string;
  dafuer: DimTeil;
  dagegen: DimTeil;
  stumm: DimTeil;
  satz: string;
}

/** Ab hier lohnt der Vergleich — darunter ist jede Differenz Zufall. */
export const MIN_JE_SEITE_DIM = 15;

const teil = (liste: TiefenTrade[]): DimTeil => {
  const gewertet = liste.filter((t) => t.gewonnen !== null);
  return {
    n: liste.length,
    quote: wilson(gewertet.filter((t) => t.gewonnen === true).length, gewertet.length),
    erwartung: liste.length > 0
      ? liste.reduce((s, t) => s + t.r, 0) / liste.length : null,
  };
};

export interface TrennBefund {
  /** True nur, wenn sich die beiden Wilson-Intervalle NICHT überlappen. */
  getrennt: boolean;
  satz: string;
}

/**
 * Ein Satz darüber, ob zwei Lager sich in der Trefferquote wirklich trennen.
 *
 * Steht hier und nicht dreimal im Code: der Zeitstrahl auf der Backtest-Seite
 * stellt dieselbe Frage wie `nachDimension`, nur zu einer anderen Quelle.
 * Zwei Formulierungen derselben Prüfung würden über kurz oder lang
 * auseinanderlaufen — und dann stünde auf einer Seite „trennt" und auf der
 * anderen „kein Nachweis", ohne dass jemand sagen könnte, welche stimmt.
 */
export function trennBefund(dafuer: Quote, dagegen: Quote): TrennBefund {
  if (dafuer.n < MIN_JE_SEITE_DIM || dagegen.n < MIN_JE_SEITE_DIM) {
    return {
      getrennt: false,
      satz: `${dafuer.n} dafür gegen ${dagegen.n} dagegen — unter `
        + `${MIN_JE_SEITE_DIM} je Seite sagt der Vergleich nichts.`,
    };
  }
  const getrennt = dafuer.unten! > dagegen.oben! || dagegen.unten! > dafuer.oben!;
  const zahlen = `${(dafuer.quote! * 100).toFixed(1)} % gegen `
    + `${(dagegen.quote! * 100).toFixed(1)} %`;
  return {
    getrennt,
    satz: getrennt
      ? `${zahlen}, Intervalle getrennt — das trennt hier tatsächlich.`
      : `${zahlen} — die Intervalle überlappen. Kein Nachweis.`,
  };
}

/** Die Gegenrichtung: hat eine Dimension die Trefferquote überhaupt getrennt? */
export function nachDimension(trades: TiefenTrade[], dims: DimKey[]): DimErfolg[] {
  return dims.map((key) => {
    const wert = (t: TiefenTrade) => t.dims?.find((d) => d.key === key)?.wert ?? 0;
    const dafuer = teil(trades.filter((t) => wert(t) > 0));
    const dagegen = teil(trades.filter((t) => wert(t) < 0));
    const stumm = teil(trades.filter((t) => wert(t) === 0));

    const { satz } = trennBefund(dafuer.quote, dagegen.quote);

    return { key, label: DIM_LABEL[key], dafuer, dagegen, stumm, satz };
  });
}
