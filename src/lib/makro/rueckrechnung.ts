import "server-only";
import { createTradingClient, G8 } from "@/lib/supabase/trading";
import { PAARE } from "@/lib/trading/journal";
import { holeTageskerzen } from "@/lib/trading/kerzen";
import { makroDb } from "./speichern";
import { ladeReleases } from "./releases-laden";
import { ideenAm, montage, urteilAm, type RueckIdee } from "./rueckrechnung-rechnen";
import { HORIZONTE, messe, montagVon } from "./wochenideen-rechnen";
import type { Release } from "./releases";

/**
 * Rückrechnung ab 2024 (29.09.2026) — Server-Teil. Die Logik steht in
 * rueckrechnung-rechnen.ts; hier nur Laden, Kerzen holen, Schreiben.
 *
 * Läuft komplett auf Vercel (Daten aus Supabase, Kerzen vom Screener auf
 * Render) — Kerims PC muss dafür nicht laufen.
 */

const AB = "2024-03-04";          // erster Montag mit genug Vorlauf für den Überraschungsindex
const KONSENS_AB = "2026-06-29";  // ab hier stammt die Erwartung aus Forex Factory

export interface RueckZeile extends RueckIdee {
  einstieg: number | null;
  prozent_1w: number | null; prozent_2w: number | null; prozent_3w: number | null;
  pips_1w: number | null; pips_2w: number | null; pips_3w: number | null;
  erwartung: "metaquotes" | "konsens";
}

async function kerzenMitWiederholung(paar: string, seit: string) {
  const erste = await holeTageskerzen(paar, seit);
  if (erste.length > 0) return erste;
  // Das Screener-Backend auf Render schläft ein; der zweite Versuch trifft es wach.
  await new Promise((r) => setTimeout(r, 3000));
  return holeTageskerzen(paar, seit);
}

export async function rechneZurueck(): Promise<string> {
  const trading = createTradingClient();
  const dienst = makroDb();
  if (!trading || !dienst) return "Datenbank nicht verbunden";
  const start = Date.now();

  const releases = await ladeReleases({ ab: "2023-09-01T00:00:00Z", db: dienst });
  const jeCcy: Record<string, Release[]> = {};
  for (const c of G8) jeCcy[c] = releases.filter((r) => r.ccy === c);

  const heute = montagVon(new Date());
  const wochen = montage(AB, heute);
  const ideen: RueckIdee[] = [];
  for (const w of wochen) {
    const t = Date.parse(`${w}T00:00:00Z`);
    const scores: Record<string, number | null> = {};
    for (const c of G8) scores[c] = urteilAm(jeCcy[c], t).score;
    ideen.push(...ideenAm(w, scores, PAARE));
  }

  // Kerzen je Paar einmal holen.
  const paare = [...new Set(ideen.map((i) => i.paar))];
  await holeTageskerzen("EURUSD", "2026-01-01"); // weckt das Backend
  const kerzen = new Map<string, Awaited<ReturnType<typeof holeTageskerzen>>>();
  for (const p of paare) kerzen.set(p, await kerzenMitWiederholung(p, "2024-02-20"));

  const jetzt = Date.now();
  const zeilen: RueckZeile[] = ideen.map((i) => {
    const k = kerzen.get(i.paar) ?? [];
    const m = messe(k, i.woche, i.seite, i.paar, jetzt);
    const z: RueckZeile = {
      ...i, einstieg: m.einstieg,
      prozent_1w: null, prozent_2w: null, prozent_3w: null, pips_1w: null, pips_2w: null, pips_3w: null,
      erwartung: i.woche >= KONSENS_AB ? "konsens" : "metaquotes",
    };
    for (const n of HORIZONTE) {
      if (m.prozent[n] !== undefined) {
        z[`prozent_${n}w`] = m.prozent[n]!;
        z[`pips_${n}w`] = m.pips[n]!;
      }
    }
    return z;
  });

  // Komplett neu schreiben: die Regeln können sich ändern, alte Zeilen
  // einer früheren Regel dürfen nicht stehen bleiben.
  const { error: e1 } = await trading.from("makro_rueckrechnung").delete().gte("woche", "2000-01-01");
  if (e1) {
    return /makro_rueckrechnung/.test(e1.message)
      ? "Tabelle makro_rueckrechnung fehlt — supabase/trading/08_makro_rueckrechnung.sql ausführen"
      : `Löschen: ${e1.message}`;
  }
  const stempel = new Date().toISOString();
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error } = await trading.from("makro_rueckrechnung")
      .insert(zeilen.slice(i, i + 500).map((z) => ({ ...z, gerechnet_am: stempel })));
    if (error) return `Schreiben: ${error.message}`;
  }
  const ohne = paare.filter((p) => (kerzen.get(p) ?? []).length === 0);
  return `${wochen.length} Wochen, ${zeilen.length} Ideen, ${zeilen.filter((z) => z.prozent_2w !== null).length} nach 2 Wochen gemessen`
    + `${ohne.length ? ` · ohne Kerzen: ${ohne.join(", ")}` : ""} · ${Math.round((Date.now() - start) / 1000)} s`;
}

/** Nur neu rechnen, wenn die letzte Rechnung älter als 6 Tage ist. */
export async function rueckrechnungWennFaellig(): Promise<string> {
  const trading = createTradingClient();
  if (!trading) return "Trading-DB nicht verbunden";
  const { data, error } = await trading.from("makro_rueckrechnung").select("gerechnet_am").limit(1);
  if (error) return `übersprungen: ${error.message}`;
  const zuletzt = data?.[0]?.gerechnet_am ? Date.parse(String(data[0].gerechnet_am)) : 0;
  if (Date.now() - zuletzt < 6 * 86_400_000) return "aktuell (wöchentlich neu)";
  return rechneZurueck();
}

export async function ladeRueckrechnung(): Promise<(RueckZeile & { gerechnet_am: string })[]> {
  const trading = createTradingClient();
  if (!trading) return [];
  const out: (RueckZeile & { gerechnet_am: string })[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await trading.from("makro_rueckrechnung").select("*")
      .order("woche", { ascending: true }).range(von, von + 999);
    if (error || !data) break;
    for (const r of data as Record<string, unknown>[]) {
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      out.push({
        woche: String(r.woche), paar: String(r.paar), seite: r.seite as "long" | "short",
        klasse: r.klasse as "A" | "B", stark: String(r.stark), schwach: String(r.schwach),
        score_stark: Number(r.score_stark), score_schwach: Number(r.score_schwach), abstand: Number(r.abstand),
        einstieg: n(r.einstieg),
        prozent_1w: n(r.prozent_1w), prozent_2w: n(r.prozent_2w), prozent_3w: n(r.prozent_3w),
        pips_1w: n(r.pips_1w), pips_2w: n(r.pips_2w), pips_3w: n(r.pips_3w),
        erwartung: r.erwartung as "metaquotes" | "konsens", gerechnet_am: String(r.gerechnet_am),
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}
