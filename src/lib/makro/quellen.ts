import "server-only";
import { holeSerie } from "./fred";
import { type Beobachtung, periodeZuDatum, sortiert, parseOecdCsv } from "./perioden";
import { QUELLEN, quellenName, oecdUrl, type OecdSet, type Quelle } from "./katalog";
import { pmiAusKalender, PMI_MUSTER, ersatzAusMt5, MT5_ERSATZ, type KalenderTermin, type Mt5Zeile } from "./pmi";
import { createTradingClient } from "@/lib/supabase/trading";

/**
 * Der Server-Lauf: holt jeden Kandidaten aus dem Katalog (lib/makro/katalog.ts)
 * und nimmt je Feld den mit dem jüngsten Wert.
 *
 * Zwei Eigenheiten, die man kennen muss:
 *
 *  - Die OECD lässt rund 20 Abfragen pro Minute zu. Ein Lauf holt jedes Set
 *    deshalb nur EINMAL für alle Länder.
 *  - OECD und IMF weisen Rechenzentren gelegentlich ab (Vercel bekam am
 *    26.09.2026 von der OECD HTTP 500, vom IMF HTTP 403, während derselbe
 *    Aufruf aus dem Browser ging). Deshalb Browser-Kopfzeilen, eine
 *    Weltbank-Reserve für den IMF — und für die OECD das Nachladen im
 *    Browser auf der Währungsseite, das dieselben Reihen speichert.
 */

const KOPF = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    + "(KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  "Accept": "application/json, text/csv, */*;q=0.8",
  "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
};

async function holeText(url: string, timeoutMs = 20000): Promise<string> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: KOPF });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

const abJahr = () => new Date().getUTCFullYear() - 5;

/* ------------------------------------------------------------- OECD */

export function oecdLader() {
  const cache = new Map<OecdSet, Promise<Map<string, Beobachtung[]>>>();
  return (set: OecdSet) => {
    if (!cache.has(set)) {
      cache.set(set, holeText(oecdUrl(set, abJahr()), 30000).then(parseOecdCsv));
    }
    return cache.get(set)!;
  };
}

/* ---------------------------------------------------------- Eurostat */

export async function holeEurostat(dataset: string, params: Record<string, string>): Promise<Beobachtung[]> {
  const q = new URLSearchParams({ ...params, sinceTimePeriod: String(abJahr()) });
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${q}`;
  const j = JSON.parse(await holeText(url)) as {
    value?: Record<string, number | null>;
    dimension?: { time?: { category?: { index?: Record<string, number> } } };
  };
  const idx = j.dimension?.time?.category?.index ?? {};
  const werte: Beobachtung[] = [];
  for (const [periode, i] of Object.entries(idx)) {
    const v = j.value?.[String(i)];
    const datum = periodeZuDatum(periode);
    if (v !== undefined && v !== null && datum) werte.push({ datum, wert: Number(v) });
  }
  return sortiert(werte);
}

/* --------------------------------------------------------------- IMF */

/**
 * IMF DataMapper, jährlich. Nur Jahre BIS zum Vorjahr: das laufende Jahr und
 * alles danach sind Prognosen des World Economic Outlook, keine Messwerte.
 */
export function imfLader() {
  const cache = new Map<string, Promise<Record<string, Record<string, number>>>>();
  return async (indikator: string, land: string): Promise<Beobachtung[]> => {
    if (!cache.has(indikator)) {
      cache.set(indikator, holeText(`https://www.imf.org/external/datamapper/api/v1/${indikator}`, 30000)
        .then((t) => (JSON.parse(t) as { values?: Record<string, Record<string, Record<string, number>>> })
          .values?.[indikator] ?? {}));
    }
    const reihe = (await cache.get(indikator)!)[land] ?? {};
    const bisJahr = new Date().getUTCFullYear() - 1;
    return sortiert(Object.entries(reihe)
      .filter(([j]) => Number(j) <= bisJahr)
      .map(([j, v]) => ({ datum: `${j}-01-01`, wert: Number(v) })));
  };
}

/* ---------------------------------------------------------- Weltbank */

export async function holeWeltbank(indikator: string, land: string): Promise<Beobachtung[]> {
  const bis = new Date().getUTCFullYear();
  const url = `https://api.worldbank.org/v2/country/${land}/indicator/${indikator}`
    + `?format=json&per_page=60&date=${bis - 8}:${bis}`;
  // Kurzer Timeout: die Weltbank antwortet dem Rechenzentrum oft gar nicht,
  // und der Lauf hat insgesamt nur 60 Sekunden. Der Browser holt nach.
  const j = JSON.parse(await holeText(url, 8000)) as [unknown, { date: string; value: number | null }[] | null];
  return sortiert((j?.[1] ?? [])
    .filter((x) => x.value !== null)
    .map((x) => ({ datum: `${x.date}-01-01`, wert: Number(x.value) })));
}

/* ------------------------------------------------------------- Holen */

export interface FeldErgebnis {
  ccy: string;
  feld: string;
  serie: string | null;
  werte: Beobachtung[];
  fehler: string | null;
}

/* ---------------------------------------------------------------- PMI */

/**
 * PMI aus dem Forex-Factory-Kalender (siehe lib/makro/pmi.ts): die ganze
 * Historie aus `calendar_events` der Trading-DB, die der Screener täglich
 * füllt, plus der aktuelle Kalender direkt — falls der Screener-Lauf hängt.
 */
async function holePmi(): Promise<FeldErgebnis[]> {
  const termine: KalenderTermin[] = [];
  const fehler: string[] = [];

  const trading = createTradingClient();
  if (trading) {
    const ab = new Date(Date.now() - 800 * 86_400_000).toISOString();
    const { data, error } = await trading.from("calendar_events")
      .select("title, currency, event_time, previous")
      .gte("event_time", ab)
      .or("title.ilike.%PMI%,title.ilike.%Business NZ%,title.ilike.%BusinessNZ%")
      .limit(5000);
    if (error) fehler.push(`Trading-DB: ${error.message}`);
    termine.push(...((data ?? []) as KalenderTermin[]));
  } else {
    fehler.push("Trading-DB nicht verbunden");
  }

  for (const woche of ["thisweek", "nextweek"]) {
    try {
      const roh = JSON.parse(await holeText(
        `https://nfs.faireconomy.media/ff_calendar_${woche}.json`, 10000)) as
        { title: string; country: string; date: string; previous: string }[];
      termine.push(...roh.map((r) => ({
        title: r.title, currency: r.country, event_time: new Date(r.date).toISOString(), previous: r.previous,
      })));
    } catch (e) {
      fehler.push(`Forex Factory ${woche}: ${e instanceof Error ? e.message : "?"}`);
    }
  }

  const reihen = pmiAusKalender(termine);
  const ergebnisse: FeldErgebnis[] = reihen.map((r) => ({
    ccy: r.ccy, feld: r.feld, serie: r.serie, werte: r.werte, fehler: null,
  }));
  for (const [ccy, felder] of Object.entries(PMI_MUSTER)) {
    for (const feld of Object.keys(felder)) {
      if (!reihen.some((r) => r.ccy === ccy && r.feld === feld)) {
        ergebnisse.push({
          ccy, feld, serie: null, werte: [],
          fehler: `kein PMI-Termin im Kalender${fehler.length ? ` (${fehler.join(" · ")})` : ""}`,
        });
      }
    }
  }
  return ergebnisse;
}

/**
 * Ersatzreihen aus dem MT5-Kalender (lib/makro/pmi.ts, MT5_ERSATZ) — für
 * Felder, die sonst leer bleiben oder deutlich hinterherhinken.
 */
async function holeMt5Ersatz(): Promise<{ ccy: string; feld: string; serie: string; werte: Beobachtung[] }[]> {
  const trading = createTradingClient();
  if (!trading) return [];
  const ab = new Date(Date.now() - 800 * 86_400_000).toISOString();
  const zeilen: Mt5Zeile[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await trading.from("mt5_kalender")
      .select("ccy, name, event_time, actual")
      .in("ccy", [...new Set(MT5_ERSATZ.map((e) => e.ccy))])
      .gte("event_time", ab)
      .not("actual", "is", null)
      .or("name.ilike.%BusinessNZ%,name.ilike.%Jibun%,name.ilike.%S&P Global PMI der%,name.ilike.%procure.ch%,name.ilike.%KOF%")
      .order("event_time", { ascending: true })
      .range(von, von + 999);
    if (error || !data) break;
    zeilen.push(...(data as Record<string, unknown>[]).map((r) => ({
      ccy: String(r.ccy), name: String(r.name), event_time: String(r.event_time),
      actual: r.actual === null ? null : Number(r.actual),
    })));
    if (data.length < 1000) break;
  }
  return ersatzAusMt5(zeilen);
}

export async function holeAlles(): Promise<FeldErgebnis[]> {
  const ergebnisse = await holeAllesOhneMt5();
  // MT5-Ersatz einsetzen, wo die normale Quelle nichts hat oder mehr als
  // 45 Tage älter ist als der Ersatz.
  const ersatz = await holeMt5Ersatz().catch(() => []);
  const letzte = (w: Beobachtung[]) => (w.length ? Date.parse(w[w.length - 1].datum) : 0);
  for (const e of ersatz) {
    if (e.werte.length === 0) continue;
    const i = ergebnisse.findIndex((r) => r.ccy === e.ccy && r.feld === e.feld);
    const neu: FeldErgebnis = { ccy: e.ccy, feld: e.feld, serie: e.serie, werte: e.werte, fehler: null };
    if (i < 0) ergebnisse.push(neu);
    else if (ergebnisse[i].fehler || ergebnisse[i].werte.length === 0
      || letzte(e.werte) > letzte(ergebnisse[i].werte) + 45 * 86_400_000) ergebnisse[i] = neu;
  }
  return ergebnisse;
}

async function holeAllesOhneMt5(): Promise<FeldErgebnis[]> {
  const oecd = oecdLader();
  const imf = imfLader();

  const eine = async (q: Quelle): Promise<Beobachtung[]> => {
    switch (q.typ) {
      case "fred": {
        const r = await holeSerie(q.id);
        if (r.fehler) throw new Error(r.fehler);
        return r.werte;
      }
      case "oecd": return (await oecd(q.set)).get(q.land) ?? [];
      case "eurostat": return holeEurostat(q.dataset, q.params);
      case "imf": return imf(q.indikator, q.land);
      case "weltbank": return holeWeltbank(q.indikator, q.land);
    }
  };

  const auftraege = Object.entries(QUELLEN).flatMap(([ccy, felder]) =>
    Object.entries(felder).map(async ([feld, kandidaten]): Promise<FeldErgebnis> => {
      const versuche = await Promise.all(kandidaten.map(async (q) => {
        try {
          const werte = await eine(q);
          return { q, werte, fehler: werte.length === 0 ? "keine Werte" : null };
        } catch (e) {
          return { q, werte: [] as Beobachtung[], fehler: e instanceof Error ? e.message : "unbekannt" };
        }
      }));

      const gut = versuche.filter((v) => !v.fehler);
      if (gut.length === 0) {
        return {
          ccy, feld, serie: null, werte: [],
          fehler: versuche.map((v) => `${quellenName(v.q)}: ${v.fehler}`).join(" · "),
        };
      }
      const letzte = (v: typeof gut[number]) => v.werte[v.werte.length - 1].datum;
      const beste = gut.reduce((a, b) => (letzte(b) > letzte(a) ? b : a));
      return { ccy, feld, serie: quellenName(beste.q), werte: beste.werte, fehler: null };
    }));

  const [rest, pmi] = await Promise.all([Promise.all(auftraege), holePmi()]);
  return [...rest, ...pmi];
}
