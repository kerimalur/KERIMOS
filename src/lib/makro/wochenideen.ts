import "server-only";
import { createTradingClient, G8 } from "@/lib/supabase/trading";
import { PAARE } from "@/lib/trading/journal";
import { holeTageskerzen } from "@/lib/trading/kerzen";
import { ladeMakro } from "./laden";
import { paarIdeen } from "./bewertung";
import { makroDb } from "./speichern";
import { ladeUrteile } from "./releases-laden";
import { kurzform, paarKlasse } from "./urteil";
import { HORIZONTE, messbarAb, messe, montagVon } from "./wochenideen-rechnen";

/**
 * Die Wochenaussicht (29.09.2026).
 *
 * Einmal pro Woche — beim ersten Lauf ab Montag — werden die Paar-Ideen des
 * Makro-Terminals festgehalten: Klasse A (stark gegen schwach) und B (stark
 * gegen neutral), mit dem Urteil beider Währungen. Danach misst jeder Lauf
 * nach, wie die Paare nach 1, 2 und 3 Wochen standen. Das ist der ehrliche
 * Test des Urteils: niemand kannte beim Festhalten die Zukunft.
 */

export interface WochenIdee {
  id: string;
  woche: string;
  paar: string;
  seite: "long" | "short";
  klasse: "A" | "B";
  stark: string;
  schwach: string;
  score_stark: number | null;
  score_schwach: number | null;
  abstand: number | null;
  urteil: { stark: { wort: string; gruende: string[] }; schwach: { wort: string; gruende: string[] } } | null;
  einstieg: number | null;
  prozent_1w: number | null; prozent_2w: number | null; prozent_3w: number | null;
  pips_1w: number | null; pips_2w: number | null; pips_3w: number | null;
  einschaetzung: "zustimmen" | "zweifel" | "dagegen" | null;
  notiz: string | null;
  erstellt_am: string;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function ladeWochenideen(abWoche?: string): Promise<WochenIdee[]> {
  const db = createTradingClient();
  if (!db) return [];
  let q = db.from("makro_wochenideen").select("*").order("woche", { ascending: false }).order("klasse").order("abstand", { ascending: false });
  if (abWoche) q = q.gte("woche", abWoche);
  const { data, error } = await q.limit(1000);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), woche: String(r.woche), paar: String(r.paar),
    seite: r.seite as WochenIdee["seite"], klasse: r.klasse as WochenIdee["klasse"],
    stark: String(r.stark), schwach: String(r.schwach),
    score_stark: num(r.score_stark), score_schwach: num(r.score_schwach), abstand: num(r.abstand),
    urteil: (r.urteil as WochenIdee["urteil"]) ?? null,
    einstieg: num(r.einstieg),
    prozent_1w: num(r.prozent_1w), prozent_2w: num(r.prozent_2w), prozent_3w: num(r.prozent_3w),
    pips_1w: num(r.pips_1w), pips_2w: num(r.pips_2w), pips_3w: num(r.pips_3w),
    einschaetzung: (r.einschaetzung as WochenIdee["einschaetzung"]) ?? null,
    notiz: (r.notiz as string | null) ?? null,
    erstellt_am: String(r.erstellt_am),
  }));
}

/** Legt die Ideen der laufenden Woche an, falls es noch keine gibt. */
export async function erstelleWochenideen(jetzt = new Date()): Promise<string> {
  const db = createTradingClient();
  if (!db) return "Trading-DB nicht verbunden";
  const woche = montagVon(jetzt);
  const { count } = await db.from("makro_wochenideen").select("id", { count: "exact", head: true }).eq("woche", woche);
  if ((count ?? 0) > 0) return `Woche ${woche}: schon ${count} Ideen`;

  const dienst = makroDb() ?? undefined;
  const makro = await ladeMakro(dienst);
  const urteile = await ladeUrteile(makro.zeilen, G8, dienst);
  const ideen = paarIdeen(makro.zeilen.map((z) => ({ ...z, gesamt: urteile[z.ccy]?.score ?? null })), PAARE);
  const zeilen = ideen.map((i) => {
    const s = urteile[i.stark], w = urteile[i.schwach];
    const klasse = paarKlasse(s?.score ?? null, w?.score ?? null);
    if (!klasse || !s || !w) return null;
    const ks = kurzform(s), kw = kurzform(w);
    return {
      woche, paar: i.paar, seite: i.seite === "Long" ? "long" : "short", klasse,
      stark: i.stark, schwach: i.schwach, score_stark: s.score, score_schwach: w.score, abstand: i.abstand,
      urteil: { stark: { wort: ks.wort, gruende: ks.gruende }, schwach: { wort: kw.wort, gruende: kw.gruende } },
    };
  }).filter((z) => z !== null);
  if (zeilen.length === 0) return `Woche ${woche}: keine Idee mit genug Abstand`;
  const { error } = await db.from("makro_wochenideen").insert(zeilen);
  if (error) {
    return /makro_wochenideen/.test(error.message)
      ? "Tabelle makro_wochenideen fehlt — supabase/trading/07_makro_wochenideen.sql ausführen"
      : `Anlegen: ${error.message}`;
  }
  return `Woche ${woche}: ${zeilen.length} Ideen angelegt (${zeilen.filter((z) => z.klasse === "A").length} A)`;
}

/** Misst offene Ideen nach: Einstieg und die Stände nach 1, 2, 3 Wochen. */
export async function werteWochenideenAus(jetzt = Date.now()): Promise<string> {
  const db = createTradingClient();
  if (!db) return "Trading-DB nicht verbunden";
  const ab = new Date(jetzt - 35 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.from("makro_wochenideen")
    .select("id, woche, paar, seite, einstieg, prozent_1w, prozent_2w, prozent_3w")
    .gte("woche", ab).or("einstieg.is.null,prozent_3w.is.null");
  if (error) return `Auswerten: ${error.message}`;
  const offen = (data ?? []) as { id: string; woche: string; paar: string; seite: "long" | "short"; einstieg: number | null;
    prozent_1w: number | null; prozent_2w: number | null; prozent_3w: number | null }[];
  let gemessen = 0, ohneKerzen = 0;
  const kerzenJePaar = new Map<string, Awaited<ReturnType<typeof holeTageskerzen>>>();
  for (const idee of offen) {
    // Nichts zu tun, solange die Montagskerze noch nicht da sein kann.
    if (jetzt < Date.parse(`${idee.woche}T00:00:00Z`)) continue;
    const seit = new Date(Date.parse(`${idee.woche}T00:00:00Z`) - 5 * 86_400_000).toISOString().slice(0, 10);
    const schluessel = `${idee.paar}|${seit}`;
    if (!kerzenJePaar.has(schluessel)) kerzenJePaar.set(schluessel, await holeTageskerzen(idee.paar, seit));
    const kerzen = kerzenJePaar.get(schluessel)!;
    if (kerzen.length === 0) { ohneKerzen++; continue; }
    const m = messe(kerzen, idee.woche, idee.seite, idee.paar, jetzt);
    const update: Record<string, number> = {};
    if (m.einstieg !== null && idee.einstieg === null) update.einstieg = m.einstieg;
    for (const n of HORIZONTE) {
      if (jetzt < messbarAb(idee.woche, n)) continue;
      if (m.prozent[n] === undefined) continue;
      update[`kurs_${n}w`] = m.kurse[n]!;
      update[`prozent_${n}w`] = m.prozent[n]!;
      update[`pips_${n}w`] = m.pips[n]!;
    }
    if (Object.keys(update).length === 0) continue;
    const { error: e } = await db.from("makro_wochenideen").update(update).eq("id", idee.id);
    if (!e) gemessen++;
  }
  return `${gemessen} Ideen nachgemessen${ohneKerzen ? `, ${ohneKerzen} ohne Kerzen (Screener-Backend schläft?)` : ""}`;
}

export async function wochenideenLauf(): Promise<string> {
  const a = await erstelleWochenideen().catch((e) => `Anlegen: ${e instanceof Error ? e.message : "Fehler"}`);
  const b = await werteWochenideenAus().catch((e) => `Auswerten: ${e instanceof Error ? e.message : "Fehler"}`);
  return `${a} · ${b}`;
}
