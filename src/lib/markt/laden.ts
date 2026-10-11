import "server-only";
import {
  createTradingClient, fetchScreener, fetchKategorien, G8,
  type ScreenerPair,
} from "@/lib/supabase/trading";
import type { Kategorie } from "@/lib/trading/kategorien";
import { chatIdFuer, telegramKonfiguriert } from "@/lib/alarm/kanaele";
import { ladeEinstellungen } from "@/lib/alarm/einstellungen";
import { ladeMakro } from "@/lib/makro/laden";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ladeUrteile } from "@/lib/makro/releases-laden";
import {
  abstandPips, biasFuerPaar, lageZumPreis, monatsStart, wochenStart, zustandVon,
  type PaarBias, type Seite, type Zustand,
} from "./rechnen";

/**
 * Daten für den Markt-Tab (11.10.2026).
 *
 * Eine Linie = eine Zeile in `trading_watchlist`. Die neuen Spalten
 * (warum, prioritaet, fokus, check_*, archiv_*) stammen aus
 * supabase/trading/10_markt_watchlist.sql. Fehlen sie, fällt das Laden auf
 * die alten Spalten zurück und `migrationFehlt` ist wahr — die Seite zeigt
 * dann den Hinweis, statt eine Fehlerseite.
 *
 * Der Alarm-Lauf (/api/gva-alarm) liest weiter nur die alten Spalten und
 * wird hier nicht berührt.
 */

export interface MarktLinie {
  id: string;
  pair: string;
  note: string | null;
  created_at: string;
  line_level: number | null;
  side: Seite | null;
  alarm_pips: number | null;
  alarm_on_hit: boolean;
  alarm_time: string | null;
  show_until: string | null;
  archived: boolean;
  kategorie_id: string | null;
  warum: string | null;
  bias_eigen: Seite | "neutral" | null;
  prioritaet: 1 | 2 | 3;
  fokus: boolean;
  chart_url: string | null;
  check_abgeholt: boolean | null;
  check_bos: boolean | null;
  check_confluence: boolean | null;
  archiv_grund: string | null;
  archiviert_am: string | null;
  // abgeleitet
  preis: number | null;
  preisVeraltet: boolean;
  abstand: number | null;
  lage: "ueber" | "unter" | null;
  zustand: Zustand;
  trefferGemeldet: boolean;
  entscheidung: Entscheidung | null;
}

export interface Entscheidung {
  id: string;
  watchlist_id: string | null;
  pair: string;
  seite: Seite | null;
  level: number | null;
  entscheidung: "trade" | "skip";
  grund: string | null;
  check_abgeholt: boolean | null;
  check_bos: boolean | null;
  check_confluence: boolean | null;
  bias: string | null;
  erstellt_am: string;
}

export interface PaarKopf {
  pair: string;
  preis: number | null;
  preisVeraltet: boolean;
  screener: { status: ScreenerPair["status"]; tf: string | null; abstand: number | null } | null;
  bias: PaarBias;
}

export interface Markt {
  linien: MarktLinie[];
  archiv: MarktLinie[];
  paare: Record<string, PaarKopf>;
  kategorien: Kategorie[];
  entscheidungen: Entscheidung[];
  radar: ScreenerPair[];
  zahlen: {
    entscheidungenWoche: number;
    entscheidungenGesamt: number;
    tradesMonat: number;
    screenerStand: string | null;
  };
  migrationFehlt: boolean;
  urteilFehlt: boolean;
}

const ALT = "id, pair, note, created_at, line_level, side, alarm_pips, alarm_on_hit, alarm_time, show_until, archived, kategorie_id";
const NEU = ", warum, bias_eigen, prioritaet, fokus, chart_url, check_abgeholt, check_bos, check_confluence, archiv_grund, archiviert_am";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const bool = (v: unknown) => (v === null || v === undefined ? null : Boolean(v));

/** `dienst`: Service-Client für Läufe ohne Anmeldung (MCP) — betrifft nur das Urteil aus der Makro-Seite. */
export async function ladeMarkt(jetzt = new Date(), dienst?: SupabaseClient): Promise<Markt> {
  const db = createTradingClient();
  const leer: Markt = {
    linien: [], archiv: [], paare: {}, kategorien: [], entscheidungen: [], radar: [],
    zahlen: { entscheidungenWoche: 0, entscheidungenGesamt: 0, tradesMonat: 0, screenerStand: null },
    migrationFehlt: false, urteilFehlt: false,
  };
  if (!db) return leer;

  /* ----------------------------------------------------------- Linien */
  let migrationFehlt = false;
  const holeLinien = (spalten: string) =>
    db.from("trading_watchlist").select(spalten).order("created_at", { ascending: false });
  let res = await holeLinien(ALT + NEU);
  if (res.error) {
    migrationFehlt = true;
    res = await holeLinien(ALT);
  }
  const rohe = (res.data ?? []) as unknown as Record<string, unknown>[];

  const [screener, kategorien, alarmLog, entRes, tradesRes] = await Promise.all([
    fetchScreener(),
    fetchKategorien(),
    db.from("alarm_log").select("watchlist_id, art").eq("art", "hit"),
    db.from("trading_entscheidungen").select("*").order("erstellt_am", { ascending: false }).limit(300),
    db.from("trades").select("id", { count: "exact", head: true }).gte("date", monatsStart(jetzt)),
  ]);

  const pairs = (screener?.data ?? []) as ScreenerPair[];
  const preisVon = (pair: string) => pairs.find((x) => x.pair.toUpperCase() === pair.toUpperCase()) ?? null;
  const getroffen = new Set(((alarmLog.data ?? []) as { watchlist_id: string }[]).map((x) => x.watchlist_id));

  const entscheidungen: Entscheidung[] = ((entRes.data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: String(e.id), watchlist_id: (e.watchlist_id as string | null) ?? null, pair: String(e.pair),
    seite: (e.seite as Seite | null) ?? null, level: num(e.level),
    entscheidung: e.entscheidung as "trade" | "skip", grund: (e.grund as string | null) ?? null,
    check_abgeholt: bool(e.check_abgeholt), check_bos: bool(e.check_bos), check_confluence: bool(e.check_confluence),
    bias: (e.bias as string | null) ?? null, erstellt_am: String(e.erstellt_am),
  }));
  const letzteJeLinie = new Map<string, Entscheidung>();
  for (const e of entscheidungen) if (e.watchlist_id && !letzteJeLinie.has(e.watchlist_id)) letzteJeLinie.set(e.watchlist_id, e);

  const alle: MarktLinie[] = rohe.map((r) => {
    const pair = String(r.pair);
    const live = preisVon(pair);
    const level = num(r.line_level);
    const preis = live?.price ?? null;
    const abstand = abstandPips(pair, preis, level);
    const treffer = getroffen.has(String(r.id));
    const alarmPips = num(r.alarm_pips);
    return {
      id: String(r.id), pair, note: (r.note as string | null) ?? null, created_at: String(r.created_at),
      line_level: level, side: (r.side as Seite | null) ?? null, alarm_pips: alarmPips,
      alarm_on_hit: Boolean(r.alarm_on_hit), alarm_time: (r.alarm_time as string | null) ?? null,
      show_until: (r.show_until as string | null) ?? null, archived: Boolean(r.archived),
      kategorie_id: (r.kategorie_id as string | null) ?? null,
      warum: (r.warum as string | null) ?? null,
      bias_eigen: (r.bias_eigen as MarktLinie["bias_eigen"]) ?? null,
      prioritaet: ([1, 2, 3].includes(Number(r.prioritaet)) ? Number(r.prioritaet) : 2) as 1 | 2 | 3,
      fokus: Boolean(r.fokus), chart_url: (r.chart_url as string | null) ?? null,
      check_abgeholt: bool(r.check_abgeholt), check_bos: bool(r.check_bos), check_confluence: bool(r.check_confluence),
      archiv_grund: (r.archiv_grund as string | null) ?? null, archiviert_am: (r.archiviert_am as string | null) ?? null,
      preis, preisVeraltet: live?.stale ?? false, abstand, lage: lageZumPreis(preis, level),
      zustand: zustandVon(abstand, alarmPips, treffer), trefferGemeldet: treffer,
      entscheidung: letzteJeLinie.get(String(r.id)) ?? null,
    };
  });
  const linien = alle.filter((l) => !l.archived);
  const archiv = alle.filter((l) => l.archived)
    .sort((a, b) => (b.archiviert_am ?? b.created_at).localeCompare(a.archiviert_am ?? a.created_at))
    .slice(0, 30);

  /* ------------------------------------------------------ Urteil / Bias */
  let urteilFehlt = false;
  let urteile: Record<string, { score: number | null; wort: string }> = {};
  try {
    const makro = await ladeMakro(dienst);
    urteile = await ladeUrteile(makro.zeilen, G8, dienst);
  } catch {
    urteilFehlt = true;
  }

  const paare: Record<string, PaarKopf> = {};
  for (const l of linien) {
    if (paare[l.pair]) continue;
    const live = preisVon(l.pair);
    paare[l.pair] = {
      pair: l.pair, preis: live?.price ?? null, preisVeraltet: live?.stale ?? false,
      screener: live && live.status !== "NEUTRAL"
        ? { status: live.status, tf: (live.near === "SHORT" ? live.short_tf : live.near === "LONG" ? live.long_tf : live.short_tf ?? live.long_tf) ?? null, abstand: live.distance }
        : null,
      bias: biasFuerPaar(l.pair, urteile),
    };
  }

  const wocheAb = new Date(`${wochenStart(jetzt)}T00:00:00Z`).getTime();
  return {
    linien, archiv, paare, kategorien, entscheidungen,
    radar: pairs.filter((p) => p.status !== "NEUTRAL")
      .sort((a, b) => (a.status === b.status ? (a.distance ?? 9e9) - (b.distance ?? 9e9) : a.status === "HIT" ? -1 : 1)),
    zahlen: {
      entscheidungenWoche: entscheidungen.filter((e) => Date.parse(e.erstellt_am) >= wocheAb).length,
      entscheidungenGesamt: entscheidungen.length,
      tradesMonat: tradesRes.count ?? 0,
      screenerStand: screener?.updated ? new Date(screener.updated * 1000).toISOString() : null,
    },
    migrationFehlt, urteilFehlt,
  };
}

export interface AlarmBereitschaft {
  /** Geräte mit Web-Push-Abo. */
  pushGeraete: number;
  pushAn: boolean;
  telegramAn: boolean;
  telegramMoeglich: boolean;
  /** Mindestens ein Kanal kann wirklich zustellen. */
  zustellbar: boolean;
  /** Letzter gemeldeter Treffer (alarm_log), ISO. */
  letzterAlarm: string | null;
  /** Klartext, was fehlt; leer = alles bereit. */
  fehlt: string[];
}

/** Kommt ein Alarm überhaupt an? Ein stummer Alarm sieht aus wie „nichts los" (Prüfung 11.10.2026). */
export async function ladeAlarmBereitschaft(dienst?: SupabaseClient): Promise<AlarmBereitschaft> {
  const db = dienst ?? createTradingClient();
  const e = await ladeEinstellungen();
  let geraete = 0;
  let letzter: string | null = null;
  if (db) {
    const [p, l] = await Promise.all([
      db.from("push_subscriptions").select("endpoint", { count: "exact", head: true }),
      db.from("alarm_log").select("*").order("fired_at", { ascending: false }).limit(1),
    ]);
    geraete = p.count ?? 0;
    const zeile = ((l.data ?? []) as Record<string, unknown>[])[0];
    letzter = zeile ? String(zeile.fired_at ?? "") || null : null;
  }
  const telegramMoeglich = telegramKonfiguriert() && Boolean(chatIdFuer(e.werte.telegram_chat_id));
  const pushZustellbar = e.werte.push_an && geraete > 0;
  const telegramZustellbar = e.werte.telegram_an && telegramMoeglich;
  const fehlt: string[] = [];
  if (!pushZustellbar && !telegramZustellbar) {
    if (geraete === 0) fehlt.push("Kein Gerät für Push angemeldet (am Handy unter Alarme → Einstellungen aktivieren).");
    if (!e.werte.push_an) fehlt.push("Push ist ausgeschaltet.");
    if (!telegramMoeglich) fehlt.push("Telegram nicht nutzbar (TELEGRAM_BOT_TOKEN oder Chat-ID fehlt).");
    else if (!e.werte.telegram_an) fehlt.push("Telegram ist ausgeschaltet.");
  }
  return { pushGeraete: geraete, pushAn: e.werte.push_an, telegramAn: e.werte.telegram_an, telegramMoeglich, zustellbar: pushZustellbar || telegramZustellbar, letzterAlarm: letzter, fehlt };
}
