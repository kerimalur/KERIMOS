/**
 * Rechnen für den Markt-Tab (11.10.2026) — rein, ohne Datenbank und ohne Netz.
 *
 * Eine „Linie" ist eine Zeile in `trading_watchlist`: ein Level, das Kerim
 * selbst im Chart gefunden hat. Hier steht, was daraus abgeleitet wird:
 * Abstand zum Preis, Zustand, Fundamental-Bias des Paares, Sortierung.
 */

export type Seite = "long" | "short";

export interface LinieRoh {
  id: string;
  pair: string;
  line_level: number | null;
  side: Seite | null;
  alarm_pips: number | null;
}

/** JPY-Paare rechnen mit 0.01 Pip, alles andere mit 0.0001. */
export const pipGroesse = (pair: string) => (pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001);

export function abstandPips(pair: string, preis: number | null, level: number | null): number | null {
  if (preis === null || level === null) return null;
  return Math.abs(preis - level) / pipGroesse(pair);
}

/** Liegt der Preis unter dem Level, ist es eine Linie über dem Preis (Widerstand) — und umgekehrt. */
export function lageZumPreis(preis: number | null, level: number | null): "ueber" | "unter" | null {
  if (preis === null || level === null) return null;
  return level >= preis ? "ueber" : "unter";
}

export type Zustand = "erreicht" | "nah" | "beobachten" | "ohne-preis";

/**
 * erreicht   — Preis höchstens 1 Pip vom Level, oder der Treffer-Alarm hat schon gefeuert
 * nah        — innerhalb der eingestellten Alarm-Distanz (Standard 30 Pips)
 * beobachten — weiter weg
 * ohne-preis — kein Live-Preis oder kein Level
 */
export function zustandVon(abstand: number | null, alarmPips: number | null, trefferGemeldet: boolean): Zustand {
  if (trefferGemeldet) return "erreicht";
  if (abstand === null) return "ohne-preis";
  if (abstand < 1) return "erreicht";
  if (abstand <= (alarmPips ?? 30)) return "nah";
  return "beobachten";
}

export const ZUSTAND_RANG: Record<Zustand, number> = { erreicht: 0, nah: 1, beobachten: 2, "ohne-preis": 3 };

export interface PaarBias {
  /** Seite, die das Urteil bevorzugt; null = kein klarer Abstand. */
  seite: Seite | null;
  klasse: "A" | "B" | null;
  /** z.B. "EUR leicht bullish gegen USD bearish" */
  text: string;
  abstand: number | null;
}

interface UrteilMini { score: number | null; wort: string }

/** Aus den Urteilen beider Währungen die Tendenz für das Paar (Basis = erste drei Buchstaben). */
export function biasFuerPaar(
  pair: string, urteile: Record<string, UrteilMini | undefined>, mindestAbstand = 0.4, neutralBis = 0.12,
): PaarBias {
  const p = pair.toUpperCase().replace(/[^A-Z]/g, "");
  const basis = p.slice(0, 3), quote = p.slice(3, 6);
  const b = urteile[basis], q = urteile[quote];
  if (!b || !q || b.score === null || q.score === null) {
    return { seite: null, klasse: null, text: "Urteil fehlt für " + (!b || b.score === null ? basis : quote), abstand: null };
  }
  const diff = b.score - q.score;
  const text = `${basis} ${b.wort} gegen ${quote} ${q.wort}`;
  if (Math.abs(diff) < mindestAbstand) return { seite: null, klasse: null, text, abstand: Math.round(diff * 100) / 100 };
  const seite: Seite = diff > 0 ? "long" : "short";
  const stark = diff > 0 ? b : q, schwach = diff > 0 ? q : b;
  const klasse = (stark.score ?? 0) >= neutralBis && (schwach.score ?? 0) <= -neutralBis ? "A" : "B";
  return { seite, klasse, text, abstand: Math.round(diff * 100) / 100 };
}

/** Passt die Seite einer Linie zum Urteil? null, wenn eines von beidem fehlt. */
export function mitUrteil(seite: Seite | null, bias: PaarBias): boolean | null {
  if (!seite || !bias.seite) return null;
  return seite === bias.seite;
}

export interface Pruefung { abgeholt: boolean | null; bos: boolean | null; confluence: boolean | null }

export const pruefungOffen = (p: Pruefung) =>
  [p.abgeholt, p.bos, p.confluence].filter((x) => x === null).length;

export const pruefungErfuellt = (p: Pruefung) =>
  [p.abgeholt, p.bos, p.confluence].filter((x) => x === true).length;

/** Montag der Woche (UTC-Datum) — gleiche Regel wie bei der Wochenaussicht. */
export function wochenStart(jetzt: Date): string {
  const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function monatsStart(jetzt: Date): string {
  return new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/** Preis hübsch: JPY 3 Stellen, sonst 5. */
export function fmtPreis(pair: string, p: number | null): string {
  if (p === null) return "—";
  return p.toFixed(pair.toUpperCase().includes("JPY") ? 3 : 5);
}
