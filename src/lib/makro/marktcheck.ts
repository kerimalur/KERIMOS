/**
 * Markt-Check (02.10.2026): Hat der Markt nach einer Zahl so reagiert, wie
 * die Einordnung erwartet? Reine Logik, ohne Netz — der Loader
 * (marktcheck-laden.ts) holt die Kerzen, der Selbsttest
 * (tools/checks/einordnung.mts) rechnet mit denselben Funktionen.
 *
 * Merksatz 1 eingebaut: Eine Währung bewegt sich nicht in EINEM Paar, sie
 * bewegt sich gegen alle. Deshalb zählt die Bewegung der Währung gegen alle
 * 7 anderen Majors — bestätigt ist erst, wenn die Mehrheit mitzieht.
 */

/** Die 28 Paare wie in OANDA (konstanten/instruments.ts). */
export const FX_PAARE = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "USD_CHF", "NZD_USD",
  "EUR_JPY", "GBP_JPY", "EUR_GBP", "AUD_JPY", "CAD_JPY", "CHF_JPY", "EUR_AUD",
  "EUR_CAD", "EUR_CHF", "EUR_NZD", "GBP_AUD", "GBP_CAD", "GBP_CHF", "GBP_NZD",
  "AUD_CAD", "AUD_CHF", "AUD_NZD", "CAD_CHF", "NZD_CAD", "NZD_CHF", "NZD_JPY",
] as const;

export const FENSTER = [
  { key: "15m", minuten: 15 },
  { key: "1h", minuten: 60 },
  { key: "4h", minuten: 240 },
] as const;
export type FensterKey = (typeof FENSTER)[number]["key"];

/** Startwerte: ab welchem Anteil der Paare und welcher Durchschnittsbewegung (in %) ein Urteil fällt. */
export const ANTEIL_BESTAETIGT = 0.7;
export const MIN_BEWEGUNG_PROZENT = 0.05;

export interface IntraKerze { zeit: string; open: number; close: number }

/** Alle Paare einer Währung, mit der Angabe, ob sie vorne steht. */
export function paareFuer(ccy: string): { instrument: string; vorne: boolean }[] {
  return FX_PAARE
    .filter((p) => p.startsWith(`${ccy}_`) || p.endsWith(`_${ccy}`))
    .map((p) => ({ instrument: p, vorne: p.startsWith(`${ccy}_`) }));
}

/**
 * Prozentuale Kursänderung eines Paares von der Zahl bis `minuten` danach.
 * Start = Eröffnung der ersten Kerze ab der Zahl, Ende = Schluss der letzten
 * Kerze, die spätestens am Fensterende beginnt. M15-Kerzen vorausgesetzt.
 */
export function reaktion(kerzen: IntraKerze[], eventMs: number, minuten: number, kerzeMin = 15): number | null {
  const sortiert = [...kerzen].sort((a, b) => a.zeit.localeCompare(b.zeit));
  const start = sortiert.find((k) => Date.parse(k.zeit) >= eventMs - 60_000);
  if (!start) return null;
  const endeMs = eventMs + minuten * 60_000;
  const imFenster = sortiert.filter((k) => {
    const t = Date.parse(k.zeit);
    return t >= Date.parse(start.zeit) && t + kerzeMin * 60_000 <= endeMs + 60_000;
  });
  const ende = imFenster[imFenster.length - 1];
  if (!ende || start.open === 0) return null;
  return Math.round(((ende.close - start.open) / start.open) * 100 * 1000) / 1000;
}

export type CheckUrteil = "bestätigt" | "widerspricht" | "unklar" | "keine Erwartung" | "keine Daten";

export interface FensterErgebnis {
  key: FensterKey;
  /** Durchschnittliche Bewegung der Währung gegen alle Paare, in % (+ = Währung stärker). */
  mittel: number | null;
  /** Wie viele Paare in die erwartete Richtung liefen. */
  mitRichtung: number;
  paare: number;
}

export interface MarktCheck {
  fenster: FensterErgebnis[];
  /** Das Urteil nach 1 Stunde. */
  urteil: CheckUrteil;
}

/**
 * Bewegung der Währung je Fenster und Urteil nach 1 h.
 * `erwartet`: +1 Währung sollte steigen, −1 fallen, 0/null keine Erwartung.
 */
export function marktCheck(
  ccy: string, eventIso: string, kerzenJePaar: Record<string, IntraKerze[]>, erwartet: 1 | -1 | 0 | null,
): MarktCheck {
  const t = Date.parse(eventIso);
  const fenster: FensterErgebnis[] = FENSTER.map((f) => {
    const werte: number[] = [];
    for (const p of paareFuer(ccy)) {
      const r = reaktion(kerzenJePaar[p.instrument] ?? [], t, f.minuten);
      if (r !== null) werte.push(p.vorne ? r : -r);
    }
    const mittel = werte.length ? Math.round((werte.reduce((s, x) => s + x, 0) / werte.length) * 1000) / 1000 : null;
    const mitRichtung = erwartet === 1 || erwartet === -1 ? werte.filter((w) => Math.sign(w) === erwartet).length : 0;
    return { key: f.key, mittel, mitRichtung, paare: werte.length };
  });

  const h1 = fenster.find((f) => f.key === "1h")!;
  let urteil: CheckUrteil;
  if (h1.paare === 0 || h1.mittel === null) urteil = "keine Daten";
  else if (erwartet !== 1 && erwartet !== -1) urteil = "keine Erwartung";
  else {
    const anteil = h1.mitRichtung / h1.paare;
    const genug = Math.abs(h1.mittel) >= MIN_BEWEGUNG_PROZENT;
    if (anteil >= ANTEIL_BESTAETIGT && genug && Math.sign(h1.mittel) === erwartet) urteil = "bestätigt";
    else if (anteil <= 1 - ANTEIL_BESTAETIGT && genug && Math.sign(h1.mittel) === -erwartet) urteil = "widerspricht";
    else urteil = "unklar";
  }
  return { fenster, urteil };
}
