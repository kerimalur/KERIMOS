import { URTEIL_LABEL, type Urteilswort } from "./faktoren";

/**
 * Hatte der Rückenwind eine Wirkung?
 *
 * Das ist die einzige Frage zur Confluence-Idee, die Kerims Datenlage
 * überhaupt beantworten kann. Ein Vergleich „Modell gegen Markt" über acht
 * Jahre Wochendaten scheitert an der effektiven Stichprobe (rund 350
 * unabhängige Beobachtungen, Intervall ±5 Punkte). Der Vergleich **innerhalb
 * seiner eigenen Trades** dagegen ist gepaart: dieselbe Methode, dieselbe
 * Hand, derselbe Zeitraum — nur einmal mit und einmal ohne fundamentalen
 * Rückenwind.
 *
 * Diese Datei rechnet und urteilt, sie beschönigt nicht. Überlappen die
 * Konfidenzintervalle, steht hier „kein Nachweis" — auch wenn die Differenz
 * gross aussieht.
 */

export interface TradeUrteil {
  id: string;
  datum: string;
  paar: string;
  richtung: -1 | 1;
  /** Signiertes R: Gewinne positiv, Verluste negativ. */
  r: number;
  gewonnen: boolean | null;
  urteil: Urteilswort;
  dafuer: number;
  dagegen: number;
  vetoAktiv: boolean;
}

export type Lager = "rueckenwind" | "uneinig" | "gegenwind" | "ohne";

export const LAGER_LABEL: Record<Lager, string> = {
  rueckenwind: "mit Rückenwind",
  uneinig: "uneinige Lage",
  gegenwind: "gegen die Lage",
  ohne: "kein Urteil möglich",
};

export function lagerVon(u: Urteilswort): Lager {
  if (u === "rueckenwind" || u === "leichter-rueckenwind") return "rueckenwind";
  if (u === "gemischt") return "uneinig";
  if (u === "gegenwind") return "gegenwind";
  return "ohne";
}

/* ------------------------------------------------------------- Statistik */

export interface Quote {
  n: number;
  treffer: number;
  /** 0…1, null bei n = 0. */
  quote: number | null;
  unten: number | null;
  oben: number | null;
}

/**
 * Wilson-Intervall statt der Normalapproximation.
 *
 * Bei kleinen Stichproben — und 200 Trades in vier Gruppen sind klein —
 * liefert die einfache Formel Intervalle, die über 100 % hinausragen oder
 * bei 0 Treffern die Breite null haben. Wilson tut das nicht.
 */
export function wilson(treffer: number, n: number, z = 1.96): Quote {
  if (n <= 0) return { n: 0, treffer: 0, quote: null, unten: null, oben: null };
  const p = treffer / n;
  const nenner = 1 + (z * z) / n;
  const mitte = (p + (z * z) / (2 * n)) / nenner;
  const spanne = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / nenner;
  return {
    n, treffer, quote: p,
    unten: Math.max(0, mitte - spanne),
    oben: Math.min(1, mitte + spanne),
  };
}

export interface Gruppe {
  lager: Lager;
  label: string;
  n: number;
  gewinne: number;
  verluste: number;
  quote: Quote;
  /** Ø signiertes R je Trade. Null ohne Trades. */
  erwartung: number | null;
  summeR: number;
}

export function gruppiere(trades: TradeUrteil[]): Gruppe[] {
  const lager: Lager[] = ["rueckenwind", "uneinig", "gegenwind", "ohne"];

  return lager.map((l) => {
    const eigene = trades.filter((t) => lagerVon(t.urteil) === l);
    // Nur entschiedene Trades zählen in die Quote: ein Break-even ist weder
    // Treffer noch Fehlschlag und würde die Quote sonst künstlich drücken.
    const entschieden = eigene.filter((t) => t.gewonnen !== null);
    const gewinne = entschieden.filter((t) => t.gewonnen).length;
    const summeR = eigene.reduce((s, t) => s + t.r, 0);

    return {
      lager: l,
      label: LAGER_LABEL[l],
      n: eigene.length,
      gewinne,
      verluste: entschieden.length - gewinne,
      quote: wilson(gewinne, entschieden.length),
      erwartung: eigene.length > 0 ? summeR / eigene.length : null,
      summeR,
    };
  });
}

export type Befund = "traegt" | "verkehrt" | "kein-nachweis" | "zu-wenig";

export interface Vergleich {
  mit: Quote;
  gegen: Quote;
  /** Differenz in Prozentpunkten. Null, wenn eine Seite leer ist. */
  abstand: number | null;
  /** Differenz der Erwartung in R. */
  abstandR: number | null;
  befund: Befund;
  satz: string;
}

/** Ab hier lohnt der Vergleich überhaupt — darunter ist alles Rauschen. */
export const MIN_JE_SEITE = 15;

/**
 * Rückenwind gegen Gegenwind, ehrlich verglichen.
 *
 * „Kein Nachweis" ist das erwartete Ergebnis, nicht der Ausnahmefall. Bei
 * 60 gegen 40 Trades muss der Unterschied rund 20 Punkte betragen, damit die
 * Intervalle auseinanderfallen. Wer das nicht dazusagt, verkauft Rauschen
 * als Erkenntnis.
 */
export function vergleiche(gruppen: Gruppe[]): Vergleich {
  const mit = gruppen.find((g) => g.lager === "rueckenwind")!.quote;
  const gegen = gruppen.find((g) => g.lager === "gegenwind")!.quote;
  const mitG = gruppen.find((g) => g.lager === "rueckenwind")!;
  const gegenG = gruppen.find((g) => g.lager === "gegenwind")!;

  const abstand = mit.quote !== null && gegen.quote !== null
    ? (mit.quote - gegen.quote) * 100 : null;
  const abstandR = mitG.erwartung !== null && gegenG.erwartung !== null
    ? mitG.erwartung - gegenG.erwartung : null;

  if (mit.n < MIN_JE_SEITE || gegen.n < MIN_JE_SEITE) {
    return {
      mit, gegen, abstand, abstandR, befund: "zu-wenig",
      satz: `Noch zu wenig Material: ${mit.n} Trades mit Rückenwind, ${gegen.n} dagegen. `
        + `Unter ${MIN_JE_SEITE} je Seite ist jede Differenz Zufall — weiter sammeln.`,
    };
  }

  // Nicht-überlappende Intervalle sind ein strengerer Test als der
  // p-Wert-Vergleich zweier Anteile. Bewusst so: lieber einen echten Effekt
  // übersehen als einen erfundenen behaupten.
  const getrennt = mit.unten! > gegen.oben! || gegen.unten! > mit.oben!;
  const besser = (mit.quote ?? 0) > (gegen.quote ?? 0);

  if (!getrennt) {
    return {
      mit, gegen, abstand, abstandR, befund: "kein-nachweis",
      satz: `${(mit.quote! * 100).toFixed(1)} % gegen ${(gegen.quote! * 100).toFixed(1)} % — `
        + `die Intervalle überlappen. Das ist **kein Nachweis**, auch wenn die `
        + `Differenz von ${abstand! > 0 ? "+" : ""}${abstand!.toFixed(1)} Punkten gross aussieht. `
        + `Bei ${mit.n} gegen ${gegen.n} Trades braucht es mehr Abstand.`,
    };
  }

  return besser
    ? {
      mit, gegen, abstand, abstandR, befund: "traegt",
      satz: `${(mit.quote! * 100).toFixed(1)} % mit Rückenwind gegen `
        + `${(gegen.quote! * 100).toFixed(1)} % dagegen, und die Intervalle überlappen nicht. `
        + `Der Filter trägt in deiner eigenen Stichprobe.`,
    }
    : {
      mit, gegen, abstand, abstandR, befund: "verkehrt",
      satz: `Trades gegen die Fundamentallage liefen besser `
        + `(${(gegen.quote! * 100).toFixed(1)} % gegen ${(mit.quote! * 100).toFixed(1)} %), `
        + `und zwar deutlich. Entweder ist ein Faktor falsch herum, oder der `
        + `Filter misst etwas anderes als gedacht — nachsehen, bevor du ihn benutzt.`,
    };
}

/* ------------------------------------------------------------- Veto */

export interface VetoBilanz {
  mitVeto: Quote;
  ohneVeto: Quote;
  satz: string;
}

/**
 * Hat das COT-Veto etwas gebracht?
 *
 * Getrennt vom Rückenwind gerechnet, weil es eine andere Behauptung ist:
 * nicht „diese Richtung ist besser", sondern „bei überfüllter Positionierung
 * lieber gar nicht".
 */
export function vetoBilanz(trades: TradeUrteil[]): VetoBilanz {
  const teil = (mit: boolean) => {
    const eigene = trades.filter((t) => t.vetoAktiv === mit && t.gewonnen !== null);
    return wilson(eigene.filter((t) => t.gewonnen).length, eigene.length);
  };
  const mitVeto = teil(true);
  const ohneVeto = teil(false);

  if (mitVeto.n < MIN_JE_SEITE) {
    return {
      mitVeto, ohneVeto,
      satz: `Nur ${mitVeto.n} Trade(s) liefen gegen ein COT-Veto — zu wenig für eine Aussage.`,
    };
  }
  const getrennt = mitVeto.oben! < ohneVeto.unten! || ohneVeto.oben! < mitVeto.unten!;
  return {
    mitVeto, ohneVeto,
    satz: getrennt
      ? `Trades gegen ein Veto trafen ${(mitVeto.quote! * 100).toFixed(1)} %, die übrigen `
        + `${(ohneVeto.quote! * 100).toFixed(1)} % — der Unterschied ist belegt.`
      : `${(mitVeto.quote! * 100).toFixed(1)} % gegen ${(ohneVeto.quote! * 100).toFixed(1)} % — `
        + `die Intervalle überlappen, kein Nachweis.`,
  };
}

/* ------------------------------------------------------------- Aufteilung */

export interface Aufteilung {
  urteil: Urteilswort;
  label: string;
  n: number;
  anteil: number;
}

/**
 * Wie oft welches Urteil vorkam.
 *
 * Der wichtigste Kontrollwert der ganzen Seite: Ein Filter, der bei 90 % der
 * Trades „Rückenwind" sagt, filtert nichts. Er beruhigt nur.
 */
export function aufteilung(trades: TradeUrteil[]): Aufteilung[] {
  const worte: Urteilswort[] = [
    "rueckenwind", "leichter-rueckenwind", "gemischt", "gegenwind", "neutral", "zuwenig",
  ];
  return worte.map((u) => {
    const n = trades.filter((t) => t.urteil === u).length;
    return {
      urteil: u, label: URTEIL_LABEL[u], n,
      anteil: trades.length > 0 ? n / trades.length : 0,
    };
  }).filter((a) => a.n > 0);
}
