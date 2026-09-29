import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTradingClient, G8 } from "@/lib/supabase/trading";
import {
  kategorieVon, mitAbweichung, mitMt5, parseWert, releasesAusKalender, serieVon,
  type KalenderZeile, type Mt5Bericht, type Mt5Zeile, type Release,
} from "./releases";

/**
 * Der Lauf „releases" (29.09.2026): Forex-Factory-Kalender aus der
 * Trading-DB → public.makro_releases, mit Ist und Abweichung.
 *
 * Woher das Ist kommt, in dieser Reihenfolge:
 *   1. MT5-Wirtschaftskalender (trading.mt5_kalender), vom MetaTrader auf
 *      Kerims PC geschrieben und von der MT5-Brücke hochgeladen. Gratis, mit
 *      Historie ab 2024 — aber nur frisch, wenn der PC läuft.
 *   2. JBlanked News API, falls JBLANKED_API_KEY gesetzt ist. Stand
 *      29.09.2026 verlangt jeder Endpunkt Credits; der Code bleibt für den
 *      Fall, dass sich das ändert, und schweigt ohne Key.
 *   3. Rekonstruktion aus dem „previous" des Folgetermins (releases.ts).
 * Ein Ist aus 1 oder 2 wird nie durch 3 überschrieben.
 */

const JB_BASIS = "https://www.jblanked.com/news/api/forex-factory/calendar";
const HISTORIE_AB = "2024-01-01";
const SEITE = 1000;

interface JbEvent {
  name: string;
  ccy: string;
  zeit: Date;
  ist: number | null;
  erwartung: number | null;
  vorwert: number | null;
  einheit: string;
  impact: string | null;
}

export interface ReleasesBericht {
  kalenderZeilen: number;
  mt5: Mt5Bericht | string;
  releases: number;
  mitErwartung: number;
  mitIst: number;
  jeQuelle: Record<string, number>;
  jblanked: string;
  geschrieben: number;
  fehler: string[];
}

/* ------------------------------------------------------------ Laden */

async function alleKalenderZeilen(): Promise<{ zeilen: KalenderZeile[]; fehler: string | null }> {
  const trading = createTradingClient();
  if (!trading) return { zeilen: [], fehler: "Trading-DB nicht verbunden" };
  const zeilen: KalenderZeile[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await trading.from("calendar_events")
      .select("id, title, currency, event_time, impact, forecast, previous")
      .in("currency", [...G8])
      .order("event_time", { ascending: true })
      .range(von, von + SEITE - 1);
    if (error) return { zeilen, fehler: `calendar_events: ${error.message}` };
    zeilen.push(...((data ?? []) as KalenderZeile[]));
    if (!data || data.length < SEITE) break;
  }
  return { zeilen, fehler: null };
}

async function bestehendeReleases(db: SupabaseClient): Promise<Release[]> {
  const out: Release[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await db.from("makro_releases")
      .select("id, ccy, titel, serie, kategorie, event_time, impact, einheit, erwartung, ist, vorwert, ist_quelle, abweichung, z")
      .order("id", { ascending: true })
      .range(von, von + SEITE - 1);
    if (error || !data) break;
    out.push(...(data as Record<string, unknown>[]).map(zuRelease));
    if (data.length < SEITE) break;
  }
  return out;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export function zuRelease(r: Record<string, unknown>): Release {
  return {
    id: String(r.id),
    ccy: String(r.ccy),
    titel: String(r.titel),
    serie: String(r.serie),
    kategorie: r.kategorie as Release["kategorie"],
    event_time: new Date(String(r.event_time)).toISOString(),
    impact: (r.impact as string | null) ?? null,
    einheit: String(r.einheit ?? ""),
    erwartung: num(r.erwartung),
    ist: num(r.ist),
    vorwert: num(r.vorwert),
    ist_quelle: (r.ist_quelle as Release["ist_quelle"]) ?? null,
    abweichung: num(r.abweichung),
    z: num(r.z),
  };
}

async function alleMt5Zeilen(): Promise<{ zeilen: Mt5Zeile[]; fehler: string | null }> {
  const trading = createTradingClient();
  if (!trading) return { zeilen: [], fehler: "Trading-DB nicht verbunden" };
  const zeilen: Mt5Zeile[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await trading.from("mt5_kalender")
      .select("value_id, event_id, ccy, name, importance, event_time, actual, forecast, previous, multiplier, unit")
      .in("ccy", [...G8])
      .order("value_id", { ascending: true })
      .range(von, von + SEITE - 1);
    if (error) return { zeilen, fehler: `mt5_kalender: ${error.message}` };
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      zeilen.push({
        value_id: Number(r.value_id), event_id: Number(r.event_id),
        ccy: String(r.ccy), name: String(r.name),
        importance: (r.importance as string | null) ?? null,
        event_time: new Date(String(r.event_time)).toISOString(),
        actual: num(r.actual), forecast: num(r.forecast), previous: num(r.previous),
        multiplier: (r.multiplier as string | null) ?? null, unit: (r.unit as string | null) ?? null,
      });
    }
    if (!data || data.length < SEITE) break;
  }
  return { zeilen, fehler: null };
}

/* ----------------------------------------------------------- JBlanked */

/**
 * JBlanked-Datum "YYYY.MM.DD HH:MM" ist Serverzeit der MQL5-Welt (GMT+3,
 * laut Offset-Tabelle ihrer Bibliothek: GMT = 3). Die Zuordnung zum
 * Kalender erlaubt ohnehin ±4 Stunden, eine Stunde Sommerzeit-Versatz
 * schadet also nicht.
 */
function jbZeit(roh: unknown): Date | null {
  const s = String(roh ?? "");
  const m = s.match(/^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 3, Number(m[5]));
  return new Date(utc);
}

/** Beliebig verschachtelte Antwort flach klopfen: alles mit Name + Currency ist ein Termin. */
function sammle(knoten: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(knoten)) {
    for (const k of knoten) sammle(k, out);
  } else if (knoten && typeof knoten === "object") {
    const o = knoten as Record<string, unknown>;
    const name = o.Name ?? o.name;
    const ccy = o.Currency ?? o.currency;
    if (typeof name === "string" && typeof ccy === "string") {
      out.push(o);
    } else {
      for (const v of Object.values(o)) sammle(v, out);
    }
  }
}

function zuJb(o: Record<string, unknown>): JbEvent | null {
  const zeit = jbZeit(o.Date ?? o.date);
  if (!zeit) return null;
  const ccy = String(o.Currency ?? o.currency).toUpperCase();
  if (!(G8 as readonly string[]).includes(ccy)) return null;
  const ergebnis = String(o.Outcome ?? o.outcome ?? "");
  // Vor der Veröffentlichung steht im Ist oft 0 oder nichts. „Data Not
  // Loaded" ist ihr Wort dafür; und ein Termin in der Zukunft hat kein Ist.
  const veroeffentlicht = zeit.getTime() < Date.now() - 60_000 && !/not loaded|pending/i.test(ergebnis);
  const a = parseWert(o.Actual as string | number | null);
  const f = parseWert(o.Forecast as string | number | null);
  const p = parseWert(o.Previous as string | number | null);
  return {
    name: String(o.Name ?? o.name).trim(),
    ccy,
    zeit,
    ist: veroeffentlicht ? a?.wert ?? null : null,
    erwartung: f?.wert ?? null,
    vorwert: p?.wert ?? null,
    einheit: a?.einheit || f?.einheit || p?.einheit || "",
    impact: typeof o.Impact === "string" ? o.Impact : typeof o.impact === "string" ? o.impact : null,
  };
}

async function holeJb(pfad: string, key: string): Promise<JbEvent[]> {
  const r = await fetch(`${JB_BASIS}/${pfad}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(40_000),
    headers: { Authorization: `Api-Key ${key}`, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const roh: Record<string, unknown>[] = [];
  sammle(await r.json(), roh);
  return roh.map(zuJb).filter((e): e is JbEvent => e !== null);
}

/* ------------------------------------------------------------- Lauf */

export async function syncReleases(db: SupabaseClient, opt: { voll?: boolean } = {}): Promise<ReleasesBericht> {
  const fehler: string[] = [];
  const [{ zeilen, fehler: kalFehler }, bestand, mt5Daten] = await Promise.all([
    alleKalenderZeilen(),
    bestehendeReleases(db),
    alleMt5Zeilen(),
  ]);
  if (kalFehler) fehler.push(kalFehler);
  if (mt5Daten.fehler) fehler.push(mt5Daten.fehler);

  // 1. Aus dem Kalender, mit Rekonstruktion.
  const ausKalender = releasesAusKalender(zeilen, G8);
  const nachId = new Map<string, Release>(ausKalender.map((r) => [r.id, r]));

  // 2. Frühere echte Ist-Werte und reine JBlanked-Historie übernehmen.
  for (const alt of bestand) {
    // MT5-Historie wird unten aus mt5_kalender neu gebaut — die alte Fassung
    // nicht mitschleppen, sonst stünde dieselbe id zweimal im Upsert.
    if (alt.id.startsWith("mt5:") && mt5Daten.zeilen.length > 0) continue;
    const neu = nachId.get(alt.id);
    if (!neu) {
      // Nur noch in der Tabelle: Historie aus JBlanked (oder ein Termin, den
      // der Feed nicht mehr führt). Bleibt, wird aber neu gerechnet.
      nachId.set(alt.id, alt);
    } else if (alt.ist_quelle === "jblanked" && alt.ist !== null) {
      nachId.set(alt.id, { ...neu, ist: alt.ist, ist_quelle: "jblanked" });
    }
  }

  // 3. MT5: Ist setzen und Historie ergänzen.
  let mt5Bericht: Mt5Bericht | string = "keine Zeilen in trading.mt5_kalender (MT5-Dienst oder Brücke läuft nicht?)";
  if (mt5Daten.zeilen.length > 0) {
    const { releases: mitM, bericht } = mitMt5([...nachId.values()], mt5Daten.zeilen);
    nachId.clear();
    for (const r of mitM) nachId.set(r.id, r);
    mt5Bericht = bericht;
  }

  // 4. JBlanked, falls ein Schlüssel da ist.
  let jbText = "aus (kein JBLANKED_API_KEY)";
  const key = process.env.JBLANKED_API_KEY?.trim();
  if (key) {
    try {
      const heute = new Date().toISOString().slice(0, 10);
      const events = opt.voll
        ? await holeJb(`range/?from=${HISTORIE_AB}&to=${heute}`, key)
        : await holeJb("week/", key);
      const index = new Map<string, Release[]>();
      for (const r of nachId.values()) {
        const k = `${r.ccy}|${r.titel.toLowerCase()}`;
        const l = index.get(k) ?? [];
        l.push(r);
        index.set(k, l);
      }
      let zugeordnet = 0, neu = 0;
      for (const e of events) {
        const kandidaten = index.get(`${e.ccy}|${e.name.toLowerCase()}`) ?? [];
        const treffer = kandidaten.find((r) => Math.abs(Date.parse(r.event_time) - e.zeit.getTime()) <= 4 * 3_600_000);
        if (treffer) {
          if (e.ist !== null) {
            nachId.set(treffer.id, {
              ...treffer,
              ist: e.ist,
              ist_quelle: "jblanked",
              erwartung: treffer.erwartung ?? e.erwartung,
              einheit: treffer.einheit || e.einheit,
            });
            zugeordnet++;
          }
          continue;
        }
        // Termin, den der Kalender nicht hat (Historie vor dem 28.06.2026):
        // als eigene Zeile übernehmen — nur mit echtem Ist, sonst nutzlos.
        if (e.ist === null) continue;
        const serie = serieVon(e.name);
        const id = `jb:${createHash("sha1").update(`${e.name}|${e.ccy}|${e.zeit.toISOString().slice(0, 16)}`).digest("hex")}`;
        nachId.set(id, {
          id, ccy: e.ccy, titel: e.name, serie, kategorie: kategorieVon(serie),
          event_time: e.zeit.toISOString(), impact: e.impact, einheit: e.einheit,
          erwartung: e.erwartung, ist: e.ist, vorwert: e.vorwert,
          ist_quelle: "jblanked", abweichung: null, z: null,
        });
        neu++;
      }
      jbText = `${events.length} Termine geholt (${opt.voll ? `ab ${HISTORIE_AB}` : "diese Woche"}), ${zugeordnet} Ist zugeordnet, ${neu} neue Historie`;
    } catch (e) {
      jbText = `Fehler: ${e instanceof Error ? e.message : "unbekannt"} — Ist bleibt rekonstruiert`;
      fehler.push(`JBlanked: ${jbText}`);
    }
  }

  // 5. Abweichung und z über die ganze Historie neu rechnen, dann schreiben.
  // nachId ist nach id eindeutig — ein Upsert-Stück mit derselben id zweimal
  // bräche mit „cannot affect row a second time" ab.
  const alle = mitAbweichung([...nachId.values()]);
  let geschrieben = 0;
  for (let i = 0; i < alle.length; i += 500) {
    const stueck = alle.slice(i, i + 500).map((r) => ({ ...r, geholt_am: new Date().toISOString() }));
    const { error } = await db.from("makro_releases").upsert(stueck, { onConflict: "id" });
    if (error) {
      fehler.push(`Schreiben: ${error.message}`);
      break;
    }
    geschrieben += stueck.length;
  }

  // MT5-Zeilen, die dieser Lauf nicht mehr erzeugt (z.B. weil die Regel für
  // Doppelungen strenger wurde), aus der Tabelle entfernen — sonst blieben
  // sie für immer stehen, denn ein Upsert löscht nichts.
  if (mt5Daten.zeilen.length > 0 && fehler.length === 0) {
    const jetzt = new Set(alle.map((r) => r.id));
    const weg = bestand.filter((r) => r.id.startsWith("mt5:") && !jetzt.has(r.id)).map((r) => r.id);
    for (let i = 0; i < weg.length; i += 200) {
      const { error } = await db.from("makro_releases").delete().in("id", weg.slice(i, i + 200));
      if (error) {
        fehler.push(`Aufräumen: ${error.message}`);
        break;
      }
    }
  }

  const jeQuelle: Record<string, number> = {};
  for (const r of alle) if (r.ist_quelle) jeQuelle[r.ist_quelle] = (jeQuelle[r.ist_quelle] ?? 0) + 1;

  return {
    kalenderZeilen: zeilen.length,
    mt5: mt5Bericht,
    releases: alle.length,
    mitErwartung: alle.filter((r) => r.erwartung !== null).length,
    mitIst: alle.filter((r) => r.ist !== null).length,
    jeQuelle,
    jblanked: jbText,
    geschrieben,
    fehler,
  };
}
