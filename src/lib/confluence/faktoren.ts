import {
  wertZum, aenderung, schnitt, perzentil, frischeVon, VERZUG,
  type Punkt, type Frische,
} from "./reihen";

/**
 * Die vier Confluences — und nur diese vier.
 *
 * Warum vier und nicht acht: Je mehr Faktoren, desto sicherer findet man für
 * jede Richtung eine Begründung. Ein Filter, der nie „nein" sagt, ist keiner.
 * Bewusst draussen: Saisonalität (schwächster Faktor, höchste Verwechslungs-
 * gefahr mit Zufall), Retail-Sentiment (grösstenteils eine Umverpackung des
 * COT-Faktors, und historisch erst ab Juli 2026 vorhanden).
 *
 * Drei Faktoren geben eine Richtung, einer nicht:
 *   1 Zinsdifferenz + 6M-Richtung   Richtung
 *   2 Realzins-Differenz            Richtung
 *   3 Risiko-Regime                 Richtung
 *   4 COT-Perzentil                 **Veto** — „alle sind schon long" ist ein
 *                                   Grund, nicht einzusteigen, kein Grund,
 *                                   in die Gegenrichtung zu gehen.
 *
 * Jede Funktion hier nimmt einen Stichtag. Die Ansicht „Jetzt" ist derselbe
 * Code mit Stichtag = heute — dadurch können Jetzt und Rückblick gar nicht
 * auseinanderlaufen.
 *
 * Rein rechnerisch, keine Datenbank. Siehe `tools/checks/confluence.mts`.
 */

export type FaktorKey = "zins" | "real" | "regime" | "cot";

export const FAKTOR_LABEL: Record<FaktorKey, string> = {
  zins: "Zinsdifferenz",
  real: "Realzins",
  regime: "Risiko-Regime",
  cot: "COT-Perzentil",
};

export const FAKTOR_ROLLE: Record<FaktorKey, string> = {
  zins: "Kernfilter — wer hat strukturellen Rückenwind",
  real: "Bestätigung — Zins abzüglich Inflation",
  regime: "Kontextschalter — in Risk-off gewinnen JPY und CHF unabhängig vom Zins",
  cot: "Veto — kein eigenes Signal",
};

export const G8 = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"] as const;
export type Waehrung = (typeof G8)[number];

/**
 * Wie stark eine Währung zulegt, wenn Risiko gesucht wird (+1) bzw. gemieden
 * wird (−1). Keine geschätzten Betas aus einer Regression, sondern die
 * Rangfolge, die im FX-Markt seit Jahrzehnten hält und die man an jedem
 * Krisentag nachsehen kann: Yen und Franken sind die Häfen, die
 * Rohstoffwährungen die Gegenseite, der Dollar ein halber Hafen.
 */
export const RISIKO_BETA: Record<Waehrung, number> = {
  AUD: 1.0, NZD: 1.0, CAD: 0.5, GBP: 0.2, EUR: 0.0, USD: -0.4, CHF: -0.9, JPY: -1.0,
};

/* ------------------------------------------------------------- Rohdaten */

export interface Rohdaten {
  /** Leitzins in % je Währung, aufsteigend. */
  leitzins: Partial<Record<string, Punkt[]>>;
  /** CPI YoY in % je Währung. */
  cpi: Partial<Record<string, Punkt[]>>;
  /** COT: Netto-Position der Leveraged Funds als Anteil des Open Interest. */
  cot: Partial<Record<string, Punkt[]>>;
  /**
   * 2-Jahres-Staatsanleihenrendite in % je Währung — die Zinserwartung.
   * Optional: nicht jede Währung hat eine Quelle, und die Kontrollwerte
   * bauen ihre Vorlagen ohne dieses Feld.
   */
  zwei?: Partial<Record<string, Punkt[]>>;
  /**
   * Publikationsverzug der Leitzinsreihe je Währung, in Tagen.
   *
   * Nötig, seit der Leitzins aus der BIS-Tagesreihe kommt: Ein Tageswert 45
   * Tage lang zurückzuhalten wäre genauso falsch wie einen Monatswert sofort
   * zu benutzen. Fehlt der Eintrag, gilt weiter der Monats-Verzug — damit
   * bleiben alte Aufrufer und die Kontrollwerte unverändert gültig.
   */
  leitzinsVerzug?: Partial<Record<string, number>>;
  vix: Punkt[];
  spx: Punkt[];
  gold: Punkt[];
  kupfer: Punkt[];
}

export const LEERE_DATEN: Rohdaten = {
  leitzins: {}, cpi: {}, cot: {}, vix: [], spx: [], gold: [], kupfer: [],
};

/* ------------------------------------------------------------- Bausteine */

const klemme = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/** Schwellen, ab denen eine Differenz überhaupt als Aussage zählt. */
export const SCHWELLE = {
  /** Prozentpunkte Leitzins-Differenz. Darunter ist es Rauschen. */
  zins: 0.25,
  /** Prozentpunkte Realzins-Differenz — verrauschter, deshalb höher. */
  real: 0.5,
  /** Produkt aus Beta-Abstand und Regime-Stärke. */
  regime: 0.25,
  /** 6M-Bewegung, ab der eine schrumpfende Differenz die Richtung aufhebt. */
  zinsDreht: 0.5,
} as const;

/** Perzentil-Grenzen für das COT-Veto. */
export const VETO_GRENZE = { oben: 85, unten: 15 } as const;

export interface WaehrungsWerte {
  ccy: string;
  leitzins: number | null;
  leitzinsDatum: string | null;
  leitzinsFrische: Frische;
  /** Veränderung des Leitzinses über 180 Tage, in pp. */
  leitzins6M: number | null;
  cpi: number | null;
  cpiDatum: string | null;
  cpiFrische: Frische;
  /** Leitzins − CPI. Null, wenn eines fehlt. */
  realzins: number | null;
  cotRang: number | null;
  cotDatum: string | null;
  cotFrische: Frische;
  cotN: number;
  risikoBeta: number;
}

/** Alles, was eine Währung am Stichtag über sich sagen kann. */
export function werteFuer(
  daten: Rohdaten, ccy: string, stichtag: string,
): WaehrungsWerte {
  const zinsReihe = daten.leitzins[ccy] ?? [];
  const cpiReihe = daten.cpi[ccy] ?? [];
  const cotReihe = daten.cot[ccy] ?? [];

  // Verzug und Rhythmus haengen daran, WELCHE Reihe geliefert wurde.
  const zinsVerzug = daten.leitzinsVerzug?.[ccy] ?? VERZUG.monatlich;
  const zinsRhythmus = zinsVerzug <= VERZUG.woechentlich ? "taeglich" : "monatlich";

  const zins = wertZum(zinsReihe, stichtag, zinsVerzug);
  const preis = wertZum(cpiReihe, stichtag, VERZUG.monatlich);
  // Drei Jahre Fenster: kürzer und ein einzelner Trend füllt das ganze
  // Perzentil, länger und Zinswenden von vor Jahren bestimmen das Urteil.
  const cot = perzentil(cotReihe, stichtag, 1095, VERZUG.cot, 26);

  return {
    ccy,
    leitzins: zins?.wert ?? null,
    leitzinsDatum: zins?.datum ?? null,
    leitzinsFrische: frischeVon(zins?.alterTage ?? null, zinsRhythmus),
    leitzins6M: aenderung(zinsReihe, stichtag, 182, zinsVerzug),
    cpi: preis?.wert ?? null,
    cpiDatum: preis?.datum ?? null,
    cpiFrische: frischeVon(preis?.alterTage ?? null, "monatlich"),
    realzins: zins && preis ? zins.wert - preis.wert : null,
    cotRang: cot?.rang ?? null,
    cotDatum: cot?.datum ?? null,
    cotFrische: frischeVon(
      cot ? Math.max(0, Math.round((Date.parse(`${stichtag}T00:00:00Z`) - Date.parse(`${cot.datum}T00:00:00Z`)) / 86_400_000)) : null,
      "cot",
    ),
    cotN: cot?.n ?? 0,
    risikoBeta: RISIKO_BETA[ccy as Waehrung] ?? 0,
  };
}

/* ------------------------------------------------------------- Regime */

export interface RegimeTeil {
  label: string;
  score: number;
  text: string;
}

export interface RegimeLage {
  /** −1 (Risk-off) … +1 (Risk-on). Null, wenn keine Quelle antwortet. */
  score: number | null;
  lage: "risk-on" | "risk-off" | "neutral" | "unbekannt";
  teile: RegimeTeil[];
  fehlend: string[];
  datum: string | null;
  frische: Frische;
}

/**
 * Risiko-Regime aus drei unabhängigen Blickwinkeln.
 *
 * Drei statt einem, weil jeder für sich täuscht: der VIX kann tief sein,
 * während Aktien schon fallen; Aktien können steigen, während die
 * Rohstoffseite ausblutet. Zwei von drei müssen dasselbe sagen, damit hier
 * etwas anderes als „neutral" herauskommt.
 */
export function baueRegime(daten: Rohdaten, stichtag: string): RegimeLage {
  const teile: RegimeTeil[] = [];
  const fehlend: string[] = [];
  let juengstes: string | null = null;
  const merke = (d: string | null) => {
    if (d && (!juengstes || d > juengstes)) juengstes = d;
  };

  // 1) VIX: 10 → +1, 18 → 0, 26 → −1.
  const vix = wertZum(daten.vix, stichtag, VERZUG.taeglich);
  if (vix) {
    merke(vix.datum);
    const s = klemme((18 - vix.wert) / 8);
    teile.push({
      label: "VIX",
      score: s,
      text: `VIX bei ${vix.wert.toFixed(1)} — ${vix.wert < 15 ? "ruhig" : vix.wert > 25 ? "nervös" : "unauffällig"}.`,
    });
  } else fehlend.push("VIX");

  // 2) S&P 500 gegen den 50-Tage-Schnitt.
  const spx = wertZum(daten.spx, stichtag, VERZUG.taeglich);
  const spxSchnitt = schnitt(daten.spx, stichtag, 50, VERZUG.taeglich);
  if (spx && spxSchnitt) {
    merke(spx.datum);
    const abstand = spx.wert / spxSchnitt - 1;
    teile.push({
      label: "S&P 500",
      score: klemme(abstand / 0.03),
      text: `S&P ${(abstand * 100).toFixed(1)} % ${abstand >= 0 ? "über" : "unter"} dem 50-Tage-Schnitt.`,
    });
  } else fehlend.push("S&P 500");

  // 3) Kupfer/Gold: das ehrlichste Konjunktur-Thermometer, weil beide
  //    Rohstoffe sind und sich Währungs- und Zinseffekte herauskürzen.
  const kupfer = wertZum(daten.kupfer, stichtag, VERZUG.taeglich);
  const gold = wertZum(daten.gold, stichtag, VERZUG.taeglich);
  if (kupfer && gold && gold.wert > 0) {
    merke(kupfer.datum);
    const paare = verhaeltnisReihe(daten.kupfer, daten.gold);
    const vergleich = schnitt(paare, stichtag, 50, VERZUG.taeglich);
    const jetzt = kupfer.wert / gold.wert;
    if (vergleich && vergleich > 0) {
      const abstand = jetzt / vergleich - 1;
      teile.push({
        label: "Kupfer/Gold",
        score: klemme(abstand / 0.05),
        text: `Kupfer gegen Gold ${(abstand * 100).toFixed(1)} % ${abstand >= 0 ? "über" : "unter"} dem 50-Tage-Schnitt.`,
      });
    } else fehlend.push("Kupfer/Gold (zu wenig Historie)");
  } else fehlend.push("Kupfer/Gold");

  if (teile.length === 0) {
    return { score: null, lage: "unbekannt", teile, fehlend, datum: null, frische: "fehlt" };
  }

  const score = teile.reduce((s, t) => s + t.score, 0) / teile.length;
  const alter = juengstes
    ? Math.round((Date.parse(`${stichtag}T00:00:00Z`) - Date.parse(`${juengstes}T00:00:00Z`)) / 86_400_000)
    : null;

  return {
    score,
    lage: score >= 0.2 ? "risk-on" : score <= -0.2 ? "risk-off" : "neutral",
    teile,
    fehlend,
    datum: juengstes,
    frische: frischeVon(alter, "taeglich"),
  };
}

/** Punktweises Verhältnis zweier Reihen, nur an gemeinsamen Daten. */
export function verhaeltnisReihe(zaehler: Punkt[], nenner: Punkt[]): Punkt[] {
  const n = new Map(nenner.map((p) => [p.datum, p.wert]));
  const out: Punkt[] = [];
  for (const p of zaehler) {
    const unten = n.get(p.datum);
    if (unten !== undefined && unten !== 0) out.push({ datum: p.datum, wert: p.wert / unten });
  }
  return out;
}

/* ------------------------------------------------------------- Faktoren */

export interface FaktorUrteil {
  key: FaktorKey;
  label: string;
  /** Bezogen auf das Paar: +1 = spricht für Long, −1 = für Short. */
  dir: -1 | 0 | 1;
  /** 0…1 — wie deutlich. */
  staerke: number;
  text: string;
  frische: Frische;
  /** Was fehlt, wenn nichts gesagt werden kann. */
  luecke: string | null;
}

const ohne = (key: FaktorKey, luecke: string): FaktorUrteil => ({
  key, label: FAKTOR_LABEL[key], dir: 0, staerke: 0,
  text: `Keine Aussage — ${luecke}.`, frische: "fehlt", luecke,
});

const schlechtere = (a: Frische, b: Frische): Frische => {
  const rang: Frische[] = ["frisch", "brauchbar", "alt", "fehlt"];
  return rang.indexOf(a) >= rang.indexOf(b) ? a : b;
};

export function faktorZins(b: WaehrungsWerte, q: WaehrungsWerte): FaktorUrteil {
  if (b.leitzins === null || q.leitzins === null) {
    return ohne("zins", `Leitzins fehlt für ${b.leitzins === null ? b.ccy : q.ccy}`);
  }
  const diff = b.leitzins - q.leitzins;
  const trend = b.leitzins6M !== null && q.leitzins6M !== null
    ? b.leitzins6M - q.leitzins6M : null;

  let dir: -1 | 0 | 1 = diff >= SCHWELLE.zins ? 1 : diff <= -SCHWELLE.zins ? -1 : 0;
  let zusatz = "";

  if (trend !== null) {
    zusatz = ` In 6 Monaten ${trend > 0 ? "+" : ""}${trend.toFixed(2)} pp — ` +
      (Math.abs(trend) < 0.1 ? "unverändert"
        : Math.sign(trend) === Math.sign(diff) ? "die Differenz wächst" : "die Differenz schrumpft") + ".";
    // Eine Differenz, die schneller wegläuft als sie trägt, ist kein
    // Rückenwind mehr — der Markt handelt die Erwartung, nicht den Bestand.
    if (dir !== 0 && Math.sign(trend) !== Math.sign(diff) && Math.abs(trend) >= SCHWELLE.zinsDreht) {
      dir = 0;
      zusatz += " Sie schrumpft schneller, als sie trägt — deshalb keine Richtung.";
    }
  }

  return {
    key: "zins", label: FAKTOR_LABEL.zins, dir,
    staerke: klemme(Math.abs(diff) / 2, 0, 1),
    text: `Leitzins ${b.ccy} ${b.leitzins.toFixed(2)} % gegen ${q.ccy} ${q.leitzins.toFixed(2)} % `
      + `→ ${diff > 0 ? "+" : ""}${diff.toFixed(2)} pp.${zusatz}`,
    frische: schlechtere(b.leitzinsFrische, q.leitzinsFrische),
    luecke: null,
  };
}

export function faktorReal(b: WaehrungsWerte, q: WaehrungsWerte): FaktorUrteil {
  if (b.realzins === null || q.realzins === null) {
    const wer = b.realzins === null ? b : q;
    return ohne("real", `${wer.leitzins === null ? "Leitzins" : "Inflation"} fehlt für ${wer.ccy}`);
  }
  const diff = b.realzins - q.realzins;
  return {
    key: "real", label: FAKTOR_LABEL.real,
    dir: diff >= SCHWELLE.real ? 1 : diff <= -SCHWELLE.real ? -1 : 0,
    staerke: klemme(Math.abs(diff) / 3, 0, 1),
    text: `Real ${b.ccy} ${b.realzins.toFixed(2)} % (${b.leitzins!.toFixed(2)} − ${b.cpi!.toFixed(2)}) `
      + `gegen ${q.ccy} ${q.realzins.toFixed(2)} % → ${diff > 0 ? "+" : ""}${diff.toFixed(2)} pp.`,
    frische: schlechtere(
      schlechtere(b.leitzinsFrische, b.cpiFrische),
      schlechtere(q.leitzinsFrische, q.cpiFrische),
    ),
    luecke: null,
  };
}

export function faktorRegime(
  b: WaehrungsWerte, q: WaehrungsWerte, regime: RegimeLage,
): FaktorUrteil {
  if (regime.score === null) {
    return ohne("regime", `keine Marktdaten (${regime.fehlend.join(", ")})`);
  }
  const abstand = b.risikoBeta - q.risikoBeta;
  const wirkung = abstand * regime.score;

  return {
    key: "regime", label: FAKTOR_LABEL.regime,
    dir: wirkung >= SCHWELLE.regime ? 1 : wirkung <= -SCHWELLE.regime ? -1 : 0,
    staerke: klemme(Math.abs(wirkung), 0, 1),
    text: regime.lage === "neutral"
      ? `Regime neutral (${regime.score.toFixed(2)}) — kein Rückenwind aus dieser Ecke.`
      : `${regime.lage === "risk-on" ? "Risk-on" : "Risk-off"} (${regime.score.toFixed(2)}). `
        + `${b.ccy} reagiert ${b.risikoBeta > 0 ? "mit" : b.risikoBeta < 0 ? "gegen" : "kaum auf"} das Risiko `
        + `(${b.risikoBeta > 0 ? "+" : ""}${b.risikoBeta}), ${q.ccy} ${q.risikoBeta > 0 ? "+" : ""}${q.risikoBeta}.`,
    frische: regime.frische,
    luecke: null,
  };
}

/* ------------------------------------------------------------- Veto */

export interface VetoUrteil {
  /** Perzentilrang der Leveraged Funds, 0…100. */
  rangBasis: number | null;
  rangQuote: number | null;
  /** Gegen welche Richtung das Veto steht. 0 = keins. */
  gegen: -1 | 0 | 1;
  text: string;
  frische: Frische;
}

/**
 * COT als Veto, nie als Signal.
 *
 * „Alle sind schon long" ist ein Grund, nicht einzusteigen — kein Grund,
 * short zu gehen. Positionierungsextreme können sich monatelang halten, und
 * wer sie als Gegensignal handelt, steht die ganze Zeit auf der falschen
 * Seite. Deshalb steht hier nur, **gegen welche Richtung** etwas spricht.
 */
export function baueVeto(b: WaehrungsWerte, q: WaehrungsWerte): VetoUrteil {
  const frische = schlechtere(b.cotFrische, q.cotFrische);
  const rb = b.cotRang;
  const rq = q.cotRang;

  if (rb === null && rq === null) {
    return { rangBasis: null, rangQuote: null, gegen: 0, text: "Keine COT-Historie.", frische };
  }

  const gruende: string[] = [];
  // Long im Paar heisst: Basis kaufen, Quote verkaufen.
  const gegenLong = (rb !== null && rb >= VETO_GRENZE.oben) || (rq !== null && rq <= VETO_GRENZE.unten);
  const gegenShort = (rb !== null && rb <= VETO_GRENZE.unten) || (rq !== null && rq >= VETO_GRENZE.oben);

  if (rb !== null && rb >= VETO_GRENZE.oben) gruende.push(`${b.ccy} im ${rb.toFixed(0)}. Perzentil — schon voll long`);
  if (rb !== null && rb <= VETO_GRENZE.unten) gruende.push(`${b.ccy} im ${rb.toFixed(0)}. Perzentil — schon voll short`);
  if (rq !== null && rq >= VETO_GRENZE.oben) gruende.push(`${q.ccy} im ${rq.toFixed(0)}. Perzentil — schon voll long`);
  if (rq !== null && rq <= VETO_GRENZE.unten) gruende.push(`${q.ccy} im ${rq.toFixed(0)}. Perzentil — schon voll short`);

  // Steht beides gleichzeitig, hebt es sich auf: dann ist kein Extrem mehr
  // erkennbar, sondern nur eine Spreizung.
  const gegen: -1 | 0 | 1 = gegenLong && gegenShort ? 0 : gegenLong ? 1 : gegenShort ? -1 : 0;

  return {
    rangBasis: rb, rangQuote: rq, gegen,
    text: gruende.length > 0
      ? gruende.join(" · ") + "."
      : `${b.ccy} ${rb === null ? "·" : rb.toFixed(0)}. / ${q.ccy} ${rq === null ? "·" : rq.toFixed(0)}. Perzentil — kein Extrem.`,
    frische,
  };
}

/* ------------------------------------------------------------- Paar */

export type Urteilswort =
  | "rueckenwind" | "leichter-rueckenwind" | "gegenwind"
  | "gemischt" | "neutral" | "zuwenig";

export const URTEIL_LABEL: Record<Urteilswort, string> = {
  rueckenwind: "Rückenwind",
  "leichter-rueckenwind": "leichter Rückenwind",
  gegenwind: "Gegenwind",
  gemischt: "uneinig",
  neutral: "kein Rückenwind",
  zuwenig: "zu wenig Daten",
};

export interface PaarUrteil {
  paar: string;
  basis: string;
  quote: string;
  stichtag: string;
  faktoren: FaktorUrteil[];
  veto: VetoUrteil;
  /** Eigene Richtung des Paares, ohne dass eine gefragt wurde. */
  richtung: -1 | 0 | 1;
  /** Summe dir × stärke über die drei gerichteten Faktoren, −1…+1. */
  netto: number;
  /** 0…1 — wie einig sich die gerichteten Faktoren sind. Null ohne Richtung. */
  einigkeit: number | null;
  /** Bezogen auf die gefragte Richtung (oder die eigene, wenn keine gefragt). */
  gefragt: -1 | 0 | 1;
  dafuer: number;
  dagegen: number;
  stumm: number;
  urteil: Urteilswort;
  vetoAktiv: boolean;
  satz: string;
  /** Schlechteste Frische aller benutzten Quellen. */
  frische: Frische;
}

/**
 * Das Urteil für ein Paar an einem Stichtag.
 *
 * `richtungGefragt` ist der eigentliche Zweck der Seite: Kerim hat den
 * Einstieg technisch am Chart und will wissen, ob die Fundamentallage an
 * diesem Tag dafür oder dagegen sprach — nicht, was sie „empfohlen" hätte.
 */
export function bewertePaar(
  daten: Rohdaten, paar: string, stichtag: string,
  regime: RegimeLage, richtungGefragt: -1 | 0 | 1 = 0,
): PaarUrteil {
  // Erst normieren: aus dem Journal kommt mal "EURUSD", mal "EUR/USD". Ohne
  // diesen Schritt waere die Quote-Waehrung von "EUR/USD" die Zeichenfolge
  // "/US" - und der Faktor fiele still auf "keine Daten" zurueck.
  const rein = paar.toUpperCase().replace(/[^A-Z]/g, "");
  const basis = rein.slice(0, 3);
  const quote = rein.slice(3, 6);
  const b = werteFuer(daten, basis, stichtag);
  const q = werteFuer(daten, quote, stichtag);

  const faktoren = [faktorZins(b, q), faktorReal(b, q), faktorRegime(b, q, regime)];
  const veto = baueVeto(b, q);

  const gerichtet = faktoren.filter((f) => f.dir !== 0);
  const netto = faktoren.reduce((s, f) => s + f.dir * f.staerke, 0) / faktoren.length;
  const richtung: -1 | 0 | 1 = gerichtet.length === 0 ? 0
    : netto > 0.05 ? 1 : netto < -0.05 ? -1 : 0;

  const gefragt: -1 | 0 | 1 = richtungGefragt !== 0 ? richtungGefragt : richtung;
  const dafuer = gefragt === 0 ? 0 : faktoren.filter((f) => f.dir === gefragt).length;
  const dagegen = gefragt === 0 ? 0 : faktoren.filter((f) => f.dir === -gefragt).length;
  const stumm = faktoren.length - dafuer - dagegen;

  const einigkeit = gerichtet.length === 0 ? null
    : Math.abs(gerichtet.reduce((s, f) => s + f.dir, 0)) / gerichtet.length;

  const vetoAktiv = gefragt !== 0 && veto.gegen === gefragt;

  let urteil: Urteilswort;
  if (faktoren.every((f) => f.luecke !== null)) urteil = "zuwenig";
  else if (gefragt === 0 || gerichtet.length === 0) urteil = "neutral";
  else if (dagegen > dafuer) urteil = "gegenwind";
  else if (dafuer >= 2 && dagegen === 0) urteil = "rueckenwind";
  else if (dafuer >= 1 && dagegen === 0) urteil = "leichter-rueckenwind";
  else if (dafuer > 0 && dagegen > 0) urteil = "gemischt";
  else urteil = "neutral";

  return {
    paar: `${basis}${quote}`, basis, quote, stichtag,
    faktoren, veto, richtung, netto, einigkeit,
    gefragt, dafuer, dagegen, stumm, urteil, vetoAktiv,
    satz: baueSatz(paar, gefragt, dafuer, dagegen, stumm, urteil, vetoAktiv),
    frische: faktoren.reduce<Frische>((s, f) => schlechtere(s, f.frische), "frisch"),
  };
}

function baueSatz(
  paar: string, gefragt: -1 | 0 | 1,
  dafuer: number, dagegen: number, stumm: number,
  urteil: Urteilswort, vetoAktiv: boolean,
): string {
  const richtungswort = gefragt === 1 ? "Long" : gefragt === -1 ? "Short" : null;
  if (urteil === "zuwenig") {
    return `Für ${paar} fehlen die Daten — kein Urteil, weder dafür noch dagegen.`;
  }
  if (!richtungswort) {
    return `${paar}: keiner der drei Faktoren zeigt deutlich in eine Richtung.`;
  }

  const zaehlung = `${dafuer} dafür, ${dagegen} dagegen`
    + (stumm > 0 ? `, ${stumm} ohne Aussage` : "");
  const kern = {
    rueckenwind: `${richtungswort} auf ${paar} hatte Rückenwind: ${zaehlung}.`,
    "leichter-rueckenwind": `${richtungswort} auf ${paar} hatte leichten Rückenwind: ${zaehlung}.`,
    gegenwind: `${richtungswort} auf ${paar} lief gegen die Fundamentallage: ${zaehlung}.`,
    gemischt: `Für ${richtungswort} auf ${paar} widersprechen sich die Faktoren: ${zaehlung}.`,
    neutral: `${richtungswort} auf ${paar}: kein Faktor spricht deutlich dafür oder dagegen.`,
    zuwenig: "",
  }[urteil];

  return vetoAktiv
    ? `${kern} Dazu ein COT-Veto — die Position war schon überfüllt.`
    : kern;
}

/* ------------------------------------------------------------- Übersicht */

export const PAARE = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "CADJPY", "CHFJPY", "EURAUD",
  "EURCAD", "EURCHF", "EURNZD", "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD",
  "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "NZDCAD", "NZDCHF", "NZDJPY",
] as const;

export function bewerteAlle(
  daten: Rohdaten, stichtag: string, regime: RegimeLage,
): PaarUrteil[] {
  return PAARE.map((p) => bewertePaar(daten, p, stichtag, regime));
}

export interface WaehrungsBild extends WaehrungsWerte {
  /** In wie vielen der 7 Paare zeigt die Lage für diese Währung nach oben. */
  dafuer: number;
  dagegen: number;
  stumm: number;
  /** −1…+1: (dafür − dagegen) / 7. */
  saldo: number;
  /** True, wenn mindestens zwei Paare gegeneinander stehen. */
  strittig: boolean;
}

/**
 * Was spricht bei einer Währung miteinander, was gegeneinander?
 *
 * Gemessen wird nicht an einer erfundenen Gesamtnote, sondern daran, wie die
 * Währung in ihren sieben eigenen Paaren dasteht. Ein EUR, der gegen JPY
 * stark und gegen USD schwach aussieht, ist genau das — und nicht „neutral".
 */
export function waehrungsBild(
  daten: Rohdaten, ccy: string, stichtag: string,
  alle: PaarUrteil[],
): WaehrungsBild {
  const werte = werteFuer(daten, ccy, stichtag);
  let dafuer = 0, dagegen = 0, stummZahl = 0;

  for (const u of alle) {
    if (u.basis !== ccy && u.quote !== ccy) continue;
    // Im Quote-Teil dreht sich die Aussage um: EURUSD long heisst USD schwach.
    const fuerWaehrung = u.basis === ccy ? u.richtung : -u.richtung;
    if (fuerWaehrung > 0) dafuer++;
    else if (fuerWaehrung < 0) dagegen++;
    else stummZahl++;
  }

  return {
    ...werte, dafuer, dagegen, stumm: stummZahl,
    saldo: (dafuer - dagegen) / 7,
    strittig: dafuer > 0 && dagegen > 0,
  };
}
