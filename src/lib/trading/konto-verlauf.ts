/**
 * Der Kontostand als Kette statt als Feld (26.09.2026).
 *
 * Vorher hing jede Zahl an dem, was gerade in der Zeile stand: `account_balance`
 * von Hand, `risk_amount` von der Brücke, `r_multiple` irgendwann einmal
 * gerechnet. Änderte Kerim den Gewinn eines alten Trades, blieb alles danach
 * stehen — der Kontostand von heute wusste nichts davon.
 *
 * Jetzt wird die Kontobewegung einmal chronologisch durchgerechnet:
 *
 *     Startkapital
 *       + Einzahlung / − Auszahlung   (in Datumsreihenfolge)
 *       + Gewinn / − Verlust je Trade
 *       = Kontostand nach diesem Ereignis
 *
 * Daraus folgt alles Weitere:
 *   - **Kontostand vor dem Trade** ist nicht mehr eingetippt, sondern bekannt.
 *   - **Risiko in %** wird zu einem Betrag (Kontostand × Prozent).
 *   - **Gewinn in %** ebenso.
 *   - **R = Gewinn ÷ Risiko** fällt hinten heraus und ändert sich automatisch
 *     mit, wenn früher etwas korrigiert wird.
 *
 * Bewusst ohne Datenbank und ohne `server-only`: prüfbar mit
 * `tools/checks/konto-verlauf.mts`, nutzbar auch im Browser-Dialog.
 */

export type KontoTyp = "ek" | "funded";
export type Ergebnis = "win" | "loss" | "breakeven";

/** Was die Kette von einem Trade braucht. */
export interface VerlaufTrade {
  id: string;
  type: KontoTyp;
  sessionType: "live" | "backtest";
  /** "YYYY-MM-DD" */
  date: string;
  createdAt: string;
  /** "open" heisst: noch kein Geld bewegt. */
  status: string;
  result: Ergebnis | null;
  /** Gewinn in Kontowährung, wenn direkt erfasst. */
  profitAmount: number | null;
  /** Gewinn in Prozent des Kontostands vor dem Trade. */
  profitPercent: number | null;
  riskAmount: number | null;
  /** Risiko in Prozent des Kontostands vor dem Trade. */
  riskPercent: number | null;
  /** Der gespeicherte Wert — Rückfall, wenn sich R nicht rechnen lässt. */
  rMultiple: number;
}

export interface VerlaufBuchung {
  id: string;
  accountId: string | null;
  type: KontoTyp;
  buchungsTyp: "deposit" | "withdrawal" | "payout";
  amount: number;
  date: string;
}

export interface VerlaufKonto {
  id: string;
  type: KontoTyp;
  name: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
}

/** Was für einen einzelnen Trade aus der Kette folgt. */
export interface TradeRechnung {
  /** Kontostand unmittelbar vor diesem Trade. */
  standVor: number;
  standNach: number;
  /** Gewinn in Kontowährung. Null = nicht erfasst. */
  gewinn: number | null;
  /** Gewinn in Prozent des Kontostands vor dem Trade. */
  gewinnProzent: number | null;
  /** Risiko in Kontowährung. Null = nicht erfasst. */
  risiko: number | null;
  risikoProzent: number | null;
  /** Vorzeichenbehaftetes R. */
  r: number;
  /** Woher das R kommt — für die Anzeige „gerechnet" vs. „eingetragen". */
  rQuelle: "gerechnet" | "gespeichert";
}

export interface KontoVerlauf {
  type: KontoTyp;
  konto: VerlaufKonto | null;
  currency: string;
  start: number;
  einzahlungen: number;
  auszahlungen: number;
  handelsGewinn: number;
  /** Start + Ein − Aus + Handel. */
  stand: number;
  /** Stand am Ende des Vormonats — Basis für „diesen Monat". */
  standMonatsanfang: number;
  veraenderungMonat: number;
  /** Höchster je erreichter Stand und der Abstand dazu (für FTMO-Regeln). */
  hoechststand: number;
  drawdown: number;
  /** Abweichung des in der Datenbank hinterlegten Werts. */
  abweichung: number;
  trades: number;
  offene: number;
}

export interface Verlauf {
  proTrade: Map<string, TradeRechnung>;
  proTyp: Map<KontoTyp, KontoVerlauf>;
}

export const KONTO_TYPEN: KontoTyp[] = ["ek", "funded"];

const rund = (n: number, stellen = 2) => {
  const f = 10 ** stellen;
  return Math.round(n * f) / f;
};

/** Trade zählt fürs Konto: live, abgeschlossen. */
function zaehlt(t: VerlaufTrade): boolean {
  return t.sessionType === "live" && t.status !== "open";
}

/**
 * R aus Gewinn und Risiko. Ohne beides gilt der gespeicherte Wert mit dem
 * Vorzeichen des Ergebnisses — so bleibt ein alter Trade ohne Beträge lesbar,
 * statt als 0 R in jeder Statistik zu hängen.
 */
export function rechneR(
  gewinn: number | null, risiko: number | null,
  result: Ergebnis | null, gespeichert: number,
): { r: number; quelle: TradeRechnung["rQuelle"] } {
  if (result === "breakeven") return { r: 0, quelle: "gerechnet" };
  if (risiko !== null && risiko > 0 && gewinn !== null) {
    return { r: rund(gewinn / risiko), quelle: "gerechnet" };
  }
  const roh = Math.abs(gespeichert);
  if (result === "loss") return { r: -(roh || 1), quelle: "gespeichert" };
  return { r: roh, quelle: "gespeichert" };
}

/** Prozent eines Betrags, sauber gerundet. Null, wenn nicht rechenbar. */
function ausProzent(stand: number, prozent: number | null): number | null {
  if (prozent === null || !Number.isFinite(prozent)) return null;
  if (!(stand > 0)) return null;
  return rund((stand * prozent) / 100);
}

/** Datum + Anlagezeit: die Reihenfolge, in der das Geld geflossen ist. */
function chronologisch<T extends { date: string; createdAt?: string }>(liste: T[]): T[] {
  return [...liste].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/**
 * Die ganze Kette, je Kontotyp.
 *
 * `monatsStart` ist der erste Tag des laufenden Monats ("YYYY-MM-01"); alles
 * davor zählt in den Stand am Monatsanfang.
 */
export function baueVerlauf(
  konten: VerlaufKonto[],
  buchungen: VerlaufBuchung[],
  trades: VerlaufTrade[],
  monatsStart: string,
): Verlauf {
  const proTrade = new Map<string, TradeRechnung>();
  const proTyp = new Map<KontoTyp, KontoVerlauf>();

  for (const typ of KONTO_TYPEN) {
    const konto = konten.find((k) => k.type === typ) ?? null;
    const eigeneBuchungen = buchungen.filter((b) =>
      b.type === typ || (konto !== null && b.accountId === konto.id));
    const eigeneTrades = trades.filter((t) => t.type === typ);
    const gezaehlt = eigeneTrades.filter(zaehlt);

    let stand = konto?.initialBalance ?? 0;
    let einzahlungen = 0, auszahlungen = 0, handelsGewinn = 0;
    let hoechststand = stand, drawdown = 0;
    let standMonatsanfang = stand;

    type Ereignis =
      | { art: "buchung"; date: string; createdAt: string; b: VerlaufBuchung }
      | { art: "trade"; date: string; createdAt: string; t: VerlaufTrade };

    const ereignisse: Ereignis[] = chronologisch([
      ...eigeneBuchungen.map((b) => (
        { art: "buchung", date: b.date, createdAt: "", b } as Ereignis)),
      ...gezaehlt.map((t) => (
        { art: "trade", date: t.date, createdAt: t.createdAt, t } as Ereignis)),
    ]);

    for (const e of ereignisse) {
      if (e.art === "buchung") {
        const betrag = Math.abs(e.b.amount);
        if (e.b.buchungsTyp === "deposit") { einzahlungen += betrag; stand += betrag; }
        else { auszahlungen += betrag; stand -= betrag; }
      } else {
        const t = e.t;
        const standVor = stand;
        const gewinn = t.profitAmount ?? ausProzent(standVor, t.profitPercent);
        const risiko = t.riskAmount ?? ausProzent(standVor, t.riskPercent);
        const { r, quelle } = rechneR(gewinn, risiko, t.result, t.rMultiple);

        stand = rund(standVor + (gewinn ?? 0));
        handelsGewinn = rund(handelsGewinn + (gewinn ?? 0));

        proTrade.set(t.id, {
          standVor, standNach: stand, gewinn, risiko,
          gewinnProzent: gewinn !== null && standVor > 0
            ? rund((gewinn / standVor) * 100) : t.profitPercent,
          risikoProzent: risiko !== null && standVor > 0
            ? rund((risiko / standVor) * 100) : t.riskPercent,
          r, rQuelle: quelle,
        });
      }

      // NACH dem Verbuchen: alles, was vor dem Monatsanfang lag, gehört zum
      // Stand, mit dem der Monat begonnen hat. Vorher gesetzt hätte es den
      // letzten Trade des Vormonats in den laufenden Monat gezogen.
      if (e.date < monatsStart) standMonatsanfang = rund(stand);

      if (stand > hoechststand) hoechststand = stand;
      if (hoechststand - stand > drawdown) drawdown = rund(hoechststand - stand);
    }

    // Offene Trades: noch kein Geld bewegt, aber sie tragen Risiko. Für sie
    // gilt der aktuelle Stand als Basis, damit der Dialog etwas anzeigen kann.
    for (const t of eigeneTrades.filter((x) => !zaehlt(x))) {
      const risiko = t.riskAmount ?? ausProzent(stand, t.riskPercent);
      const gewinn = t.profitAmount ?? ausProzent(stand, t.profitPercent);
      const { r, quelle } = rechneR(gewinn, risiko, t.result, t.rMultiple);
      proTrade.set(t.id, {
        standVor: stand, standNach: rund(stand + (gewinn ?? 0)),
        gewinn, risiko,
        gewinnProzent: gewinn !== null && stand > 0 ? rund((gewinn / stand) * 100) : t.profitPercent,
        risikoProzent: risiko !== null && stand > 0 ? rund((risiko / stand) * 100) : t.riskPercent,
        r, rQuelle: quelle,
      });
    }

    proTyp.set(typ, {
      type: typ, konto,
      currency: konto?.currency ?? "CHF",
      start: konto?.initialBalance ?? 0,
      einzahlungen, auszahlungen, handelsGewinn,
      stand: rund(stand),
      standMonatsanfang: rund(standMonatsanfang),
      veraenderungMonat: rund(stand - standMonatsanfang),
      hoechststand: rund(hoechststand),
      drawdown,
      abweichung: rund((konto?.currentBalance ?? 0) - stand),
      trades: gezaehlt.length,
      offene: eigeneTrades.length - gezaehlt.length,
    });
  }

  return { proTrade, proTyp };
}

/** Erster Tag des Monats eines ISO-Datums. */
export function monatsStartVon(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
