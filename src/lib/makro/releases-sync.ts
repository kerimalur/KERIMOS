import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTradingClient, G8 } from "@/lib/supabase/trading";
import {
  kategorieVon, mitAbweichung, parseWert, releasesAusKalender, serieVon,
  type KalenderZeile, type Release,
} from "./releases";

/**
 * Der Lauf „releases" (29.09.2026): Forex-Factory-Kalender aus der
 * Trading-DB → public.makro_releases, mit Ist und Abweichung.
 *
 * Woher das Ist kommt, in dieser Reihenfolge:
 *   1. JBlanked News API (Forex-Factory-Spiegel mit Ist), wenn
 *      JBLANKED_API_KEY gesetzt ist. Gratis, aber streng begrenzt — deshalb
 *      pro Lauf genau EIN Abruf (die laufende Woche). Mit &voll=1 einmalig
 *      der Zeitraum ab 2024, damit die Grafiken Historie haben.
 *   2. Rekonstruktion aus dem „previous" des Folgetermins (releases.ts).
 * Ein Ist aus 1 wird nie durch 2 überschrieben, auch nicht in späteren
 * Läufen: bestehende JBlanked-Werte werden vor dem Rechnen geladen.
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
  const [{ zeilen, fehler: kalFehler }, bestand] = await Promise.all([
    alleKalenderZeilen(),
    bestehendeReleases(db),
  ]);
  if (kalFehler) fehler.push(kalFehler);

  // 1. Aus dem Kalender, mit Rekonstruktion.
  const ausKalender = releasesAusKalender(zeilen, G8);
  const nachId = new Map<string, Release>(ausKalender.map((r) => [r.id, r]));

  // 2. Frühere echte Ist-Werte und reine JBlanked-Historie übernehmen.
  for (const alt of bestand) {
    const neu = nachId.get(alt.id);
    if (!neu) {
      // Nur noch in der Tabelle: Historie aus JBlanked (oder ein Termin, den
      // der Feed nicht mehr führt). Bleibt, wird aber neu gerechnet.
      nachId.set(alt.id, alt);
    } else if (alt.ist_quelle === "jblanked" && alt.ist !== null) {
      nachId.set(alt.id, { ...neu, ist: alt.ist, ist_quelle: "jblanked" });
    }
  }

  // 3. JBlanked, falls ein Schlüssel da ist.
  let jbText = "kein JBLANKED_API_KEY — Ist nur rekonstruiert";
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

  // 4. Abweichung und z über die ganze Historie neu rechnen, dann schreiben.
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

  const jeQuelle: Record<string, number> = {};
  for (const r of alle) if (r.ist_quelle) jeQuelle[r.ist_quelle] = (jeQuelle[r.ist_quelle] ?? 0) + 1;

  return {
    kalenderZeilen: zeilen.length,
    releases: alle.length,
    mitErwartung: alle.filter((r) => r.erwartung !== null).length,
    mitIst: alle.filter((r) => r.ist !== null).length,
    jeQuelle,
    jblanked: jbText,
    geschrieben,
    fehler,
  };
}
