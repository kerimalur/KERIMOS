import "server-only";
import { createTradingClient, G8 } from "@/lib/supabase/trading";
import { PAARE } from "@/lib/trading/journal";
import { holeTageskerzen } from "@/lib/trading/kerzen";
import { komponentenProWoche } from "./rueckrechnung";
import {
  VARIANTEN, messeHorizonte, rangIdeen, variantenScores,
  type KompWoche, type VariantenZeile,
} from "./varianten-rechnen";

/**
 * Varianten-Vergleich rechnen und speichern (02.10.2026). Läuft auf Vercel
 * (Aufruf über /api/makro-sync?job=varianten oder den Knopf auf der Seite
 * Makro-Backtest) — dort sind Datenbank und Kerzen erreichbar.
 */
export async function rechneVarianten(): Promise<string> {
  const trading = createTradingClient();
  if (!trading) return "Trading-DB nicht verbunden";
  const start = Date.now();
  const { wochen, komponenten } = await komponentenProWoche();

  const komp = new Map<string, Record<string, KompWoche>>();
  for (const w of wochen) {
    const roh = komponenten.get(w) ?? {};
    const k: Record<string, KompWoche> = {};
    for (const c of G8) {
      const r = roh[c];
      const niveau = [r?.pmiIndustrie?.wert, r?.pmiDienste?.wert].filter((x): x is number => typeof x === "number");
      const richt = [r?.pmiIndustrie, r?.pmiDienste]
        .filter((h): h is NonNullable<typeof h> => !!h && h.wert !== null && h.vorwert !== null)
        .map((h) => (h.wert as number) - (h.vorwert as number));
      k[c] = {
        gesamt: r?.gesamt ?? null, zentralbank: r?.zentralbank ?? null, wirtschaft: r?.wirtschaft ?? null,
        ueberraschung: r?.ueberraschung ?? null, zweiJahr: r?.zweiJahr ?? null,
        pmiRichtung: richt.length ? richt.reduce((a, b) => a + b, 0) / richt.length : null,
        pmiNiveau: niveau.length ? niveau.reduce((a, b) => a + b, 0) / niveau.length - 50 : null,
      };
    }
    komp.set(w, k);
  }

  const scores = variantenScores(wochen, komp);
  const ideen: Omit<VariantenZeile, "p1" | "p2" | "p4" | "p8">[] = [];
  for (const v of VARIANTEN) {
    for (const w of wochen) {
      for (const i of rangIdeen(scores.get(v.key)!.get(w) ?? {}, PAARE)) {
        ideen.push({ variante: v.key, woche: w, paar: i.paar, seite: i.seite, extrem: i.extrem });
      }
    }
  }

  const paare = [...new Set(ideen.map((i) => i.paar))];
  await holeTageskerzen("EURUSD", "2026-01-01"); // weckt das Screener-Backend
  const kerzen = new Map<string, Awaited<ReturnType<typeof holeTageskerzen>>>();
  for (const p of paare) {
    let k = await holeTageskerzen(p, "2024-02-20");
    if (k.length === 0) {
      await new Promise((r) => setTimeout(r, 3000));
      k = await holeTageskerzen(p, "2024-02-20");
    }
    kerzen.set(p, k);
  }

  const jetzt = Date.now();
  const zeilen: VariantenZeile[] = ideen.map((i) => {
    const m = messeHorizonte(kerzen.get(i.paar) ?? [], i.woche, i.seite, jetzt);
    return { ...i, p1: m[1] ?? null, p2: m[2] ?? null, p4: m[4] ?? null, p8: m[8] ?? null };
  });

  const { error: e1 } = await trading.from("makro_varianten").delete().gte("woche", "2000-01-01");
  if (e1) {
    return /makro_varianten/.test(e1.message)
      ? "Tabelle makro_varianten fehlt — supabase/trading/09_makro_varianten.sql ausführen"
      : `Löschen: ${e1.message}`;
  }
  const stempel = new Date().toISOString();
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error } = await trading.from("makro_varianten")
      .insert(zeilen.slice(i, i + 500).map((z) => ({ ...z, gerechnet_am: stempel })));
    if (error) return `Schreiben: ${error.message}`;
  }
  const ohne = paare.filter((p) => (kerzen.get(p) ?? []).length === 0);
  return `${VARIANTEN.length} Varianten, ${wochen.length} Wochen, ${zeilen.length} Ideen`
    + `${ohne.length ? ` · ohne Kerzen: ${ohne.join(", ")}` : ""} · ${Math.round((Date.now() - start) / 1000)} s`;
}

export async function ladeVarianten(): Promise<{ zeilen: VariantenZeile[]; gerechnetAm: string | null }> {
  const trading = createTradingClient();
  if (!trading) return { zeilen: [], gerechnetAm: null };
  const zeilen: VariantenZeile[] = [];
  let gerechnetAm: string | null = null;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  for (let von = 0; ; von += 1000) {
    const { data, error } = await trading.from("makro_varianten").select("*")
      .order("woche", { ascending: true }).range(von, von + 999);
    if (error || !data) break;
    for (const r of data as Record<string, unknown>[]) {
      gerechnetAm ??= String(r.gerechnet_am);
      zeilen.push({
        variante: String(r.variante), woche: String(r.woche).slice(0, 10), paar: String(r.paar),
        seite: r.seite as "long" | "short", extrem: Boolean(r.extrem),
        p1: n(r.p1), p2: n(r.p2), p4: n(r.p4), p8: n(r.p8),
      });
    }
    if (data.length < 1000) break;
  }
  return { zeilen, gerechnetAm };
}
