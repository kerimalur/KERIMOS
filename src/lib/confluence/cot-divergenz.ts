import { perzentil, frischeVon, VERZUG, type Punkt, type Frische } from "./reihen";

/**
 * COT nach Kerims Regel: Commercials gegen Retail.
 *
 * Die Idee dahinter ist alt und tragfähig — Retail liegt an Wendepunkten
 * überdurchschnittlich oft falsch, Commercials sind die Hedger auf der
 * Gegenseite. Wenn Retail voll long ist und die Commercials voll short, ist
 * das ein Argument für Short.
 *
 * ─── Der Fallstrick, der diesen Faktor sonst wertlos machen würde ───
 *
 * Im COT-Bericht gilt eine Buchhaltungsidentität: über alle Gruppen summieren
 * sich Long und Short auf dasselbe Open Interest. Netto heisst das
 *
 *     Commercials ≈ −(Grossspekulanten + Nicht-Meldepflichtige)
 *
 * Die Commercials stehen also fast IMMER gegen Retail — nicht weil sie es
 * besser wissen, sondern weil jemand die andere Seite halten muss. Wer nur
 * auf „die zeigen in verschiedene Richtungen" filtert, baut einen Faktor, der
 * in neun von zehn Wochen zustimmt. Das sieht nach Bestätigung aus und ist
 * keine.
 *
 * Deshalb wird hier NICHT das Vorzeichen verglichen, sondern die
 * **Streckung**: beide Gruppen werden gegen ihre EIGENE Dreijahres-Historie
 * in einen Perzentilrang gelegt, und ein Signal entsteht erst, wenn beide
 * gleichzeitig an ihrem jeweiligen Rand stehen. Das ist eine Aussage über
 * Extreme, nicht über die Kontostruktur der Börse.
 *
 * „Retail" sind die **Nicht-Meldepflichtigen** aus dem Legacy-Bericht: die
 * Kleinspekulanten am Terminmarkt. Das ist ein Proxy — CFD-Retail, wo Kerim
 * selbst handelt, ist eine andere Gruppe. Der Proxy hat dafür Jahrzehnte
 * Historie und ist damit als Einziger rückwirkend testbar.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/cot.mts`.
 */

/**
 * Ab welchem Rang eine Gruppe als „gestreckt" gilt.
 *
 * 75/25 statt 85/15 wie beim Veto: hier müssen ZWEI Bedingungen gleichzeitig
 * zutreffen, nicht eine. Mit 85/15 auf beiden Seiten gäbe es über drei Jahre
 * eine Handvoll Wochen mit Signal — zu wenig, um daraus je etwas zu lernen.
 * Und breiter als 75/25 wäre es keine Streckung mehr, sondern eine Neigung.
 */
export const COT_GRENZE = { oben: 75, unten: 25 } as const;

/** Fenster für den Perzentilrang, in Tagen. Drei Jahre, wie beim Veto. */
export const COT_FENSTER = 1095;

/** Mindestanzahl Wochen im Fenster, sonst kein Rang. */
export const COT_MINDESTENS = 26;

export interface CotBild {
  ccy: string;
  /** Perzentilrang der Commercials, 0…100. Null ohne genug Historie. */
  kommRang: number | null;
  /** Perzentilrang der Nicht-Meldepflichtigen (Retail-Proxy), 0…100. */
  retailRang: number | null;
  kommN: number;
  retailN: number;
  datum: string | null;
  frische: Frische;
  /**
   * +1 = Commercials gestreckt long UND Retail gestreckt short → spricht für
   * diese Währung. −1 = umgekehrt. 0 = mindestens eine Seite nicht am Rand.
   */
  divergenz: -1 | 0 | 1;
  text: string;
}

export interface CotRohdaten {
  /** Netto-Position der Commercials als Anteil des Open Interest. */
  cotKomm?: Partial<Record<string, Punkt[]>>;
  /** Netto-Position der Nicht-Meldepflichtigen als Anteil des OI. */
  cotRetail?: Partial<Record<string, Punkt[]>>;
}

const leer = (ccy: string): CotBild => ({
  ccy, kommRang: null, retailRang: null, kommN: 0, retailN: 0,
  datum: null, frische: "fehlt", divergenz: 0,
  text: "Keine COT-Historie.",
});

/** Was Commercials und Retail am Stichtag über eine Währung sagen. */
export function cotBildFuer(
  daten: CotRohdaten, ccy: string, stichtag: string,
): CotBild {
  const komm = perzentil(
    daten.cotKomm?.[ccy] ?? [], stichtag, COT_FENSTER, VERZUG.cot, COT_MINDESTENS);
  const retail = perzentil(
    daten.cotRetail?.[ccy] ?? [], stichtag, COT_FENSTER, VERZUG.cot, COT_MINDESTENS);

  if (!komm || !retail) return leer(ccy);

  const kommLang = komm.rang >= COT_GRENZE.oben;
  const kommKurz = komm.rang <= COT_GRENZE.unten;
  const retailLang = retail.rang >= COT_GRENZE.oben;
  const retailKurz = retail.rang <= COT_GRENZE.unten;

  // Gefolgt wird den Commercials, nicht Retail — das ist der ganze Gedanke.
  const divergenz: -1 | 0 | 1 =
    kommLang && retailKurz ? 1
      : kommKurz && retailLang ? -1
        : 0;

  const alter = Math.max(0, Math.round(
    (Date.parse(`${stichtag}T00:00:00Z`) - Date.parse(`${komm.datum}T00:00:00Z`)) / 86_400_000));
  const r = (v: number) => v.toFixed(0);

  return {
    ccy,
    kommRang: komm.rang,
    retailRang: retail.rang,
    kommN: komm.n,
    retailN: retail.n,
    datum: komm.datum,
    frische: frischeVon(alter, "cot"),
    divergenz,
    text: divergenz === 0
      ? `Commercials im ${r(komm.rang)}., Retail im ${r(retail.rang)}. Perzentil — `
        + "mindestens eine Seite steht nicht am Rand, also keine Aussage."
      : `Commercials im ${r(komm.rang)}. Perzentil, Retail im ${r(retail.rang)}. — `
        + `beide gestreckt, und zwar gegeneinander. Spricht `
        + `${divergenz > 0 ? "für" : "gegen"} ${ccy}.`,
  };
}

export interface CotPaarUrteil {
  basis: CotBild;
  quote: CotBild;
  /** +1 = spricht für Long im Paar, −1 = für Short, 0 = keine Aussage. */
  dir: -1 | 0 | 1;
  /** 0…1 — 1 nur, wenn BEIDE Währungen gestreckt sind und zusammenpassen. */
  staerke: number;
  frische: Frische;
  text: string;
}

const schlechtere = (a: Frische, b: Frische): Frische => {
  const rang: Frische[] = ["frisch", "brauchbar", "alt", "fehlt"];
  return rang.indexOf(a) >= rang.indexOf(b) ? a : b;
};

/**
 * Das Paar-Urteil aus beiden Währungsbildern.
 *
 * Long im Paar heisst Basis kaufen, Quote verkaufen. Ein Divergenz-Signal
 * +1 auf der Basis und −1 auf der Quote zeigen also beide in dieselbe
 * Richtung und ergeben das stärkste Urteil. Widersprechen sie sich, hebt es
 * sich auf — dann steht die eine Währung so gestreckt da wie die andere, und
 * das Paar sagt nichts.
 */
export function cotPaarUrteil(basis: CotBild, quote: CotBild): CotPaarUrteil {
  const summe = basis.divergenz - quote.divergenz;
  const dir: -1 | 0 | 1 = summe > 0 ? 1 : summe < 0 ? -1 : 0;
  const frische = schlechtere(basis.frische, quote.frische);
  const beide = basis.divergenz !== 0 && quote.divergenz !== 0;

  const name = (c: CotBild) =>
    c.divergenz > 0 ? `${c.ccy} gestützt` : c.divergenz < 0 ? `${c.ccy} belastet` : null;
  const teile = [name(basis), name(quote)].filter(Boolean);

  return {
    basis, quote, dir,
    // Volle Stärke nur, wenn beide Seiten gestreckt sind: ein Signal aus einer
    // einzigen Währung ist ein halbes.
    staerke: dir === 0 ? 0 : beide ? 1 : 0.5,
    frische,
    text: dir === 0
      ? (basis.divergenz !== 0 || quote.divergenz !== 0
        ? "Beide Währungen zeigen dasselbe — im Paar hebt es sich auf."
        : "Keine Streckung auf beiden Seiten.")
      : teile.join(" · ") + ".",
  };
}

/* ------------------------------------------------- Alle Paare auf einmal */

export interface CotPaarZeile {
  paar: string;
  urteil: CotPaarUrteil;
  /** Nur das Basis-Bein — die Sicht des Pine-Indikators und von TradingView. */
  nurBasis: -1 | 0 | 1;
  /** True, wenn beide Sichten verschiedene Richtungen sagen. */
  widerspruch: boolean;
}

/**
 * Die Paar-Tabelle für Monty.
 *
 * Steht hier und nicht in `monty.ts`, weil `monty.ts` `server-only` ist und
 * damit von keinem Kontrollskript importiert werden kann. Eine Rechnung, die
 * sich nicht prüfen lässt, ist eine Behauptung.
 *
 * Die Währungsbilder kommen fertig herein: sie werden EINMAL gerechnet und
 * für alle 28 Paare wiederverwendet. Je Paar neu zu rechnen wäre dieselbe
 * Arbeit 56-mal — und schlimmer, ein zweiter Rechenweg, der irgendwann von
 * der Währungstabelle daneben abweicht.
 */
export function cotPaarZeilen(
  bilder: Map<string, CotBild>, paare: readonly string[],
): CotPaarZeile[] {
  return paare.flatMap((paar) => {
    const basis = bilder.get(paar.slice(0, 3));
    const quote = bilder.get(paar.slice(3, 6));
    if (!basis || !quote) return [];

    const urteil = cotPaarUrteil(basis, quote);
    const nurBasis = basis.divergenz;
    return [{
      paar, urteil, nurBasis,
      /*
       * Strittig heisst schlicht: die zwei Sichten sagen nicht dasselbe.
       *
       * Der erste Versuch war enger — „beide sagen etwas, und zwar
       * Verschiedenes" — und hat den wichtigsten Fall übersehen: stehen
       * BEIDE Währungen gleich gestreckt, hebt sich die Differenz auf, das
       * Paar sagt nichts, und die Basiswährung allein sagt trotzdem etwas.
       * Genau dann zeigt der Pine-Indikator ein Signal und der Screener
       * keines. Ein Kontrollwert hat das gefunden, nicht das Nachdenken.
       *
       * Drei Arten, wie es dazu kommt:
       *   gegenläufig  — beide sprechen, in verschiedene Richtungen
       *   ausgelöscht  — Paar schweigt, Basis spricht (der Fall oben)
       *   nur Quote    — Paar spricht, Basis schweigt; das Signal kommt
       *                  allein vom Gegenbein
       */
      widerspruch: urteil.dir !== nurBasis,
    }];
  }).sort((a, b) =>
    // Widersprüche ganz nach oben: sie sind der Grund für diese Ansicht.
    Number(b.widerspruch) - Number(a.widerspruch)
    || b.urteil.staerke - a.urteil.staerke
    || Math.abs(b.nurBasis) - Math.abs(a.nurBasis)
    || a.paar.localeCompare(b.paar));
}
