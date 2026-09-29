import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Kategorie } from "@/lib/trading/kategorien";

/**
 * Zugang zur Trading-Datenbank (Journal + GVA-Screener teilen sich ein Projekt).
 *
 * Wie beim Gym: eigene Datenbank, eigene Anmeldung — KerimOS liest serverseitig
 * mit eigenem Schlüssel. Nur in Server Components / Server Actions verwenden;
 * die Variablen tragen bewusst kein NEXT_PUBLIC_.
 */
export function createTradingClient() {
  const url = process.env.TRADING_SUPABASE_URL;
  const key = process.env.TRADING_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  // Seit 28.09.2026 liegen die Trading-Tabellen im Kompass-Projekt, Schema
  // "trading" (dort gibt es in public schon ein eigenes accounts/transactions).
  // Ohne Variable bleibt es bei "public" — so läuft der Code gegen die alte
  // Datenbank unverändert weiter, bis die Umgebungsvariablen umgestellt sind.
  const schema = process.env.TRADING_SUPABASE_SCHEMA?.trim() || "public";

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema },
  });
}

export function tradingConfigured(): boolean {
  return Boolean(
    process.env.TRADING_SUPABASE_URL && process.env.TRADING_SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Roadmap-Schritt 2: 200 dokumentierte Backtest-Trades. */
export const BACKTEST_ZIEL = 200;

/** Pensum laut Roadmap: 3 Tage à 8 Trades pro Woche (siehe CLAUDE.md). */
export const WEEKLY_BACKTEST_ZIEL = 24;

/** Ein Trade innerhalb von backtest_sessions.trades (jsonb-Array). */
export interface BacktestTrade {
  date: string;
  pair: string;
  direction: string;
  result: string; // "win" | "loss" | ggf. "be"
  rMultiple: number | null;
}

export interface BacktestSessionRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  trades: BacktestTrade[] | null;
  stats: { config?: { pair?: string; defaultRR?: number; strategy?: string } } | null;
}

export interface BacktestStats {
  n: number;
  wins: number;
  losses: number;
  /** 0-100, null wenn keine abgeschlossenen Trades. */
  winrate: number | null;
  /** Bruttogewinn / Bruttoverlust in R. Null ohne Verlusttrade. */
  profitFactor: number | null;
  /** Ø signiertes R pro Trade. */
  expectancy: number | null;
}

/**
 * Kennzahlen über eine Trade-Liste. rMultiple wird defensiv interpretiert:
 * Gewinne zählen +|R|, Verluste -|R| (Fallback -1R, wenn kein Wert erfasst) —
 * so stimmt die Rechnung unabhängig davon, ob das Journal Verluste mit
 * negativem oder positivem R speichert.
 */
export function computeBacktestStats(trades: BacktestTrade[]): BacktestStats {
  let wins = 0, losses = 0, grossWin = 0, grossLoss = 0, sumR = 0, n = 0;

  for (const t of trades) {
    const r = Math.abs(Number(t.rMultiple ?? 0));
    if (t.result === "win") {
      wins++; n++;
      grossWin += r; sumR += r;
    } else if (t.result === "loss") {
      losses++; n++;
      const loss = r || 1;
      grossLoss += loss; sumR -= loss;
    } else if (t.result === "be") {
      n++;
    }
  }

  return {
    n, wins, losses,
    winrate: n > 0 ? (wins / n) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: n > 0 ? sumR / n : null,
  };
}

/**
 * Zählt dokumentierte Backtest-Trades einer Kalenderwoche (weekStart
 * inklusiv, weekEndExclusive exklusiv, beide "YYYY-MM-DD"). Gleiche
 * Zähllogik wie computeBacktestStats: nur win/loss/be gelten als
 * abgeschlossen, offene oder abgebrochene Trades zählen nicht mit.
 */
export async function fetchWeeklyBacktestCount(
  weekStart: string, weekEndExclusive: string,
): Promise<number> {
  const supabase = createTradingClient();
  if (!supabase) return 0;

  const { data } = await supabase.from("backtest_sessions").select("trades");
  const alle = (data ?? []).flatMap((s) => (s.trades ?? []) as BacktestTrade[]);

  return alle.filter((t) => {
    if (t.result !== "win" && t.result !== "loss" && t.result !== "be") return false;
    const tag = (t.date || "").slice(0, 10);
    return tag >= weekStart && tag < weekEndExclusive;
  }).length;
}

/**
 * Eine selbst gezeichnete GVA-Linie auf der Watchlist.
 *
 * Anders als die "beobachtung"-Lane im GVA-Screener-Frontend (die an
 * signals/outlooks hängt) ist das hier von Hand gepflegt: Kerim trägt ein
 * Level ein, das er selbst im Chart gefunden hat, und legt fest, wann er
 * dazu eine Benachrichtigung will.
 */
export interface WatchlistPair {
  id: string;
  pair: string;
  note: string | null;
  created_at: string;
  /** Preis der eigenen Linie. Null = nur Pair beobachten, ohne Level. */
  line_level: number | null;
  side: "long" | "short" | null;
  /** Vorwarnung ab diesem Pip-Abstand. Null = keine Nähe-Meldung. */
  alarm_on_hit: boolean;
  /** Freie Uhrzeit "HH:MM:SS" (Zürich). Null = keine Zeit-Erinnerung. */
  alarm_time: string | null;
  /** Letzter Tag auf der Startseite. Null = unbegrenzt. */
  show_until: string | null;
  archived: boolean;
  /** Kategorie aus `trading_kategorien`. Null = ohne Kategorie. */
  kategorie_id: string | null;
}

const WATCHLIST_SPALTEN =
  "id, pair, note, created_at, line_level, side, alarm_on_hit, alarm_time, show_until, archived";

export async function fetchWatchlist(): Promise<WatchlistPair[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  // `kategorie_id` kommt aus der Kategorien-Migration. Fehlt die Spalte, laesst
  // PostgREST die GANZE Abfrage scheitern — dann lieber eine Liste ohne
  // Einteilung als gar keine. Dieselbe Vorsicht wie bei `line_formed_date`.
  const hole = (spalten: string) => supabase
    .from("trading_watchlist")
    .select(spalten)
    .eq("archived", false)
    .order("created_at", { ascending: false });

  let { data, error } = await hole(WATCHLIST_SPALTEN + ", kategorie_id");
  if (error) ({ data } = await hole(WATCHLIST_SPALTEN));

  return ((data ?? []) as unknown as WatchlistPair[]).map((w) => ({
    ...w,
    line_level: w.line_level === null ? null : Number(w.line_level),
    kategorie_id: w.kategorie_id ?? null,
  }));
}

/**
 * Die angelegten Kategorien.
 *
 * Leeres Array, wenn die Tabelle noch nicht existiert — die Migration steht
 * unter /trading/einstellungen zum Kopieren, und bis dahin soll die Liste
 * einfach ohne Einteilung funktionieren statt eine Fehlerseite zu zeigen.
 */
export async function fetchKategorien(): Promise<Kategorie[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trading_kategorien")
    .select("id, name, farbe, sort_order")
    .order("sort_order", { ascending: true });

  if (error) return [];

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((k) => ({
    id: String(k.id),
    name: String(k.name ?? ""),
    farbe: String(k.farbe ?? "neutral"),
    sortOrder: Number(k.sort_order ?? 0),
  }));
}

/**
 * Linien für die Startseite: nur die, deren Anzeigedauer noch läuft.
 *
 * `show_until` ist bewusst ein eigenes Feld und kein Ablauf der Zeile -
 * eine Linie verschwindet von der Startseite, bleibt aber unter /trading
 * bestehen, solange Kerim sie nicht löscht.
 */
export async function fetchWatchlistFuerStart(heute: string): Promise<WatchlistPair[]> {
  const alle = await fetchWatchlist();
  return alle.filter((w) => !w.show_until || w.show_until >= heute);
}

/** Eine Zeile aus signals: vom Screener aufgezeichneter GVA-Hit. */
export interface GvaSignal {
  id: string;
  pair: string;
  line_type: string; // "long" | "short"
  line_level: number;
  status: string; // "new" | "dismissed" | ...
  hit_at: string;
}

/** Ein Termin aus calendar_events (Wirtschaftskalender der Trading-DB). */
export interface EconEvent {
  title: string;
  currency: string | null;
  event_time: string;
  impact: string; // High | Medium | Low | Holiday
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

/** High-Impact-Termine von heute. Leer, wenn nichts ansteht oder DB fehlt. */
export async function fetchTodayEvents(): Promise<EconEvent[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);

  const { data } = await supabase.from("calendar_events")
    .select("title, currency, event_time, impact, forecast, previous, actual")
    .gte("event_time", start.toISOString())
    .lte("event_time", end.toISOString())
    .eq("impact", "High")
    .order("event_time");
  return (data ?? []) as EconEvent[];
}

/** High-Impact-Termine der laufenden Woche (Mo-So). */
export async function fetchWeekEvents(): Promise<EconEvent[]> {
  const supabase = createTradingClient();
  if (!supabase) return [];

  const start = new Date();
  const offset = (start.getDay() + 6) % 7; // Montag = 0
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const { data } = await supabase.from("calendar_events")
    .select("title, currency, event_time, impact, forecast, previous, actual")
    .gte("event_time", start.toISOString())
    .lte("event_time", end.toISOString())
    .eq("impact", "High")
    .order("event_time");
  return (data ?? []) as EconEvent[];
}

// ---------------------------------------------------------------------------
// GVA-Screener Live-API (FastAPI auf Render)
// ---------------------------------------------------------------------------

/** Timeframe, auf dem die GVA entstanden ist. Älteres Screener-Backend liefert
 *  das Feld nicht — dann als "3D" behandeln (bis Juli 2026 gab es nur 3D). */
export type GvaTf = "3D" | "W";

export function tfLabel(tf: GvaTf | null | undefined): string {
  return tf === "W" ? "Woche" : "3D";
}

export interface ScreenerPair {
  pair: string;
  near: "LONG" | "SHORT" | null;
  price: number | null;
  short: number | null;
  long: number | null;
  /** Timeframe der jeweiligen Linie (3D-Chart oder Wochenchart). */
  short_tf: GvaTf | null;
  long_tf: GvaTf | null;
  status: "HIT" | "PREPARE" | "NEUTRAL";
  /** Pips bis zur nächsten Line. PREPARE = innerhalb von 100 Pips. */
  distance: number | null;
  /** True = Preis vom Tagesschluss, nicht live. */
  stale: boolean;
  pending: boolean;
}

/** Timeframe der Linie, die für dieses Paar gerade relevant ist. */
export function pairTf(p: ScreenerPair): GvaTf | null {
  if (p.near === "SHORT") return p.short_tf ?? null;
  if (p.near === "LONG") return p.long_tf ?? null;
  return p.short_tf ?? p.long_tf ?? null;
}

export interface ScreenerSnapshot {
  data: ScreenerPair[];
  updated: number | null; // Unix-Sekunden
  live: boolean;
  zones_complete_run: boolean;
}

/**
 * Live-Board vom Screener-Backend. Null bei Timeout/Fehler.
 *
 * Zwei Dinge sind hier absichtlich so und nicht anders:
 *
 * **Timeout 2.5 s statt 8 s.** Das Backend liegt auf Render und schläft nach
 * Inaktivität ein; das Aufwecken dauert bis zu einer Minute. Jede Sekunde
 * Timeout ist eine Sekunde, die eine KerimOS-Seite auf ein fremdes System
 * wartet. 2.5 s reichen für ein waches Backend locker — ein schlafendes wird
 * ohnehin nicht rechtzeitig fertig, egal ob man 2.5 oder 8 Sekunden wartet.
 *
 * **60 Sekunden Cache.** Der Screener rechnet seine Zonen im Minutentakt;
 * häufiger zu fragen bringt keine neue Zahl, kostet aber bei jedem
 * Seitenaufruf eine Netzrunde. `unstable_cache` teilt das Ergebnis über alle
 * Seiten und alle Besucher — die Startseite, /trading und die Radar-Ansicht
 * lösen zusammen höchstens einen Aufruf pro Minute aus.
 */
const screenerCached = unstable_cache(
  async (): Promise<ScreenerSnapshot | null> => {
    const base = (process.env.GVA_API_URL ?? "https://gva-screener.onrender.com")
      .replace(/\/+$/, "");
    try {
      const res = await fetch(`${base}/api/screener`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return null;
      return (await res.json()) as ScreenerSnapshot;
    } catch {
      return null;
    }
  },
  ["gva-screener-board"],
  { revalidate: 60, tags: ["gva-screener"] },
);

export async function fetchScreener(): Promise<ScreenerSnapshot | null> {
  return screenerCached();
}

// ---------------------------------------------------------------------------
// Ableitungen fürs Board — reine Funktionen, ohne DB und ohne Netz
// ---------------------------------------------------------------------------

/**
 * Sortierung fürs Radar: erst was getroffen ist, dann was nah dran ist, dann
 * der Rest. Innerhalb einer Stufe entscheidet der Abstand — das nächste Paar
 * steht oben. Paare ohne Abstandsangabe landen am Ende ihrer Stufe.
 */
export function sortiereNachDringlichkeit(pairs: ScreenerPair[]): ScreenerPair[] {
  const rang = { HIT: 0, PREPARE: 1, NEUTRAL: 2 } as const;
  return [...pairs].sort((a, b) => {
    const r = rang[a.status] - rang[b.status];
    if (r !== 0) return r;
    const da = a.distance ?? Number.POSITIVE_INFINITY;
    const db = b.distance ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.pair.localeCompare(b.pair);
  });
}

/** Zählt die Paare je Status — für die Kopfzeile der Board-Seiten. */
export function zaehleStatus(pairs: ScreenerPair[]): {
  hit: number; prepare: number; neutral: number; stale: number;
} {
  return {
    hit: pairs.filter((p) => p.status === "HIT").length,
    prepare: pairs.filter((p) => p.status === "PREPARE").length,
    neutral: pairs.filter((p) => p.status === "NEUTRAL").length,
    stale: pairs.filter((p) => p.stale).length,
  };
}

/**
 * Die acht Währungen, aus denen sich die 28 Paare zusammensetzen — in der
 * Reihenfolge, die auch das Ranking benutzt. Basis der Heatmap-Achsen.
 */
export const G8 = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;
export type G8Code = (typeof G8)[number];

/**
 * Eine einzelne Beobachtungs-Zeile — für „Trade eintragen".
 *
 * Der Knopf auf der Übersicht schickt ihre id mit, damit das Formular im
 * Journal vorausgefüllt aufgeht und die Zeile nach dem Speichern verschwindet.
 * Vorher führte er nur auf eine gefilterte Tabelle.
 */
export async function fetchWatchlistPaar(id: string): Promise<WatchlistPair | null> {
  const supabase = createTradingClient();
  if (!supabase || !id) return null;

  const { data } = await supabase
    .from("trading_watchlist").select(WATCHLIST_SPALTEN)
    .eq("id", id).maybeSingle();

  return (data as unknown as WatchlistPair | null) ?? null;
}
