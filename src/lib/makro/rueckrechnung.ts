import "server-only";
import { createTradingClient, G8 } from "@/lib/supabase/trading";
import { PAARE } from "@/lib/trading/journal";
import { holeTageskerzen } from "@/lib/trading/kerzen";
import { ladeFuerStichtag } from "@/lib/confluence/daten";
import { werteFuer, baueRegime } from "@/lib/confluence/faktoren";
import { plusTage } from "@/lib/confluence/reihen";
import { makroDb } from "./speichern";
import { ladeReleases } from "./releases-laden";
import { bewerteWaehrung, zinsSchritteAus, type Eingabe, type HandWert } from "./bewertung";
import { indexBis, type Release } from "./releases";
import { gesamtScore, kernWert } from "./urteil";
import { ideenAm, montage, type RueckIdee } from "./rueckrechnung-rechnen";
import { HORIZONTE, messe, montagVon } from "./wochenideen-rechnen";

/**
 * Rückrechnung ab 2024 (29.09.2026) — mit dem VOLLEN Live-Modell.
 *
 * Für jeden Montag wird genau das gerechnet, was das Terminal an diesem Tag
 * gezeigt hätte (bewerteWaehrung + Überraschungsindex, 40/35/25), aber nur
 * mit Daten, die an dem Tag schon veröffentlicht waren:
 *   - Leitzins, 2J-Rendite, Inflation, Realzins: dieselben Punkt-in-Zeit-
 *     Reihen wie Monty (lib/confluence), mit Veröffentlichungsverzug.
 *   - Zyklus: aus den Zinsschritten bis zu dem Montag.
 *   - PMI: aus den Veröffentlichungen (MT5/Forex Factory) vor dem Montag.
 *   - BIP, Arbeitslosenquote, Frühindikator, Leistungsbilanz: aus den
 *     Monatsreihen mit angenommenem Verzug (siehe VERZUG_FELD). Das sind die
 *     heutigen, evtl. revidierten Werte — die einzige Stelle, an der die
 *     Rückrechnung etwas besser weiss als der Montag damals.
 *   - Überraschung: wie live.
 * Nicht enthalten: Kerims Handeingaben, von Hand gesetzte Zyklen, Ereignisse
 * (die gab es damals nicht). Vor dem 28.06.2026 ist die Erwartung der
 * Veröffentlichungen die Prognose von MetaQuotes.
 *
 * Läuft komplett auf Vercel — Kerims PC muss dafür nicht an sein.
 */

const AB = "2024-03-04";
const KONSENS_AB = "2026-06-29";

/** Tage nach dem Periodenstichtag, ab denen ein Wert als veröffentlicht gilt. */
const VERZUG_FELD: Record<string, number> = {
  arbeitslos: 45, fruehindikator: 45, rendite_10j: 35, anleihe_nachfrage: 35,
  bip_yoy: 100, handelsbilanz: 400, staatsschulden: 400,
};

export interface RueckZeile extends RueckIdee {
  einstieg: number | null;
  prozent_1w: number | null; prozent_2w: number | null; prozent_3w: number | null;
  pips_1w: number | null; pips_2w: number | null; pips_3w: number | null;
  erwartung: "metaquotes" | "konsens";
}

interface ReihenPunkt { datum: string; wert: number; serie: string }

async function ladeReihen(): Promise<Map<string, ReihenPunkt[]>> {
  const db = makroDb();
  const out = new Map<string, ReihenPunkt[]>();
  if (!db) return out;
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db.from("makro_reihen").select("ccy, feld, datum, wert, serie")
      .order("datum", { ascending: true }).range(von, von + 999);
    if (error || !data) break;
    for (const r of data as Record<string, unknown>[]) {
      const k = `${r.ccy}|${r.feld}`;
      const l = out.get(k) ?? [];
      l.push({ datum: String(r.datum).slice(0, 10), wert: Number(r.wert), serie: String(r.serie) });
      out.set(k, l);
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** Stand eines Feldes am Montag: die letzten zwei veröffentlichten Werte. */
function handAm(reihe: ReihenPunkt[] | undefined, feld: string, montag: string): HandWert | null {
  if (!reihe) return null;
  const verzug = VERZUG_FELD[feld] ?? 45;
  const bekannt = reihe.filter((p) => plusTage(p.datum, verzug) <= montag);
  const a = bekannt[bekannt.length - 1];
  if (!a) return null;
  const b = bekannt[bekannt.length - 2];
  const periode = b ? Math.max(1, Math.round((Date.parse(a.datum) - Date.parse(b.datum)) / (30.44 * 86_400_000))) : 1;
  return { wert: a.wert, vorwert: b?.wert ?? null, stand: a.datum, quelle: a.serie, periode };
}

/** PMI am Montag aus den Veröffentlichungen: jüngster Wert und der davor. */
function pmiAm(key: string, releases: Release[], t: number): HandWert | null {
  const letzter = kernWert(key, releases, t - 1);
  if (!letzter || letzter.ist === null) return null;
  const davor = releases
    .filter((r) => r.serie === letzter.serie && r.ist !== null && r.event_time < letzter.event_time)
    .sort((a, b) => a.event_time.localeCompare(b.event_time))
    .at(-1);
  return {
    wert: letzter.ist, vorwert: davor?.ist ?? null,
    stand: letzter.event_time.slice(0, 10), quelle: letzter.titel, periode: 1,
  };
}

async function kerzenMitWiederholung(paar: string, seit: string) {
  const erste = await holeTageskerzen(paar, seit);
  if (erste.length > 0) return erste;
  await new Promise((r) => setTimeout(r, 3000));
  return holeTageskerzen(paar, seit);
}

/** Die Bausteine des Urteils je Montag und Währung — Grundlage für Rückrechnung und Varianten. */
export interface Komponenten {
  gesamt: number | null;
  zentralbank: number | null;
  wirtschaft: number | null;
  /** Überraschungsindex, auf −1…+1 gestaucht (wie im Urteil). */
  ueberraschung: number | null;
  zweiJahr: number | null;
  pmiIndustrie: HandWert | null;
  pmiDienste: HandWert | null;
}

/**
 * Für jeden Montag ab AB das, was das Terminal an diesem Tag gezeigt hätte —
 * aufgeteilt in seine Bausteine (02.10.2026, für den Varianten-Vergleich).
 */
export async function komponentenProWoche(): Promise<{ wochen: string[]; komponenten: Map<string, Record<string, Komponenten>> }> {
  const dienst = makroDb();
  const heute = new Date().toISOString().slice(0, 10);
  const [releases, reihen, markt] = await Promise.all([
    ladeReleases({ ab: "2023-09-01T00:00:00Z", db: dienst ?? undefined }),
    ladeReihen(),
    ladeFuerStichtag(heute),
  ]);
  const jeCcy: Record<string, Release[]> = {};
  for (const c of G8) jeCcy[c] = releases.filter((r) => r.ccy === c);

  const wochen = montage(AB, montagVon(new Date()));
  const komponenten = new Map<string, Record<string, Komponenten>>();
  for (const w of wochen) {
    const t = Date.parse(`${w}T00:00:00Z`);
    const tag = new Date(t);
    const werte = G8.map((ccy) => werteFuer(markt.daten, ccy, w));
    const mittel = (xs: (number | null)[]) => {
      const da = xs.filter((x): x is number => x !== null);
      return da.length ? da.reduce((a, b) => a + b, 0) / da.length : null;
    };
    const umfeld = {
      zinsSchnitt: mittel(werte.map((x) => x.leitzins ?? null)),
      realSchnitt: mittel(werte.map((x) => x.realzins ?? null)),
      regime: baueRegime(markt.daten, w).score,
    };
    const woche: Record<string, Komponenten> = {};
    G8.forEach((ccy, i) => {
      const wv = werte[i];
      const hand: Partial<Record<string, HandWert>> = {};
      for (const feld of Object.keys(VERZUG_FELD)) {
        const h = handAm(reihen.get(`${ccy}|${feld}`), feld, w);
        if (h) hand[feld] = h;
      }
      const pi = pmiAm("pmi_industrie", jeCcy[ccy], t);
      const pd = pmiAm("pmi_dienste", jeCcy[ccy], t);
      if (pi) hand.pmi_industrie = pi;
      if (pd) hand.pmi_dienste = pd;
      const verzug = markt.daten.leitzinsVerzug?.[ccy] ?? 1;
      const zins = (markt.daten.leitzins[ccy] ?? []).filter((p) => plusTage(p.datum, verzug) <= w);
      const e: Eingabe = {
        ccy, hand, zyklus: null,
        leitzins: wv.leitzins ?? null, leitzins6M: wv.leitzins6M ?? null,
        inflation: wv.cpi ?? null, realzins: wv.realzins ?? null,
        zweiJahr: wv.zweiJahr ?? null, erwartung: wv.erwartung ?? null,
        cotRang: wv.cotRang ?? null, risikoBeta: wv.risikoBeta ?? 0,
        ereignisse: [], zinsSchritte: zinsSchritteAus(zins),
      };
      const bild = bewerteWaehrung(e, umfeld, tag);
      const wi = bild.ebenen.find((x) => x.ebene === 1)?.score ?? null;
      const zb = bild.ebenen.find((x) => x.ebene === 2)?.score ?? null;
      const idx = indexBis(jeCcy[ccy], tag).wert;
      const ue = idx === null ? null : Math.max(-1, Math.min(1, idx / 1.5));
      woche[ccy] = {
        gesamt: gesamtScore(zb, wi, ue), zentralbank: zb, wirtschaft: wi, ueberraschung: ue,
        zweiJahr: wv.zweiJahr ?? null, pmiIndustrie: pi, pmiDienste: pd,
      };
    });
    komponenten.set(w, woche);
  }
  return { wochen, komponenten };
}

export async function rechneZurueck(): Promise<string> {
  const trading = createTradingClient();
  const dienst = makroDb();
  if (!trading || !dienst) return "Datenbank nicht verbunden";
  const start = Date.now();

  const { wochen, komponenten } = await komponentenProWoche();
  const ideen: RueckIdee[] = [];
  for (const w of wochen) {
    const scores: Record<string, number | null> = {};
    for (const ccy of G8) scores[ccy] = komponenten.get(w)?.[ccy]?.gesamt ?? null;
    ideen.push(...ideenAm(w, scores, PAARE));
  }

  const paare = [...new Set(ideen.map((i) => i.paar))];
  await holeTageskerzen("EURUSD", "2026-01-01"); // weckt das Screener-Backend
  const kerzen = new Map<string, Awaited<ReturnType<typeof holeTageskerzen>>>();
  for (const p of paare) kerzen.set(p, await kerzenMitWiederholung(p, "2024-02-20"));

  const jetzt = Date.now();
  const zeilen: RueckZeile[] = ideen.map((i) => {
    const m = messe(kerzen.get(i.paar) ?? [], i.woche, i.seite, i.paar, jetzt);
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

  // Komplett neu schreiben: ändern sich die Regeln, darf keine Zeile der
  // alten Regel stehen bleiben.
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
