import { wilson, type Quote } from "./bilanz";

/**
 * Saisonalität: was ein Paar in einem Kalendermonat historisch getan hat.
 *
 * Gerechnet wird auf Monatsrenditen — letzter Schluss des Monats gegen den
 * letzten Schluss des Vormonats. Nicht auf Tagesdaten: ein Monat ist eine
 * Beobachtung, nicht zwanzig, und wer Tagesrenditen zählt, tut so, als hätte
 * er zwanzigmal so viele unabhängige Fälle.
 *
 * ─── Warum hier so viel Vorsicht steht ───
 *
 * Saisonalität ist der Faktor mit der höchsten Verwechslungsgefahr mit Zufall.
 * Mit 28 Paaren und 12 Monaten prüft man 336 Kombinationen; dass darunter ein
 * paar mit 80 % Trefferquote sind, ist bei reinem Zufall zu ERWARTEN, nicht
 * bemerkenswert. Deshalb steht an jeder Zahl die Stichprobengrösse, jede
 * Trefferquote bekommt ihr Wilson-Intervall, und `belegt` ist nur dann wahr,
 * wenn das Intervall die 50 % gar nicht mehr enthält.
 *
 * Zweitens: Monatsrenditen sind schief. Der Durchschnitt kippt an einem
 * einzigen Krisenmonat — deshalb steht der Median gleichberechtigt daneben.
 * Wo beide auseinanderlaufen, war es ein Ausreisser und kein Muster.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/saison.mts`.
 */

/** Wählbare Fenster in Jahren. 25 fehlt bewusst — siehe MAX_JAHRE. */
export const FENSTER = [5, 10, 15, 20] as const;
export type Fenster = (typeof FENSTER)[number];

/**
 * Wie weit die Kursdaten reichen.
 *
 * OANDA liefert je Instrument höchstens 5000 Tageskerzen, das sind knapp 20
 * Handelsjahre. Ein 25-Jahres-Fenster liesse sich zwar anbieten, würde aber
 * stillschweigend dieselben ~20 Jahre rechnen und eine Tiefe vortäuschen, die
 * es nicht gibt. Lieber vier ehrliche Fenster als fünf, von denen eines lügt.
 */
export const MAX_JAHRE = 20;

/** Unter so vielen Jahren sagt eine Monatsstatistik nichts. */
export const MIN_JAHRE = 5;

export interface MonatsBild {
  /** 1…12 */
  monat: number;
  /** Wie viele Jahre in diesen Monat eingingen. */
  jahre: number;
  /** Davon ohne jede Bewegung — zaehlen in keine Richtung. */
  flach: number;
  /** Durchschnittliche Monatsrendite in %. Null ohne Daten. */
  schnitt: number | null;
  /** Median der Monatsrenditen in % — robuster gegen einzelne Ausreisser. */
  median: number | null;
  /**
   * Anteil positiver unter den BEWEGTEN Jahren, mit Intervall.
   *
   * Jahre mit exakt null Rendite stehen im Nenner NICHT drin. Sonst zaehlte
   * ein flacher Monat als Verlustmonat, und ein Paar, das sich in einem Monat
   * historisch gar nicht bewegt, bekaeme eine Trefferquote von 0 % und damit
   * ein sauberes „belegt nach unten". Dieselbe Konvention wie beim Break-even
   * im Trade-Journal: kein Ergebnis ist kein Verlust.
   */
  quote: Quote;
  /** Beste und schlechteste beobachtete Rendite in %. */
  bestes: number | null;
  schlechtestes: number | null;
  /**
   * True, wenn das Wilson-Intervall der Trefferquote die 50 % nicht enthält.
   * Nur dann ist der Monat mehr als ein Eindruck.
   */
  belegt: boolean;
  /** +1 / −1 nur bei `belegt`, sonst 0. */
  richtung: -1 | 0 | 1;
}

export interface SaisonBild {
  paar: string;
  fenster: Fenster;
  /** Jahre, die tatsächlich in der Reihe steckten (kann kleiner sein). */
  jahreVorhanden: number;
  von: string | null;
  bis: string | null;
  monate: MonatsBild[];
  /** Wie viele der 12 Monate belegt sind — die Ehrlichkeitszahl der Seite. */
  belegte: number;
}

export interface Kurspunkt {
  /** "YYYY-MM-DD" */
  datum: string;
  schluss: number;
}

const median = (werte: number[]): number | null => {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Monatsrenditen aus Tagesschlüssen.
 *
 * Ein Monat zählt nur, wenn auch der Vormonat einen Schluss hat — sonst würde
 * eine Lücke in der Historie als riesige Rendite auftauchen.
 */
export function monatsRenditen(
  kurse: Kurspunkt[],
): { monat: string; ret: number }[] {
  const letzter = new Map<string, number>();
  for (const k of [...kurse].sort((a, b) => a.datum.localeCompare(b.datum))) {
    if (Number.isFinite(k.schluss) && k.schluss > 0) {
      letzter.set(k.datum.slice(0, 7), k.schluss);
    }
  }
  const monate = [...letzter.keys()].sort();
  const out: { monat: string; ret: number }[] = [];

  for (let i = 1; i < monate.length; i++) {
    // Nur direkt aufeinanderfolgende Kalendermonate: eine Lücke im Kurs-
    // bestand darf nicht als Monatsrendite durchgehen.
    const [j0, m0] = monate[i - 1].split("-").map(Number);
    const [j1, m1] = monate[i].split("-").map(Number);
    if ((j1 - j0) * 12 + (m1 - m0) !== 1) continue;

    const vor = letzter.get(monate[i - 1])!;
    const jetzt = letzter.get(monate[i])!;
    out.push({ monat: monate[i], ret: (jetzt / vor - 1) * 100 });
  }
  return out;
}

/** Das Saisonbild eines Paares über das gewählte Fenster. */
export function saisonBild(
  paar: string, kurse: Kurspunkt[], fenster: Fenster, heute: string,
): SaisonBild {
  const alle = monatsRenditen(kurse);
  // Grenze über das Jahr, nicht über den Tag: sonst wäre das Fenster je nach
  // Aufrufdatum mal 60 und mal 61 Monate gross und die Zahlen wanderten.
  const abJahr = Number(heute.slice(0, 4)) - fenster;
  const drin = alle.filter((m) => Number(m.monat.slice(0, 4)) > abJahr);

  const monate: MonatsBild[] = [];
  let belegte = 0;

  for (let m = 1; m <= 12; m++) {
    const rets = drin.filter((x) => Number(x.monat.slice(5, 7)) === m).map((x) => x.ret);
    const bewegt = rets.filter((r) => r !== 0);
    const quote = wilson(bewegt.filter((r) => r > 0).length, bewegt.length);

    // Belegt heisst: das Intervall enthält die 50 % nicht mehr. Ein Monat mit
    // 7 von 10 positiven Jahren sieht deutlich aus und ist es nicht.
    // Gezaehlt werden nur bewegte Jahre — sonst genuegten flache Monate.
    const belegt = bewegt.length >= MIN_JAHRE
      && quote.unten !== null && quote.oben !== null
      && (quote.unten > 0.5 || quote.oben < 0.5);
    if (belegt) belegte++;

    monate.push({
      monat: m,
      jahre: rets.length,
      flach: rets.length - bewegt.length,
      schnitt: rets.length > 0 ? rets.reduce((s, r) => s + r, 0) / rets.length : null,
      median: median(rets),
      quote,
      bestes: rets.length > 0 ? Math.max(...rets) : null,
      schlechtestes: rets.length > 0 ? Math.min(...rets) : null,
      belegt,
      richtung: belegt ? ((quote.quote! > 0.5 ? 1 : -1) as -1 | 1) : 0,
    });
  }

  const jahre = new Set(drin.map((x) => x.monat.slice(0, 4)));
  return {
    paar, fenster,
    jahreVorhanden: jahre.size,
    von: drin.length > 0 ? drin[0].monat : null,
    bis: drin.length > 0 ? drin[drin.length - 1].monat : null,
    monate, belegte,
  };
}

/**
 * Was die Saisonalität für einen bestimmten Monat sagt — für den Backtest.
 *
 * `stichtag` ist der Handelstag; gefragt wird nach SEINEM Kalendermonat.
 * Wichtig fürs Rückblicken: die Statistik darf nur Jahre VOR dem Stichtag
 * enthalten, sonst weiss der Rückblick, wie der Monat ausgegangen ist, den er
 * gerade beurteilt. Genau dieser Fehler steckt im Labor-Backfill.
 */
export function saisonZum(
  kurse: Kurspunkt[], stichtag: string, fenster: Fenster,
): MonatsBild | null {
  const vorher = kurse.filter((k) => k.datum < stichtag.slice(0, 7) + "-01");
  if (vorher.length === 0) return null;
  const bild = saisonBild("", vorher, fenster, stichtag);
  const monat = Number(stichtag.slice(5, 7));
  return bild.monate.find((m) => m.monat === monat) ?? null;
}

export const MONATS_KURZ = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
] as const;
