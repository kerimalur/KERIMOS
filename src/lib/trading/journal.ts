import "server-only";
import { unstable_cache } from "next/cache";
import { createTradingClient } from "@/lib/supabase/trading";

/**
 * Journal-Datenschicht — der Teil des GVA-Screeners, der nach KerimOS umgezogen
 * ist (siehe TRADING-UMBAU.md, Etappe 3).
 *
 * **Der wichtigste Unterschied zum Screener:** Dort lief alles im Browser mit
 * der angemeldeten Supabase-Session; Row Level Security sorgte dafür, dass man
 * nur die eigenen Zeilen sah. KerimOS spricht die Trading-Datenbank
 * serverseitig mit dem Service-Key an — der hängt an keinem Benutzer und
 * umgeht RLS. Deshalb muss jede Abfrage und jeder Schreibvorgang die
 * Benutzer-ID selbst mitführen. Vergisst man das einmal, entstehen
 * besitzerlose Zeilen, die im Screener unsichtbar wären.
 *
 * Die ID kommt aus `TRADING_USER_ID`. Fehlt sie, ermittelt `tradingUserId()`
 * sie selbst — aber **nur, wenn es genau einen Benutzer gibt**. Bei mehreren
 * wird abgebrochen statt geraten.
 *
 * Diese Regel ist bewusst dieselbe wie im Screener-Backend
 * (`Backend/supabase_signals.py::_resolve_user_id`, `SIGNALS_USER_ID`). Dort
 * wurde früher einfach der erste Nutzer der Admin-API genommen; die
 * Reihenfolge ist aber nicht garantiert, und Signale landeten unter einem
 * fremden Konto — geschrieben wurde korrekt, sichtbar war nichts, weil das
 * Frontend hart auf die eigene user_id filtert. Ein stiller Datenverlust, der
 * erst auffällt, wenn man ihn sucht.
 *
 * Dasselbe gilt hier: Ein falsch geratener Besitzer schreibt Trades, die
 * niemand mehr sieht. Lieber eine Seite, die sagt „setz die Variable", als
 * ein Journal, das ins Leere schreibt.
 */

// ---------------------------------------------------------------------------
// Benutzer
// ---------------------------------------------------------------------------

/**
 * Warum kein Benutzer feststeht — für die Meldung auf den Journal-Seiten.
 * `mehrdeutig` ist der wichtige Fall: Die Datenbank antwortet, es gibt nur
 * keine eindeutige Antwort auf die Frage „wem gehört das hier".
 */
export type UserBefund = "gesetzt" | "eindeutig" | "mehrdeutig" | "keiner" | "keine-db";

const userCached = unstable_cache(
  async (): Promise<{ id: string | null; befund: UserBefund }> => {
    const gesetzt = process.env.TRADING_USER_ID?.trim();
    if (gesetzt) return { id: gesetzt, befund: "gesetzt" };

    const supabase = createTradingClient();
    if (!supabase) return { id: null, befund: "keine-db" };

    // perPage 2 statt 1 — nur so lässt sich „genau einer" von „mehrere"
    // unterscheiden. Exakt dieselbe Mechanik wie im Backend.
    try {
      const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 2 });
      if (!error) {
        if (data.users.length > 1) return { id: null, befund: "mehrdeutig" };
        if (data.users.length === 1) return { id: data.users[0].id, befund: "eindeutig" };
        return { id: null, befund: "keiner" };
      }
    } catch {
      // Admin-API nicht erreichbar → unten über die Tabellen weiter.
    }

    // Rückfallebene, falls der Schlüssel keine Admin-Rechte hat: Besitzer aus
    // den Daten ableiten — mit derselben Regel. Mehr als eine ID heisst
    // abbrechen, nicht die erste nehmen.
    const gefunden = new Set<string>();
    for (const tabelle of ["trades", "accounts", "outlooks"]) {
      const { data } = await supabase
        .from(tabelle)
        .select("user_id")
        .not("user_id", "is", null)
        .limit(500);
      for (const zeile of (data ?? []) as { user_id?: string }[]) {
        if (zeile.user_id) gefunden.add(zeile.user_id);
      }
      if (gefunden.size > 1) return { id: null, befund: "mehrdeutig" };
    }

    if (gefunden.size === 1) return { id: [...gefunden][0], befund: "eindeutig" };
    return { id: null, befund: "keiner" };
  },
  ["trading-user-v2"],
  { revalidate: 3600, tags: ["trading-user"] },
);

export async function tradingUserId(): Promise<string | null> {
  return (await userCached()).id;
}

/** Wie die ID zustande kam — damit die Meldung sagen kann, was zu tun ist. */
export async function tradingUserBefund(): Promise<UserBefund> {
  return (await userCached()).befund;
}

/** Client + Benutzer-ID zusammen — spart in jedem Loader vier Zeilen. */
async function zugang() {
  const supabase = createTradingClient();
  if (!supabase) return null;
  const userId = await tradingUserId();
  if (!userId) return null;
  return { supabase, userId };
}

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type KontoTyp = "ek" | "funded";
export type Richtung = "long" | "short";
export type Ergebnis = "win" | "loss" | "breakeven";
export type SessionTyp = "live" | "backtest";

export interface Trade {
  id: string;
  type: KontoTyp;
  pair: string;
  direction: Richtung;
  /** "YYYY-MM-DD" */
  date: string;
  result: Ergebnis | null;
  rMultiple: number;
  riskPercent: number | null;
  profitAmount: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize: number | null;
  sessionType: SessionTyp;
  /**
   * "open" oder "closed". Die MT5-Bruecke legt einen Trade beim Eroeffnen als
   * `open` an und schliesst ihn erst, wenn BEIDE Positionen des Setups zu
   * sind. Ohne dieses Feld sah ein laufender Trade im Journal aus wie ein
   * abgeschlossener mit 0 R — und verwaesserte jede Kennzahl.
   */
  status: string;
  session: string;
  notes: string;
  comment: string;
  strategyId: string | null;
  outlookId: string | null;
  setups: {
    dailyBos: boolean;
    valueArea: boolean;
    marketStructure: boolean;
    weeklyGva: boolean;
    dreiTagesGva: boolean;
  };
  confluences: string[];
  /** Plan-Befolgung 0–100. Null = nicht bewertet. */
  adherenceScore: number | null;
  createdAt: string;
}

export interface Outlook {
  id: string;
  symbol: string;
  direction: Richtung;
  thesis: string;
  confidence: number;
  status: string;
  targetEntry: number | null;
  targetSl: number | null;
  targetTp: number | null;
  confluences: string[];
  isStarred: boolean;
  source: string;
  signalId: string | null;
  executedTradeId: string | null;
  createdAt: string;
}

export interface Strategie {
  id: string;
  name: string;
  description: string;
  direction: string;
  pairs: string[];
  sessions: string[];
  rules: unknown[];
  isActive: boolean;
  notes: string;
  createdAt: string;
}

export interface Konto {
  id: string;
  name: string;
  type: KontoTyp;
  broker: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  defaultRiskPerTrade: number;
  isActive: boolean;
  isDefault: boolean;
}

export type BuchungsTyp = "deposit" | "withdrawal" | "payout";

export interface KontoBuchung {
  id: string;
  accountId: string | null;
  type: KontoTyp;
  buchungsTyp: BuchungsTyp;
  amount: number;
  /** "YYYY-MM-DD" */
  date: string;
  note: string;
}

export interface Signal {
  id: string;
  pair: string;
  lineType: Richtung;
  lineLevel: number;
  status: string;
  hitAt: string;
}

// ---------------------------------------------------------------------------
// Abbildung DB → App
//
// Die Spalten heissen in der Datenbank anders als im Code (symbol/side statt
// pair/direction). Das ist Erbe aus dem alten Trading-Journal. Umbenennen
// hiesse, eine laufende Datenbank anzufassen, ohne dass sich dadurch etwas
// verbessert — also wird hier übersetzt und sonst nirgends.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const zahl = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

function zuTrade(r: Row): Trade {
  return {
    id: String(r.id),
    type: (r.type as KontoTyp) ?? "ek",
    pair: String(r.symbol ?? ""),
    direction: (r.side as Richtung) ?? "long",
    date: String(r.date ?? "").slice(0, 10),
    result: (r.result as Ergebnis) ?? null,
    rMultiple: Number(r.r_multiple ?? 0),
    riskPercent: zahl(r.risk_percent),
    profitAmount: zahl(r.profit_amount),
    entryPrice: zahl(r.entry_price),
    exitPrice: zahl(r.exit_price),
    stopLoss: zahl(r.stop_loss),
    takeProfit: zahl(r.take_profit),
    lotSize: zahl(r.lot_size),
    sessionType: (r.session_type as SessionTyp) ?? "live",
    status: String(r.status ?? "closed"),
    session: String(r.session ?? ""),
    notes: String(r.notes ?? ""),
    comment: String(r.comment ?? ""),
    strategyId: (r.strategy_id as string) ?? null,
    outlookId: (r.outlook_id as string) ?? null,
    setups: {
      dailyBos: Boolean(r.setup_daily_bos),
      valueArea: Boolean(r.setup_value_area),
      marketStructure: Boolean(r.setup_market_structure),
      weeklyGva: Boolean(r.setup_weekly_gva),
      dreiTagesGva: Boolean(r.setup_3day_gva),
    },
    confluences: Array.isArray(r.confluences) ? (r.confluences as string[]) : [],
    // Die Spalte wurde nachträglich ergänzt und fehlt in manchen Kopien der
    // Datenbank. `undefined` (Spalte nicht da) und `null` (nicht bewertet)
    // laufen deshalb bewusst auf denselben Wert hinaus.
    adherenceScore: zahl(r.adherence_score),
    createdAt: String(r.created_at ?? ""),
  };
}

function zuOutlook(r: Row): Outlook {
  return {
    id: String(r.id),
    symbol: String(r.symbol ?? ""),
    direction: (r.direction as Richtung) ?? "long",
    thesis: String(r.thesis ?? ""),
    confidence: Number(r.confidence ?? 3),
    status: String(r.status ?? "observation"),
    targetEntry: zahl(r.target_entry),
    targetSl: zahl(r.target_sl),
    targetTp: zahl(r.target_tp),
    confluences: Array.isArray(r.confluences) ? (r.confluences as string[]) : [],
    isStarred: Boolean(r.is_starred),
    source: String(r.source ?? "manual"),
    signalId: (r.signal_id as string) ?? null,
    executedTradeId: (r.executed_trade_id as string) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

const TRADE_SPALTEN =
  "id, type, symbol, side, date, result, r_multiple, risk_percent, profit_amount, " +
  "entry_price, exit_price, stop_loss, take_profit, lot_size, session_type, status, session, " +
  "notes, comment, strategy_id, outlook_id, setup_daily_bos, setup_value_area, " +
  "setup_market_structure, setup_weekly_gva, setup_3day_gva, confluences, created_at";

export interface TradeFilter {
  sessionType?: SessionTyp;
  pair?: string;
  result?: Ergebnis;
  /** "YYYY-MM-DD", inklusiv. */
  von?: string;
  /** "YYYY-MM-DD", inklusiv. */
  bis?: string;
}

export async function fetchTrades(filter: TradeFilter = {}): Promise<Trade[]> {
  const z = await zugang();
  if (!z) return [];

  let q = z.supabase
    .from("trades")
    .select(TRADE_SPALTEN)
    .eq("user_id", z.userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filter.sessionType) q = q.eq("session_type", filter.sessionType);
  if (filter.pair) q = q.eq("symbol", filter.pair);
  if (filter.result) q = q.eq("result", filter.result);
  if (filter.von) q = q.gte("date", filter.von);
  if (filter.bis) q = q.lte("date", filter.bis);

  const { data } = await q;
  return ((data ?? []) as unknown as Row[]).map(zuTrade);
}

export async function fetchOutlooks(): Promise<Outlook[]> {
  const z = await zugang();
  if (!z) return [];
  const { data } = await z.supabase
    .from("outlooks")
    .select("*")
    .eq("user_id", z.userId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Row[]).map(zuOutlook);
}

export async function fetchStrategien(): Promise<Strategie[]> {
  const z = await zugang();
  if (!z) return [];
  const { data } = await z.supabase
    .from("strategies")
    .select("id, name, description, direction, pairs, sessions, rules, is_active, notes, created_at")
    .eq("user_id", z.userId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    direction: String(r.direction ?? "both"),
    pairs: Array.isArray(r.pairs) ? (r.pairs as string[]) : [],
    sessions: Array.isArray(r.sessions) ? (r.sessions as string[]) : [],
    rules: Array.isArray(r.rules) ? (r.rules as unknown[]) : [],
    isActive: r.is_active !== false,
    notes: String(r.notes ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));
}

export async function fetchKonten(): Promise<Konto[]> {
  const z = await zugang();
  if (!z) return [];
  const { data } = await z.supabase
    .from("accounts")
    .select("id, name, type, broker, currency, initial_balance, current_balance, " +
            "default_risk_per_trade, is_active, is_default")
    .eq("user_id", z.userId)
    .order("is_default", { ascending: false })
    .order("name");

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    type: (r.type as KontoTyp) ?? "ek",
    broker: String(r.broker ?? ""),
    currency: String(r.currency ?? "USD"),
    initialBalance: Number(r.initial_balance ?? 0),
    currentBalance: Number(r.current_balance ?? 0),
    defaultRiskPerTrade: Number(r.default_risk_per_trade ?? 1),
    isActive: r.is_active !== false,
    isDefault: Boolean(r.is_default),
  }));
}

/**
 * GVA-Hits aus dem Screener. `status` filtert die Inbox: "new" = noch nicht
 * angefasst, "watchlist" = beobachtet, "journaled" = daraus wurde ein Trade,
 * "dismissed" = verworfen. Ohne Filter kommt alles.
 */
export async function fetchSignale(status?: string[]): Promise<Signal[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  // Signale schreibt das Backend teils ohne user_id (der Screener läuft als
  // Dienst). Deshalb hier bewusst KEIN user_id-Filter — es ist ohnehin nur
  // ein Benutzer in dieser Datenbank.
  let q = supabase
    .from("signals")
    .select("id, pair, line_type, line_level, status, hit_at")
    .order("hit_at", { ascending: false })
    .limit(200);
  if (status?.length) q = q.in("status", status);

  const { data } = await q;
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: String(r.id),
    pair: String(r.pair ?? ""),
    lineType: (r.line_type as Richtung) ?? "long",
    lineLevel: Number(r.line_level ?? 0),
    status: String(r.status ?? "new"),
    hitAt: String(r.hit_at ?? ""),
  }));
}

// ---------------------------------------------------------------------------
// Kennzahlen — reine Funktionen, überall wiederverwendbar und testbar
// ---------------------------------------------------------------------------

export interface JournalStats {
  n: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** 0–100. Null, wenn kein abgeschlossener Trade vorliegt. */
  winrate: number | null;
  /** Bruttogewinn ÷ Bruttoverlust in R. Null ohne Verlusttrade. */
  profitFactor: number | null;
  /** Ø signiertes R pro Trade. */
  expectancy: number | null;
  /** Summe aller R. */
  gesamtR: number;
  /** Grösster Rückgang der R-Kurve, als positive Zahl. */
  maxDrawdownR: number;
  /** Längste Serie in Folge. */
  besteSerie: number;
  schlechtesteSerie: number;
}

/**
 * R defensiv interpretieren: Gewinne zählen +|R|, Verluste −|R|. Fehlt bei
 * einem Verlust der Wert, gilt −1R.
 *
 * Grund: Das alte Journal hat Verluste mal mit negativem, mal mit positivem R
 * gespeichert. Über den Betrag zu gehen macht die Rechnung unabhängig davon,
 * welche Konvention beim Erfassen gerade galt.
 */
export function signiertesR(t: Trade): number {
  const r = Math.abs(t.rMultiple);
  if (t.result === "win") return r;
  if (t.result === "loss") return -(r || 1);
  return 0;
}

export function computeJournalStats(trades: Trade[]): JournalStats {
  const abgeschlossen = trades.filter(
    (t) => t.result === "win" || t.result === "loss" || t.result === "breakeven",
  );

  let wins = 0, losses = 0, breakeven = 0, grossWin = 0, grossLoss = 0, sumR = 0;
  for (const t of abgeschlossen) {
    const r = signiertesR(t);
    sumR += r;
    if (t.result === "win") { wins++; grossWin += r; }
    else if (t.result === "loss") { losses++; grossLoss += Math.abs(r); }
    else breakeven++;
  }

  // Drawdown und Serien über die Zeitachse, also alt → neu.
  const chronologisch = [...abgeschlossen].sort((a, b) => a.date.localeCompare(b.date));
  let lauf = 0, hoch = 0, maxDd = 0;
  let serie = 0, besteSerie = 0, schlechtesteSerie = 0;
  for (const t of chronologisch) {
    lauf += signiertesR(t);
    if (lauf > hoch) hoch = lauf;
    if (hoch - lauf > maxDd) maxDd = hoch - lauf;

    if (t.result === "win") serie = serie > 0 ? serie + 1 : 1;
    else if (t.result === "loss") serie = serie < 0 ? serie - 1 : -1;
    else continue; // Breakeven bricht keine Serie
    if (serie > besteSerie) besteSerie = serie;
    if (serie < schlechtesteSerie) schlechtesteSerie = serie;
  }

  const n = abgeschlossen.length;
  const gewertet = wins + losses;

  return {
    n, wins, losses, breakeven,
    winrate: gewertet > 0 ? (wins / gewertet) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: n > 0 ? sumR / n : null,
    gesamtR: sumR,
    maxDrawdownR: maxDd,
    besteSerie,
    schlechtesteSerie: Math.abs(schlechtesteSerie),
  };
}

export interface EquityPunkt {
  nr: number;
  date: string;
  pair: string;
  r: number;
  /** Kumuliertes R nach diesem Trade. */
  kumuliert: number;
}

/** R-Kurve in Handelsreihenfolge. Basis für die Equity-Seite. */
export function equityKurve(trades: Trade[]): EquityPunkt[] {
  const chronologisch = [...trades]
    .filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven")
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  let lauf = 0;
  return chronologisch.map((t, i) => {
    const r = signiertesR(t);
    lauf += r;
    return { nr: i + 1, date: t.date, pair: t.pair, r, kumuliert: Number(lauf.toFixed(2)) };
  });
}

export interface Gruppe {
  key: string;
  stats: JournalStats;
}

/** Kennzahlen je Gruppe, absteigend nach Anzahl Trades. */
export function gruppiere(trades: Trade[], schluessel: (t: Trade) => string): Gruppe[] {
  const buckets = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = schluessel(t);
    if (!k) continue;
    const liste = buckets.get(k) ?? [];
    liste.push(t);
    buckets.set(k, liste);
  }
  return [...buckets.entries()]
    .map(([key, liste]) => ({ key, stats: computeJournalStats(liste) }))
    .sort((a, b) => b.stats.n - a.stats.n);
}

/** Die fünf Setup-Flags mit ihren Anzeigenamen — eine Quelle für alle Seiten. */
export const SETUPS = [
  { key: "dreiTagesGva", label: "3-Tages-GVA" },
  { key: "weeklyGva", label: "Wochen-GVA" },
  { key: "dailyBos", label: "Daily BOS" },
  { key: "valueArea", label: "Value Area" },
  { key: "marketStructure", label: "Market Structure" },
] as const;

export type SetupKey = (typeof SETUPS)[number]["key"];

/** Die 28 Paare des Screeners plus Metalle — Auswahl im Erfassungsformular. */
export const PAARE = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
  "EURAUD", "EURCAD", "EURCHF", "EURGBP", "EURJPY", "EURNZD",
  "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD",
  "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD",
  "CADCHF", "CADJPY", "CHFJPY",
  "NZDCAD", "NZDCHF", "NZDJPY",
  "XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD",
] as const;

/** Handelssitzungen, in denen Kerim tatsächlich handelt. */
export const SESSIONS = ["London", "New York", "Overlap", "Asia"] as const;


// ---------------------------------------------------------------------------
// Kontoführung
//
// Im Backtest braucht es sie nicht — dort zählt R, nicht der Kontostand.
// Vor dem Live-Gang schon: FTMO-Regeln hängen an absoluten Zahlen
// (Gewinnziel, maximaler Verlust, Tagesverlust), und die kann man nur
// prüfen, wenn irgendwo steht, wie viel auf dem Konto ist.
// ---------------------------------------------------------------------------

export async function fetchKontoBuchungen(): Promise<KontoBuchung[]> {
  const z = await zugang();
  if (!z) return [];
  const { data } = await z.supabase
    .from("transactions")
    .select("id, account_id, type, transaction_type, amount, date, note")
    .eq("user_id", z.userId)
    .order("date", { ascending: false });

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: String(r.id),
    accountId: (r.account_id as string) ?? null,
    type: (r.type as KontoTyp) ?? "ek",
    buchungsTyp: (r.transaction_type as BuchungsTyp) ?? "deposit",
    amount: Number(r.amount ?? 0),
    date: String(r.date ?? "").slice(0, 10),
    note: String(r.note ?? ""),
  }));
}

export interface KontoStand {
  konto: Konto;
  /** Summe der Ein- minus Auszahlungen. */
  einzahlungen: number;
  auszahlungen: number;
  /** Realisierter Gewinn aus Live-Trades mit erfasstem Betrag. */
  handelsGewinn: number;
  /** Startkapital + Ein- − Auszahlungen + Handelsgewinn. */
  berechnet: number;
  /** Differenz zum in der Datenbank hinterlegten Stand. */
  abweichung: number;
  /** Live-Trades dieses Kontotyps. */
  trades: number;
}

/**
 * Kontostand aus Bewegungen statt aus einem Feld.
 *
 * `accounts.current_balance` ist ein von Hand gepflegter Wert und driftet
 * unweigerlich. Deshalb wird hier gerechnet und die **Abweichung** angezeigt,
 * statt eine der beiden Zahlen zur Wahrheit zu erklären — eine Differenz ist
 * ein Hinweis, kein Fehler: sie bedeutet meist, dass ein Trade ohne Betrag
 * erfasst wurde oder eine Einzahlung fehlt.
 *
 * Backtest-Trades zählen ausdrücklich nicht mit. Sie haben kein Geld bewegt.
 */
export function berechneKontostaende(
  konten: Konto[],
  buchungen: KontoBuchung[],
  trades: Trade[],
): KontoStand[] {
  return konten.map((konto) => {
    const eigene = buchungen.filter(
      (b) => b.accountId === konto.id || (b.accountId === null && b.type === konto.type),
    );
    const einzahlungen = eigene
      .filter((b) => b.buchungsTyp === "deposit")
      .reduce((a, b) => a + Math.abs(b.amount), 0);
    const auszahlungen = eigene
      .filter((b) => b.buchungsTyp === "withdrawal" || b.buchungsTyp === "payout")
      .reduce((a, b) => a + Math.abs(b.amount), 0);

    const eigeneTrades = trades.filter(
      (t) => t.sessionType === "live" && t.type === konto.type,
    );
    const handelsGewinn = eigeneTrades.reduce((a, t) => a + (t.profitAmount ?? 0), 0);

    const berechnet =
      konto.initialBalance + einzahlungen - auszahlungen + handelsGewinn;

    return {
      konto, einzahlungen, auszahlungen, handelsGewinn, berechnet,
      abweichung: konto.currentBalance - berechnet,
      trades: eigeneTrades.length,
    };
  });
}
