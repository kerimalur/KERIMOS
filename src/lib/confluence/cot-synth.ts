import { plusTage, VERZUG, type Punkt } from "./reihen";

/**
 * COT synthetisch — Kerims Pine-Rechnung, nachgebaut.
 *
 * **Warum es diese Datei gibt.** KerimOS legte bisher jede Währung einzeln in
 * einen Perzentilrang und verglich dann die Ränge. Kerims Indikator macht es
 * umgekehrt: er subtrahiert erst die OI-normalisierten Netto-Positionen und
 * bildet **danach** den Rang. Seine eigene Skript-Kopfzeile begründet das
 * richtig — *„Ränge zu subtrahieren wäre falsch, weil der Rang keine lineare
 * Transformation ist."* Zwei Währungen, die je im Mittelfeld liegen, können
 * als Differenz an einem historischen Extrem stehen. Die alte Rechnung konnte
 * das nicht sehen.
 *
 * **Ein Unterschied ist Absicht.** Sein Cross-Modus greift nur bei Paaren
 * *ohne* USD; die sieben USD-Paare fallen dort auf ein einzelnes Bein zurück,
 * bei USDJPY auf den Dollar-**Index** — einen Korb aus sechs Währungen, in
 * dem JPY mit knapp 14 % steckt. Auf Kerims Ansage rechnet KerimOS **alle 28
 * Paare** synthetisch. Das misst wirklich das Verhältnis der zwei Währungen
 * und macht nebenbei seine manuelle Invertierung überflüssig: `Basis − Quote`
 * ist von sich aus gerichtet, da kann kein Vorzeichen vergessen werden.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar mit `tools/checks/cot-synth.mts`.
 */

/** Die Einstellungen seines Indikators, als Zahlen an einer Stelle. */
export const SYNTH = {
  /** `lenWeeks` — Länge des Rangfensters in Wochenwerten. */
  wochen: 156,
  /** `impWeeks` — über wie viele Wochen der Impuls gemessen wird. */
  impulsWochen: 2,
  /** `idxHigh` / `idxLow` — ab wo eine Gruppe als gestreckt gilt. */
  oben: 90,
  unten: 10,
  /** `wLvl` / `wImp` — Gewichte im Bias. */
  gewichtNiveau: 1,
  gewichtImpuls: 1,
  /** `biasStrong` / `biasWeak`. */
  stark: 1,
  neutral: 0.4,
} as const;

/**
 * Mehrere Reihen auf ihre gemeinsamen Termine bringen.
 *
 * Ohne das würde eine fehlende Woche bei einer Währung alle folgenden Werte
 * der anderen um eine Position verschieben — und weil danach über Positionen
 * gerechnet wird (Impuls: „vor zwei Werten"), wäre der Fehler still und
 * dauerhaft. Sein Pine löst dasselbe dadurch, dass es nur schreibt, wenn
 * beide Beine da sind.
 */
export function ausrichten(reihen: Punkt[][]): { datum: string; werte: number[] }[] {
  if (reihen.length === 0) return [];
  const karten = reihen.map((r) => new Map(r.map((p) => [p.datum, p.wert])));
  const [erste, ...rest] = karten;

  const raus: { datum: string; werte: number[] }[] = [];
  for (const datum of [...erste.keys()].sort()) {
    const werte = [erste.get(datum) as number];
    let vollstaendig = true;
    for (const k of rest) {
      const w = k.get(datum);
      if (w === undefined) { vollstaendig = false; break; }
      werte.push(w);
    }
    if (vollstaendig) raus.push({ datum, werte });
  }
  return raus;
}

/** Basis minus Quote, auf gemeinsamen Terminen. */
export function synthReihe(basis: Punkt[], quote: Punkt[]): Punkt[] {
  return ausrichten([basis, quote])
    .map(({ datum, werte }) => ({ datum, wert: werte[0] - werte[1] }));
}

/** Die Änderung über `abstand` Werte — Positionen, nicht Kalendertage. */
export function aenderungen(reihe: Punkt[], abstand: number): Punkt[] {
  const raus: Punkt[] = [];
  for (let i = abstand; i < reihe.length; i++) {
    raus.push({ datum: reihe[i].datum, wert: reihe[i].wert - reihe[i - abstand].wert });
  }
  return raus;
}

export interface Rang {
  rang: number;
  wert: number;
  datum: string;
  /** Wie viele Werte im Fenster lagen. */
  n: number;
}

/**
 * Mittelrang des jüngsten Werts unter den letzten `wochen` Werten.
 *
 * Zwei Dinge sind hier bewusst so wie in seinem Pine und nicht wie sonst in
 * KerimOS:
 *
 * 1. **Das Fenster zählt Werte, nicht Tage.** `perzentil()` in `reihen.ts`
 *    filtert 1095 Kalendertage und bekommt mal 156, mal 157 Berichte. Sein
 *    Skript hält ein Feld der letzten 156 Wochenwerte. Der Unterschied liegt
 *    unter einem halben Perzentilpunkt — nachgebaut wird trotzdem seine
 *    Fassung, sonst weicht die Zahl ohne Grund ab.
 * 2. **Volles Fenster oder nichts.** Er zeigt erst einen Rang, wenn 156 Werte
 *    da sind. Ein Rang aus dreissig Wochen sähe genauso aus wie einer aus
 *    drei Jahren und wäre etwas völlig anderes.
 *
 * Der Verzug bleibt dagegen KerimOS-Regel: der Bericht vom Dienstag gilt erst
 * ab Freitag als bekannt. Live ändert das nichts — für die Kalibrierung ist
 * es der Unterschied zwischen Messung und Selbstbetrug.
 */
export function rangImFenster(
  reihe: Punkt[], stichtag: string,
  wochen = SYNTH.wochen, verzugTage = VERZUG.cot,
): Rang | null {
  const bekannt = reihe.filter((p) => plusTage(p.datum, verzugTage) <= stichtag);
  if (bekannt.length < wochen) return null;

  const fenster = bekannt.slice(-wochen);
  const jetzt = fenster[fenster.length - 1];

  let kleiner = 0, gleich = 0;
  for (const p of fenster) {
    if (p.wert < jetzt.wert) kleiner++;
    else if (p.wert === jetzt.wert) gleich++;
  }
  return {
    rang: ((kleiner + 0.5 * gleich) / fenster.length) * 100,
    wert: jetzt.wert,
    datum: jetzt.datum,
    n: fenster.length,
  };
}

export type BiasStufe = "stark-long" | "long" | "neutral" | "short" | "stark-short";

export const BIAS_WORT: Record<BiasStufe, string> = {
  "stark-long": "STARK LONG",
  long: "Long",
  neutral: "neutral",
  short: "Short",
  "stark-short": "STARK SHORT",
};

const klemme = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Score und Bias, genau wie im Panel.
 *
 * `score` ist der blosse Abstand der zwei Ränge. `bias` verrechnet ihn mit
 * dem Impuls: das Niveau sagt, wo die Positionierung steht, der Impuls, wohin
 * sie sich in den letzten zwei Wochen bewegt hat.
 *
 * **Das ist der Teil, der in KerimOS bisher komplett fehlte** — und er ist
 * nicht klein: bei Kerims EURCHF vom 26.08. kamen zwei Drittel des „STARK
 * LONG" aus dem Impuls und nur ein Drittel aus dem Niveau. Wer nur auf die
 * Streckung schaut, sieht dort gar kein Signal.
 *
 * Fehlt der Impuls (zu wenig Historie), zählt nur das Niveau — so macht es
 * sein Skript auch (`na(impComp) ? 0.0 : ...`).
 */
export function biasVon(rangA: number, rangB: number, impulsRang: number | null) {
  const score = rangA - rangB;
  const niveau = klemme(score / 100);
  const impuls = impulsRang === null ? null : klemme((impulsRang - 50) / 50);

  const bias = SYNTH.gewichtNiveau * niveau
    + (impuls === null ? 0 : SYNTH.gewichtImpuls * impuls);

  const stufe: BiasStufe =
    bias >= SYNTH.stark ? "stark-long"
      : bias >= SYNTH.neutral ? "long"
        : bias <= -SYNTH.stark ? "stark-short"
          : bias <= -SYNTH.neutral ? "short"
            : "neutral";

  return { score, niveau, impuls, bias, stufe };
}

export interface SynthBild {
  paar: string;
  /** Rang der Commercials auf der synthetischen Reihe, 0…100. */
  kommRang: number | null;
  /** Rang der Nicht-Meldepflichtigen (Retail-Proxy). */
  retailRang: number | null;
  /** Rang der Zwei-Wochen-Änderung des Spreads. */
  impulsRang: number | null;
  score: number | null;
  bias: number | null;
  stufe: BiasStufe | null;
  /** +1 Extrem long, −1 Extrem short, 0 keins. Schwellen 90/10. */
  extrem: -1 | 0 | 1;
  /** Berichtstermin, auf den sich alles bezieht. */
  datum: string | null;
  /** Werte im Rangfenster — unter `SYNTH.wochen` gibt es keine Ränge. */
  n: number;
}

const leer = (paar: string): SynthBild => ({
  paar, kommRang: null, retailRang: null, impulsRang: null,
  score: null, bias: null, stufe: null, extrem: 0, datum: null, n: 0,
});

/**
 * Das ganze Bild eines Paares, synthetisch gerechnet.
 *
 * Die vier Reihen kommen je Währung als Netto-Anteil am Open Interest herein
 * (`nettoReihe`). Sein Pine multipliziert zusätzlich mit 100 — für einen Rang
 * ist das folgenlos, weil er nur die Ordnung liest, und für die Differenz
 * ebenso, weil beide Beine denselben Faktor tragen.
 */
export function synthBild(
  paar: string, stichtag: string,
  kommBasis: Punkt[], kommQuote: Punkt[],
  retailBasis: Punkt[], retailQuote: Punkt[],
): SynthBild {
  // Alle vier gemeinsam ausrichten, nicht paarweise: sonst könnten Komm und
  // Retail auf verschiedenen Terminmengen sitzen, und der Spread verrechnete
  // dann Werte aus verschiedenen Wochen.
  const zeilen = ausrichten([kommBasis, kommQuote, retailBasis, retailQuote]);
  if (zeilen.length === 0) return leer(paar);

  const komm = zeilen.map((z) => ({ datum: z.datum, wert: z.werte[0] - z.werte[1] }));
  const retail = zeilen.map((z) => ({ datum: z.datum, wert: z.werte[2] - z.werte[3] }));
  const spread = zeilen.map((z, i) => ({ datum: z.datum, wert: komm[i].wert - retail[i].wert }));

  const rK = rangImFenster(komm, stichtag);
  const rR = rangImFenster(retail, stichtag);
  const rI = rangImFenster(aenderungen(spread, SYNTH.impulsWochen), stichtag);

  if (!rK || !rR) return { ...leer(paar), n: komm.length };

  const { score, bias, stufe } = biasVon(rK.rang, rR.rang, rI?.rang ?? null);

  const extrem: -1 | 0 | 1 =
    rK.rang >= SYNTH.oben && rR.rang <= SYNTH.unten ? 1
      : rK.rang <= SYNTH.unten && rR.rang >= SYNTH.oben ? -1
        : 0;

  return {
    paar, kommRang: rK.rang, retailRang: rR.rang, impulsRang: rI?.rang ?? null,
    score, bias, stufe, extrem, datum: rK.datum, n: rK.n,
  };
}

/**
 * Die ganze Rangreihe eines Paares — für die Kalibrierung.
 *
 * Dieselbe Rechnung wie `synthBild`, nur nicht für einen Stichtag, sondern
 * für jeden Berichtstermin der Historie. Damit lässt sich messen, was nach
 * einer Streckung tatsächlich passierte — und zwar in **der Fassung, nach
 * der Kerim handelt**. Bis zum 26.08.2026 kalibrierte KerimOS die
 * Rang-Differenz und damit eine Rechnung, die auf keinem seiner Charts
 * steht.
 *
 * Das Datum ist bewusst der Stichtag NACH Veröffentlichung, nicht der
 * Berichtstermin: sonst würde die Kalibrierung mit Wissen rechnen, das an
 * dem Tag noch niemand hatte. Das ist der Unterschied zwischen einer Messung
 * und einer Erinnerung.
 */
export function synthRaengeReihe(
  kommBasis: Punkt[], kommQuote: Punkt[],
  retailBasis: Punkt[], retailQuote: Punkt[],
  wochen = SYNTH.wochen, verzugTage = VERZUG.cot,
): { datum: string; komm: number; retail: number }[] {
  const zeilen = ausrichten([kommBasis, kommQuote, retailBasis, retailQuote]);
  if (zeilen.length < wochen) return [];

  const komm = zeilen.map((z) => z.werte[0] - z.werte[1]);
  const retail = zeilen.map((z) => z.werte[2] - z.werte[3]);

  // Mittelrang des letzten Werts im Fenster — dieselbe Formel wie oben,
  // hier über Positionen statt über eine gefilterte Reihe, weil sie sonst
  // tausendmal neu gefiltert würde.
  const rang = (werte: number[], bis: number) => {
    const von = bis - wochen + 1;
    const jetzt = werte[bis];
    let kleiner = 0, gleich = 0;
    for (let i = von; i <= bis; i++) {
      if (werte[i] < jetzt) kleiner++;
      else if (werte[i] === jetzt) gleich++;
    }
    return ((kleiner + 0.5 * gleich) / wochen) * 100;
  };

  const raus: { datum: string; komm: number; retail: number }[] = [];
  for (let i = wochen - 1; i < zeilen.length; i++) {
    raus.push({
      datum: plusTage(zeilen[i].datum, verzugTage),
      komm: rang(komm, i),
      retail: rang(retail, i),
    });
  }
  return raus;
}
