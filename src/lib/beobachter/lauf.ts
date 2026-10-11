import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { G8 } from "@/lib/supabase/trading";
import { fetchYahooStunden, type YahooStunde } from "@/lib/marktdaten/quellen/yahoo";
import { MESSPAAR, messeBewegung, messeStunden, type Tageskerze } from "./rechnen";

/**
 * Lauf des Beobachters: misst jedes Ereignis, das schon vorbei ist, und
 * schreibt die Bewegung nach 1, 3 und 5 Handelstagen in
 * `trading.beobachter_ereignisse`. Unvollständige Messungen (die letzten Tage)
 * werden bei jedem Lauf ergänzt, bis alle drei Werte da sind. Der Lauf
 * schreibt zuletzt seinen Zustand in `beobachter_status` — daran sieht die
 * Seite, ob der Beobachter läuft.
 */

const AB = "2024-01-01";
const SEITE = 1000;

async function alleZeilen<T>(seite: (von: number, bis: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await seite(von, von + SEITE - 1);
    if (error) throw new Error(error.message);
    const l = (data ?? []) as T[];
    out.push(...l);
    if (l.length < SEITE) break;
  }
  return out;
}

export async function beobachterLauf(pub: SupabaseClient, trading: SupabaseClient): Promise<string> {
  const jetzt = new Date();
  const grenze = new Date(jetzt.getTime() - 24 * 3_600_000).toISOString();
  let fehler: string | null = null;
  let neu = 0;

  try {
    // 1. Ereignisse mit Überraschung (z) und Ist.
    type Rel = { id: string; ccy: string; titel: string; serie: string; kategorie: string; event_time: string; impact: string; z: number };
    const releases = await alleZeilen<Rel>((von, bis) =>
      pub.from("makro_releases").select("id, ccy, titel, serie, kategorie, event_time, impact, z")
        .not("z", "is", null).not("ist", "is", null).in("impact", ["High", "Medium"]).in("ccy", [...G8])
        .gte("event_time", `${AB}T00:00:00Z`).lt("event_time", grenze)
        .order("event_time").range(von, bis));

    // 2. Was ist schon vollständig gemessen?
    type Alt = { release_id: string; bewegung_5: number | null; vola: number | null; intraday_am: string | null; bewegung_1h: number | null; bewegung_4h: number | null; bewegung_1: number | null; bewegung_3: number | null; vorlauf_5: number | null };
    const alt = await alleZeilen<Alt>((von, bis) =>
      trading.from("beobachter_ereignisse")
        .select("release_id, bewegung_5, vola, intraday_am, bewegung_1h, bewegung_4h, bewegung_1, bewegung_3, vorlauf_5")
        .order("release_id").range(von, bis));
    const altNach = new Map(alt.map((a) => [a.release_id, a]));
    const bekannt = new Set(alt.map((a) => a.release_id));
    // Fertig = Tageswerte bis 5 Tage UND Normierung UND Stundenwerte versucht.
    const voll = new Set(alt.filter((a) => a.bewegung_5 !== null && a.vola !== null && a.intraday_am !== null).map((a) => a.release_id));
    const sechsStunden = jetzt.getTime() - 6 * 3_600_000;

    // 3. Kerzen der Messpaare.
    const instrumente = [...new Set(Object.values(MESSPAAR).map((m) => m.instrument))];
    const kerzen = new Map<string, Tageskerze[]>();
    let preiseBis: string | null = null;
    for (const inst of instrumente) {
      const l = await alleZeilen<Tageskerze>((von, bis) =>
        trading.from("price_daily").select("date, close").eq("instrument", inst).gte("date", "2023-12-01").order("date").range(von, bis));
      const k = l.map((c) => ({ date: String(c.date), close: Number(c.close) }));
      kerzen.set(inst, k);
      const letzte = k[k.length - 1]?.date;
      if (letzte && (!preiseBis || letzte < preiseBis)) preiseBis = letzte;
    }

    // 3b. Stundenkerzen (Yahoo, ~2 Jahre) — nur holen, wenn es Ereignisse ohne Stundenwerte gibt.
    const offenIntraday = releases.filter((r) => !voll.has(r.id) && (altNach.get(r.id)?.intraday_am ?? null) === null && Date.parse(r.event_time) < sechsStunden);
    const stunden = new Map<string, YahooStunde[]>();
    const stundenFehler: string[] = [];
    if (offenIntraday.length > 0) {
      for (const inst of instrumente) {
        try { stunden.set(inst, await fetchYahooStunden(inst)); }
        catch (e) { stundenFehler.push(e instanceof Error ? e.message : String(e)); }
      }
    }

    // 4. Messen und schreiben.
    const zeilen: Record<string, unknown>[] = [];
    for (const r of releases) {
      if (voll.has(r.id)) continue;
      const mp = MESSPAAR[r.ccy];
      if (!mp) continue;
      const b = messeBewegung(kerzen.get(mp.instrument) ?? [], r.event_time.slice(0, 10), mp.zeichen);
      const bisher = altNach.get(r.id);
      let b1h = bisher?.bewegung_1h ?? null, b4h = bisher?.bewegung_4h ?? null;
      let intradayAm: string | null = bisher?.intraday_am ?? null;
      const ms = Date.parse(r.event_time);
      const reihe = stunden.get(mp.instrument);
      if (intradayAm === null && ms < sechsStunden && reihe) {
        const m = messeStunden(reihe, ms, mp.zeichen);
        b1h = m.b1h; b4h = m.b4h;
        // Gelten als versucht, auch wenn Yahoo die Zeit nicht mehr führt (älter als ~2 Jahre) — sonst würde jeder Lauf neu laden.
        intradayAm = jetzt.toISOString();
      }
      zeilen.push({
        release_id: r.id, ccy: r.ccy, kategorie: r.kategorie, serie: r.serie, titel: r.titel, impact: r.impact,
        event_time: r.event_time, z: Number(r.z), paar: mp.instrument, basis_datum: b.basis,
        bewegung_1: b.b1, bewegung_3: b.b3, bewegung_5: b.b5, vola: b.vola, vorlauf_5: b.vorlauf5,
        bewegung_1h: b1h, bewegung_4h: b4h, intraday_am: intradayAm, gemessen_am: jetzt.toISOString(),
      });
      if (!bekannt.has(r.id)) neu++;
    }
    for (let i = 0; i < zeilen.length; i += 500) {
      const { error } = await trading.from("beobachter_ereignisse").upsert(zeilen.slice(i, i + 500), { onConflict: "release_id" });
      if (error) throw new Error(`Schreiben: ${error.message}`);
    }

    // 5. Zustand.
    const nachher = await alleZeilen<{ bewegung_5: number | null }>((von, bis) =>
      trading.from("beobachter_ereignisse").select("bewegung_5").order("release_id").range(von, bis));
    const gesamt = nachher.length;
    const vollN = nachher.filter((x) => x.bewegung_5 !== null).length;
    await trading.from("beobachter_status").upsert({
      id: 1, gelaufen: jetzt.toISOString(), ereignisse: gesamt, voll_gemessen: vollN, offen: gesamt - vollN,
      neu_gemessen: neu, preise_bis: preiseBis, fehler: stundenFehler.length ? `Stundenkerzen: ${stundenFehler[0]}` : null,
    });
    return `${gesamt} Ereignisse, ${vollN} voll gemessen, ${neu} neu, Kurse bis ${preiseBis ?? "?"}${stundenFehler.length ? ` · Stundenkerzen: ${stundenFehler[0]}` : ""}`;
  } catch (e) {
    fehler = e instanceof Error ? e.message : String(e);
    await trading.from("beobachter_status").upsert({ id: 1, gelaufen: jetzt.toISOString(), fehler });
    return `Fehler: ${fehler}`;
  }
}
