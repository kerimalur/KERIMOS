import type { Beobachtung } from "./perioden";

/**
 * PMI aus dem Wirtschaftskalender (Forex Factory) — rein, ohne Datenbank.
 *
 * Kerims Frage vom 26.09.2026: gibt es keinen Weg, die PMI zu holen? Trading
 * Economics hat eine API, aber nur gegen Bezahlung, und die Seite
 * auszulesen verbieten ihre Bedingungen. Forex Factory hat dieselben Zahlen
 * (S&P Global / HCOB / ISM) und liegt schon im System: der Screener
 * schreibt den Kalender täglich in `calendar_events` der Trading-DB.
 *
 * Der Kniff: Forex Factory liefert kein „actual", wohl aber „previous". Und
 * das „previous" eines Termins IST der zuletzt veröffentlichte Wert:
 *
 *   Flash PMI, veröffentlicht im September → previous = Final August
 *   Final PMI, veröffentlicht Anfang Oktober → previous = Flash September
 *
 * In beiden Fällen gehört der Wert zum Monat VOR dem Termin. Über alle
 * gesammelten Termine ergibt das eine Monatsreihe; pro Monat gewinnt der
 * spätere Termin (Final vor Flash).
 */

export interface KalenderTermin {
  title: string;
  currency: string | null;
  event_time: string;
  previous: string | null;
}

type Muster = { name: string; re: RegExp }[];

const INDUSTRIE: Muster = [{ name: "Manufacturing PMI", re: /^(Flash |Final )?Manufacturing PMI$/i }];
const DIENSTE: Muster = [{ name: "Services PMI", re: /^(Flash |Final )?Services PMI$/i }];

/**
 * Je Währung die Muster, in Reihenfolge des Vorzugs. Das erste Muster, das
 * Werte liefert, gewinnt — gemischt wird nie, sonst stünde der ISM neben
 * dem S&P-PMI in derselben Reihe.
 */
export const PMI_MUSTER: Record<string, { pmi_industrie: Muster; pmi_dienste: Muster }> = {
  USD: {
    pmi_industrie: [{ name: "ISM Manufacturing PMI", re: /^ISM Manufacturing PMI$/i }, ...INDUSTRIE],
    pmi_dienste: [{ name: "ISM Services PMI", re: /^ISM Services PMI$/i }, ...DIENSTE],
  },
  EUR: { pmi_industrie: INDUSTRIE, pmi_dienste: DIENSTE },
  GBP: { pmi_industrie: INDUSTRIE, pmi_dienste: DIENSTE },
  JPY: { pmi_industrie: INDUSTRIE, pmi_dienste: DIENSTE },
  AUD: { pmi_industrie: INDUSTRIE, pmi_dienste: DIENSTE },
  NZD: {
    pmi_industrie: [{ name: "Business NZ Manufacturing Index", re: /^Business NZ Manufacturing Index$/i }],
    pmi_dienste: [{ name: "Business NZ Services Index", re: /^Business NZ Services Index$/i }],
  },
  CAD: { pmi_industrie: INDUSTRIE, pmi_dienste: DIENSTE },
  CHF: {
    pmi_industrie: [{ name: "procure.ch Manufacturing PMI", re: /^(procure\.ch )?Manufacturing PMI$/i }],
    pmi_dienste: [{ name: "procure.ch Services PMI", re: /^(procure\.ch )?Services PMI$/i }],
  },
};

/** "52.8" → 52.8 · "" / "-" → null */
export function zahlAus(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
}

/** Monat vor dem Termin als Periodenbeginn: 2026-09-23 → 2026-08-01. */
export function vormonat(eventTime: string): string {
  const d = new Date(eventTime);
  // In Zürcher Zeit rechnen reicht auf Monatsebene: die Termine liegen nie
  // an einem Monatswechsel um Mitternacht.
  const j = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-basiert = Vormonat 1-basiert
  return m === 0 ? `${j - 1}-12-01` : `${j}-${String(m).padStart(2, "0")}-01`;
}

export interface PmiReihe {
  ccy: string;
  feld: "pmi_industrie" | "pmi_dienste";
  serie: string;
  werte: Beobachtung[];
}

export function pmiAusKalender(termine: KalenderTermin[]): PmiReihe[] {
  const out: PmiReihe[] = [];
  for (const [ccy, felder] of Object.entries(PMI_MUSTER)) {
    for (const feld of ["pmi_industrie", "pmi_dienste"] as const) {
      for (const m of felder[feld]) {
        const passend = termine
          .filter((t) => (t.currency ?? "").toUpperCase() === ccy && m.re.test(t.title.trim()))
          .filter((t) => zahlAus(t.previous) !== null)
          .sort((a, b) => a.event_time.localeCompare(b.event_time));
        if (passend.length === 0) continue;

        // Pro Monat der spätere Termin — der spätere hat die revidierte Zahl.
        const jeMonat = new Map<string, number>();
        for (const t of passend) jeMonat.set(vormonat(t.event_time), zahlAus(t.previous)!);
        const werte = [...jeMonat.entries()]
          .map(([datum, wert]) => ({ datum, wert }))
          .sort((a, b) => a.datum.localeCompare(b.datum))
          .slice(-26);

        out.push({ ccy, feld, serie: `Forex Factory · ${m.name} · ${ccy}`, werte });
        break;
      }
    }
  }
  return out;
}
