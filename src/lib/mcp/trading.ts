import "server-only";
import {
  fetchScreener, fetchTodayEvents, fetchWatchlist,
  fetchWeekEvents, pairTf, sortiereNachDringlichkeit, tradingConfigured,
} from "@/lib/supabase/trading";
import { fetchTrades, type SessionTyp } from "@/lib/trading/journal";
import { ladeOffeneHits, sauberesPaar } from "@/lib/trading/offene-signale";
import { fetchNativeBacktestTrades } from "@/lib/supabase/backtest";
import { computeNativeBacktestStats } from "@/lib/backtest-types";
import { addDays, heuteISO, weekStart } from "@/lib/time";

/**
 * Trading-Sicht für den MCP-Server (28.09.2026).
 *
 * Nutzt ausschliesslich die bestehenden Loader — dieselben Regeln wie die
 * App (was „offen" heisst, wie der Fundamental-Check rechnet). Die Datei
 * formt nur um: kompakte Objekte statt der vollen App-Typen, damit Claude
 * nicht Screenshots-URLs und eingefrorene Snapshots mitliest, die für eine
 * Antwort nichts beitragen.
 */

function brauchtTrading() {
  if (!tradingConfigured()) {
    throw new Error("TRADING_SUPABASE_URL oder TRADING_SUPABASE_SERVICE_ROLE_KEY fehlt.");
  }
}

// ------------------------------------------------------------------ GVA-Status

export async function mcpGvaStatus() {
  brauchtTrading();
  const [board, offeneHits, linien] = await Promise.all([
    fetchScreener(), ladeOffeneHits(), fetchWatchlist(),
  ]);

  const relevant = sortiereNachDringlichkeit(board?.data ?? [])
    .filter((p) => p.status !== "NEUTRAL");

  return {
    screener: board
      ? {
          erreichbar: true,
          live: board.live,
          stand: board.updated ? new Date(board.updated * 1000).toISOString() : null,
        }
      : {
          erreichbar: false,
          hinweis: "Screener-Backend (Render) antwortet nicht — schläft evtl. oder Timeout.",
        },
    hitUndPrepare: relevant.map((p) => ({
      pair: p.pair,
      status: p.status,
      richtung: p.near,
      timeframe: pairTf(p),
      preis: p.price,
      abstandPips: p.distance,
      veraltet: p.stale,
    })),
    offeneHits: offeneHits.map((s) => ({
      pair: s.pair,
      richtung: s.lineType,
      level: s.lineLevel,
      hitAm: s.hitAt,
      linieEntstanden: s.lineFormedDate,
    })),
    eigeneLinien: linien.map((l) => ({
      pair: l.pair,
      level: l.line_level,
      seite: l.side,
      notiz: l.note,
      hitAlarm: l.alarm_on_hit,
      zeitAlarm: l.alarm_time ? l.alarm_time.slice(0, 5) : null,
      sichtbarBis: l.show_until,
    })),
  };
}

// ------------------------------------------------------------------ Trades

export interface TradeAbfrage {
  status?: "offen" | "geschlossen" | "alle";
  art?: SessionTyp;
  pair?: string;
  von?: string;
  bis?: string;
  limit?: number;
}

export async function mcpTrades(a: TradeAbfrage) {
  brauchtTrading();
  const alle = await fetchTrades({ sessionType: a.art, von: a.von, bis: a.bis });
  const paar = a.pair ? sauberesPaar(a.pair) : null;

  const gefiltert = alle
    .filter((t) => !paar || sauberesPaar(t.pair) === paar)
    .filter((t) => a.status === "offen" ? t.status === "open"
      : a.status === "geschlossen" ? t.status !== "open" : true);

  return {
    anzahl: gefiltert.length,
    trades: gefiltert.slice(0, a.limit ?? 20).map((t) => ({
      id: t.id,
      datum: t.date,
      pair: t.pair,
      richtung: t.direction,
      art: t.sessionType,
      konto: t.type,
      status: t.status,
      ergebnis: t.result,
      r: t.rMultiple,
      gewinn: t.profitAmount,
      gewinnProzent: t.profitPercent,
      entry: t.entryPrice,
      sl: t.stopLoss,
      tp: t.takeProfit,
      lots: t.lotSize,
      confluences: t.confluences,
      notiz: t.notes || null,
    })),
  };
}

// ------------------------------------------------------------------ Backtest

export async function mcpBacktest(a: { pair?: string; von?: string; bis?: string; limit?: number }) {
  brauchtTrading();
  const alle = await fetchNativeBacktestTrades();
  const paar = a.pair ? sauberesPaar(a.pair) : null;
  const trades = alle.filter((t) =>
    (!paar || sauberesPaar(t.pair) === paar)
    && (!a.von || t.occurred_on >= a.von)
    && (!a.bis || t.occurred_on <= a.bis));

  const montag = weekStart(heuteISO());
  const sonntag = addDays(montag, 6);
  const dieseWoche = alle.filter((t) => {
    const d = String(t.occurred_on).slice(0, 10);
    return d >= montag && d <= sonntag;
  }).length;

  const s = computeNativeBacktestStats(trades);
  const rund = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

  return {
    kennzahlen: {
      total: s.total,
      gewertet: s.gewertet,
      skips: s.skips,
      wins: s.wins,
      winrateProzent: rund(s.winrate),
      profitFactor: rund(s.profitFactor),
      expectancyR: rund(s.expectancy),
      gesamtR: s.gesamtR,
    },
    alleTradesDieseWoche: dieseWoche,
    trades: trades.slice(0, a.limit ?? 30).map((t) => ({
      datum: t.occurred_on,
      pair: t.pair,
      richtung: t.direction,
      ergebnis: t.result,
      r: t.r_multiple,
      rrGeplant: t.rr_geplant,
      notiz: t.notiz,
      tags: t.tags.map((x) => `${x.categoryKey}: ${x.label}`),
    })),
  };
}

// ------------------------------------------------------------------ Kalender

export async function mcpWirtschaftskalender(zeitraum: "heute" | "woche") {
  brauchtTrading();
  const events = zeitraum === "heute" ? await fetchTodayEvents() : await fetchWeekEvents();
  return {
    zeitraum,
    hinweis: "Nur High-Impact-Termine. Zeiten in UTC.",
    termine: events.map((e) => ({
      zeit: e.event_time,
      waehrung: e.currency,
      titel: e.title,
      prognose: e.forecast,
      vorher: e.previous,
      aktuell: e.actual,
    })),
  };
}
