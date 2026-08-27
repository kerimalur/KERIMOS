import { perzentil, VERZUG, type Punkt } from "./reihen";
import { COT_FENSTER, COT_MINDESTENS, type CotRohdaten } from "./cot-divergenz";
import { vorwaertsVergleich, type Horizont, type Signal, type VorwaertsZeile } from "./vorwaerts";
import type { Kurspunkt } from "./saison";

/**
 * Wie streng muss die COT-Grenze sein? — gemessen statt geschätzt.
 *
 * `COT_GRENZE` steht auf 75/25, und diese Zahl ist bislang eine Überlegung,
 * keine Messung: enger heisst mehr Signale mit weniger Substanz, weiter heisst
 * fast nie eines. Welcher Wert wirklich trägt, kann man nur sehen, wenn man
 * für jede Schwelle nachrechnet, was der Markt danach tat — und das gegen das
 * hält, was er in einer beliebigen Woche sowieso tat.
 *
 * Genau das macht dieses Modul. Es ändert nichts an der Regel; es legt die
 * Zahlen daneben, damit die Entscheidung eine Grundlage hat.
 *
 * ─── Zwei Dinge, die hier bewusst so und nicht anders gemacht sind ───
 *
 * **Die Perzentilränge werden EINMAL gerechnet, nicht je Schwelle.** Der Rang
 * einer Woche hängt nur von der eigenen Historie ab, nicht davon, wo man die
 * Grenze zieht. Fünf Schwellen fünfmal durchzurechnen wäre fünfmal dieselbe
 * Arbeit — und bei rund tausend Wochen mal acht Währungen merkt man das.
 *
 * **Gezählt werden Übergänge, nicht Wochen.** Bleibt eine Streckung acht
 * Wochen bestehen, ist das EIN Ereignis und nicht acht. Wer jede Woche als
 * eigenes Signal zählt, misst dieselbe Marktbewegung mehrfach, bekommt
 * scheinbar viele Beobachtungen und ein Vertrauensintervall, das viel zu eng
 * ist. Das ist der klassische Weg, sich einen Faktor schönzurechnen.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/kalibrierung.mts`.
 */

/** Obere Grenzen, die verglichen werden. Unten gilt jeweils 100 − oben. */
/*
 * 90 kam am 26.08.2026 dazu: Kerims Indikator steht auf 90/10, und eine
 * Kalibrierung, die seine eigene Einstellung nicht enthält, kann ihm nicht
 * sagen, ob sie gut gewählt ist.
 */
export const SCHWELLEN = [65, 70, 75, 80, 85, 90] as const;
export type Schwelle = (typeof SCHWELLEN)[number];

/** Ein Wochenwert je Währung: die beiden Ränge, sonst nichts. */
export interface RangWoche {
  datum: string;
  komm: number;
  retail: number;
}

/**
 * Die Rangreihe einer Währung über die ganze Historie.
 *
 * Die Stichtage kommen aus der Commercials-Reihe selbst — das sind die
 * COT-Termine. `perzentil` bekommt jeden davon als Stichtag und rechnet mit
 * demselben Publikationsverzug wie im Livebetrieb, damit hier nichts
 * gemessen wird, was man damals noch nicht wissen konnte.
 */
export function raengeReihe(daten: CotRohdaten, ccy: string): RangWoche[] {
  const komm: Punkt[] = daten.cotKomm?.[ccy] ?? [];
  const retail: Punkt[] = daten.cotRetail?.[ccy] ?? [];
  if (komm.length === 0 || retail.length === 0) return [];

  const raus: RangWoche[] = [];
  for (const p of komm) {
    // Der Stichtag muss NACH der Veröffentlichung liegen, sonst wüsste man
    // den Wert am Stichtag noch gar nicht.
    const stichtag = plusTage(p.datum, VERZUG.cot);
    const k = perzentil(komm, stichtag, COT_FENSTER, VERZUG.cot, COT_MINDESTENS);
    const r = perzentil(retail, stichtag, COT_FENSTER, VERZUG.cot, COT_MINDESTENS);
    if (!k || !r) continue;
    raus.push({ datum: stichtag, komm: k.rang, retail: r.rang });
  }
  return raus;
}

function plusTage(datum: string, tage: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Divergenz einer Woche bei gegebener Schwelle. Den Commercials wird gefolgt. */
export function divergenzBei(w: RangWoche, oben: number): -1 | 0 | 1 {
  const unten = 100 - oben;
  if (w.komm >= oben && w.retail <= unten) return 1;
  if (w.komm <= unten && w.retail >= oben) return -1;
  return 0;
}

/**
 * Paar-Signale bei einer Schwelle.
 *
 * Long im Paar heisst Basis kaufen, Quote verkaufen — deshalb `basis − quote`.
 * Gezählt wird der ÜBERGANG in einen Zustand: von 0 oder der Gegenrichtung
 * hinein. Solange derselbe Zustand anhält, entsteht kein neues Signal.
 */
/**
 * Aus welchen Beinen das Signal gebaut wird.
 *
 * Kerims Pine-Indikator nimmt fuer USDJPY ausdruecklich NUR den Dollar-Index
 * ("Quelle: USD", CFTC 098662) — also ein Bein. Diese Rechnung nahm bisher
 * immer beide und zog sie voneinander ab. Das sind zwei verschiedene Signale,
 * und sie koennen sich gegenseitig ausloeschen: steht USD gestreckt short und
 * JPY ebenfalls gestreckt short, ist die Differenz null und es entsteht gar
 * kein Signal — obwohl der Indikator eines zeigt.
 *
 * Welche Fassung traegt, ist eine Messfrage. Deshalb alle drei, nebeneinander.
 */
export type Variante = "beide" | "basis" | "quote" | "synth";

export const VARIANTEN: { key: Variante; label: string; hilfe: string }[] = [
  { key: "beide", label: "beide Währungen",
    hilfe: "Basis minus Quote — nur wenn beide Seiten zusammenpassen" },
  { key: "basis", label: "nur Basiswährung",
    hilfe: "z. B. USD bei USDJPY — so rechnet Kerims Pine-Indikator" },
  { key: "quote", label: "nur Quotewährung",
    hilfe: "z. B. JPY bei USDJPY, Vorzeichen gedreht" },
  { key: "synth", label: "synthetisch",
    hilfe: "erst Basis minus Quote, dann der Rang — so rechnet Kerims Pine "
      + "und seit dem 26.08.2026 auch Monty" },
];

/** Der Zustand einer Woche in der gewaehlten Fassung. */
function zustand(
  b: RangWoche, q: RangWoche | undefined, oben: number, variante: Variante,
): -1 | 0 | 1 {
  const db = divergenzBei(b, oben);
  // Eine gestuetzte Quotewaehrung drueckt das Paar — daher das Minus.
  const dq = q ? divergenzBei(q, oben) : 0;
  // "synth" bekommt die Raenge des PAARES herein, nicht die einer Waehrung
  // (siehe `synthRaengeReihe`). Dort ist die Differenz schon vor dem Rang
  // gebildet worden — es gibt kein zweites Bein mehr zu verrechnen.
  const summe = variante === "basis" || variante === "synth" ? db
    : variante === "quote" ? -dq
      : db - dq;
  return summe > 0 ? 1 : summe < 0 ? -1 : 0;
}

export function paarSignale(
  basis: RangWoche[], quote: RangWoche[], oben: number,
  variante: Variante = "beide",
): Signal[] {
  const nachDatum = new Map(quote.map((w) => [w.datum, w]));
  const signale: Signal[] = [];
  let vorher: -1 | 0 | 1 = 0;

  for (const b of basis) {
    const q = nachDatum.get(b.datum);
    // Nur bei "beide" ist der Gegentermin zwingend: braucht die Fassung das
    // andere Bein gar nicht, waere das Ueberspringen ein stiller Datenverlust.
    if (!q && variante !== "basis") continue;
    const jetzt = zustand(b, q, oben, variante);
    if (jetzt !== 0 && jetzt !== vorher) {
      signale.push({ datum: b.datum, richtung: jetzt });
    }
    vorher = jetzt;
  }
  return signale;
}

export interface SchwellenZeile {
  oben: Schwelle;
  unten: number;
  /** Wie viele Übergänge die Schwelle über die ganze Historie erzeugt hat. */
  signale: number;
  /** Der Vorwärtsvergleich je Horizont. */
  zeilen: VorwaertsZeile[];
}

export interface Kalibrierung {
  paar: string;
  variante?: Variante;
  reihen: SchwellenZeile[];
  /** Was die Zahlen nahelegen — oder dass sie nichts nahelegen. */
  fazit: string;
}

/**
 * Ein Paar über alle Schwellen durchrechnen.
 *
 * `basisReihe` und `quoteReihe` kommen aus `raengeReihe` und werden von aussen
 * hereingereicht: dieselbe Währung steckt in mehreren Paaren, und ihre Ränge
 * je Paar neu zu rechnen wäre dieselbe Arbeit siebenmal.
 */
export function kalibriere(
  paar: string, kurse: Kurspunkt[],
  basisReihe: RangWoche[], quoteReihe: RangWoche[],
  horizonte?: readonly Horizont[],
  variante: Variante = "beide",
): Kalibrierung {
  const reihen: SchwellenZeile[] = SCHWELLEN.map((oben) => {
    const signale = paarSignale(basisReihe, quoteReihe, oben, variante);
    return {
      oben, unten: 100 - oben,
      signale: signale.length,
      zeilen: vorwaertsVergleich(kurse, signale, horizonte),
    };
  });

  return { paar, variante, reihen, fazit: fazitVon(reihen) };
}

/**
 * Der Satz unter der Tabelle.
 *
 * Bewusst zurückhaltend formuliert. Diese Auswertung sucht über fünf
 * Schwellen mal vier Horizonte, also zwanzig Kombinationen — bei so vielen
 * Versuchen sieht eine davon fast immer gut aus, auch wenn nichts dahinter
 * steckt. Deshalb wird nur dann etwas empfohlen, wenn eine Schwelle über
 * MEHRERE Horizonte vorne liegt.
 */
export function fazitVon(reihen: SchwellenZeile[]): string {
  const brauchbar = reihen.filter((r) =>
    r.zeilen.some((z) => z.signal.n >= 15 && z.abstand !== null));
  if (brauchbar.length === 0) {
    return "Keine Schwelle liefert genug Signale mit abgelaufenem Horizont. "
      + "Über dieses Paar lässt sich nichts sagen.";
  }

  const punkte = brauchbar.map((r) => ({
    oben: r.oben,
    gut: r.zeilen.filter((z) => z.signal.n >= 15 && (z.abstand ?? 0) > 0.2).length,
    schnitt: mittel(r.zeilen
      .filter((z) => z.signal.n >= 15 && z.abstand !== null)
      .map((z) => z.abstand!)),
    signale: r.signale,
  })).sort((a, b) => b.gut - a.gut || (b.schnitt ?? -99) - (a.schnitt ?? -99));

  const beste = punkte[0];
  if (beste.gut < 2) {
    return "Keine Schwelle liegt über mehr als einem Horizont vor der Basis. "
      + "Bei fünf Schwellen und vier Horizonten ist ein einzelner Treffer das, "
      + "was Zufall erzeugt — 75/25 kann so bleiben.";
  }
  return `${beste.oben}/${100 - beste.oben} liegt über ${beste.gut} Horizonte vor der `
    + `Basis (im Schnitt ${beste.schnitt!.toFixed(2)} Punkte, ${beste.signale} Signale). `
    + "Das ist ein Hinweis, kein Beweis: die Auswertung hat zwanzig Kombinationen "
    + "durchprobiert, und ein Stop liegt in keiner davon.";
}

const mittel = (w: number[]): number | null =>
  w.length === 0 ? null : w.reduce((a, b) => a + b, 0) / w.length;


/* ------------------------------------------------- Über alle Paare hinweg */

export interface PaarZeile {
  paar: string;
  /** Mittlerer Abstand zur Basis je Schwelle, über alle Horizonte. */
  jeSchwelle: (number | null)[];
  /** Beste Schwelle — oder null, wenn keine über der Basis liegt. */
  beste: Schwelle | null;
  /** Mittlerer Abstand der besten Schwelle. */
  besterWert: number | null;
}

export interface Gesamtbild {
  zeilen: PaarZeile[];
  /** Paare, bei denen ÜBERHAUPT eine Schwelle über der Basis liegt. */
  mitVorsprung: number;
  fazit: string;
}

/**
 * Das Urteil über alle Paare, nicht über eines.
 *
 * Ein einzelnes Paar sagt fast nichts: bei fünf Schwellen mal vier Horizonten
 * findet man immer irgendwo eine gute Zahl. Erst wenn DIESELBE Schwelle über
 * MEHRERE Paare vorne liegt, ist es mehr als Rauschen — und wenn die Hälfte
 * der Paare durchgehend im Minus steht, ist die Frage nicht mehr, welche
 * Schwelle die richtige ist.
 *
 * Bewertet wird je Schwelle der Mittelwert der Horizonte, und nur aus
 * Horizonten mit genug Signalen. Fehlen die, bleibt das Feld leer statt eine
 * Null einzusetzen, die wie ein Ergebnis aussieht.
 */
export function gesamtbild(alle: Kalibrierung[]): Gesamtbild {
  const zeilen: PaarZeile[] = alle.map((k) => {
    const jeSchwelle = k.reihen.map((r) => {
      const werte = r.zeilen
        .filter((z) => z.signal.n >= 15 && z.abstand !== null)
        .map((z) => z.abstand!);
      return werte.length === 0
        ? null : werte.reduce((a, b) => a + b, 0) / werte.length;
    });

    let beste: Schwelle | null = null;
    let besterWert: number | null = null;
    jeSchwelle.forEach((w, i) => {
      if (w === null || w <= 0) return;
      if (besterWert === null || w > besterWert) {
        besterWert = w;
        beste = SCHWELLEN[i];
      }
    });

    return { paar: k.paar, jeSchwelle, beste, besterWert };
  });

  const mitVorsprung = zeilen.filter((z) => z.beste !== null).length;

  // Wie oft gewinnt jede Schwelle?
  const siege = new Map<Schwelle, number>();
  for (const z of zeilen) {
    if (z.beste !== null) siege.set(z.beste, (siege.get(z.beste) ?? 0) + 1);
  }
  const [gewinner, anzahl] = [...siege.entries()]
    .sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  let fazit: string;
  if (mitVorsprung === 0) {
    fazit = "Bei keinem Paar liegt eine Schwelle über der Basis. Das ist kein "
      + "Kalibrierproblem — der Faktor erzeugt in dieser Form keine Drift.";
  } else if (mitVorsprung <= zeilen.length / 2) {
    fazit = `Nur ${mitVorsprung} von ${zeilen.length} Paaren haben überhaupt eine `
      + "Schwelle über der Basis, und die andere Hälfte steht durchgehend im "
      + "Minus. Eine neue Grenze würde daran nichts ändern: die Frage ist nicht, "
      + "wie streng gefiltert wird, sondern ob der Faktor trägt. 75/25 bleibt, "
      + "bis es dafür einen Beleg gibt.";
  } else if (gewinner !== null && anzahl >= Math.ceil(zeilen.length * 0.6)) {
    fazit = `${gewinner}/${100 - gewinner} liegt bei ${anzahl} von ${zeilen.length} `
      + "Paaren vorn. Das ist der erste Befund, der eine Änderung tragen würde — "
      + "vorher trotzdem an einem Paar prüfen, das hier nicht dabei war.";
  } else {
    fazit = `${mitVorsprung} von ${zeilen.length} Paaren haben einen Vorsprung, aber `
      + "bei verschiedenen Schwellen. Widersprechen sich die Paare, ist der "
      + "Gewinner das Ergebnis der Suche und nicht des Marktes. 75/25 bleibt.";
  }

  return { zeilen, mitVorsprung, fazit };
}
