import "server-only";
import { createTradingClient, G8 } from "@/lib/supabase/trading";
import { holeTageskerzen } from "@/lib/trading/kerzen";
import { ladeMakro } from "./laden";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ladeReleases, ladeUrteile } from "./releases-laden";
import { ladeWochenideen, type WochenIdee } from "./wochenideen";
import { messe, montagVon } from "./wochenideen-rechnen";
import type { Release } from "./releases";
import type { UrteilBild } from "./urteil";

/**
 * Wochenrückblick (11.10.2026) — der Sonntags-Blick auf die vergangene Woche.
 *
 * Vier Fragen:
 *   1. Datenalter   — wie aktuell ist alles, worauf das Urteil beruht?
 *   2. Modell       — wie wären die festgehaltenen Paar-Ideen der Woche gelaufen?
 *   3. News         — welche Veröffentlichungen wichen am meisten ab, und wie
 *                     hat die Währung am selben Tag reagiert?
 *   4. Nächste Woche — Ampel je Währung: Urteil brauchbar oder veraltet?
 *
 * Ehrlichkeit vor Vollständigkeit: fehlt etwas (Kurse, Ideen), steht das so
 * da — es wird nichts nachträglich "festgehalten", denn ein Urteil, das erst
 * nach der Woche entsteht, wäre kein Test.
 */

const TAG_MS = 86_400_000;

export type Ampel = "gut" | "warn" | "schlecht";

export interface DatenStand {
  name: string;
  stand: string | null;
  alterTage: number | null;
  ampel: Ampel;
  hinweis: string;
}

export interface IdeeMessung {
  idee: WochenIdee;
  prozent: number | null;
  pips: number | null;
}

export interface NewsReaktion {
  release: Release;
  paar: string | null;
  /** Bewegung der Währung am Tag der Veröffentlichung in %, plus = Währung stärker. */
  reaktion: number | null;
  /** Ging die Währung in die Richtung der Überraschung? null = nicht messbar. */
  inRichtung: boolean | null;
}

export interface NaechsteWoche {
  ccy: string;
  urteil: UrteilBild;
  ampel: Ampel;
  grund: string;
  termine: Release[];
  letzteMeldung: string | null;
}

export interface Rueckblick {
  woche: string;
  wocheEnde: string;
  daten: DatenStand[];
  ideen: IdeeMessung[];
  ideenHinweis: string | null;
  kerzenErreichbar: boolean;
  news: NewsReaktion[];
  naechste: NaechsteWoche[];
}

/** Paar, an dem sich die Währung messen lässt, und das Vorzeichen für "Währung stärker". */
const MESSPAAR: Record<string, { paar: string; zeichen: 1 | -1 }> = {
  EUR: { paar: "EURUSD", zeichen: 1 },
  GBP: { paar: "GBPUSD", zeichen: 1 },
  AUD: { paar: "AUDUSD", zeichen: 1 },
  NZD: { paar: "NZDUSD", zeichen: 1 },
  CAD: { paar: "USDCAD", zeichen: -1 },
  CHF: { paar: "USDCHF", zeichen: -1 },
  JPY: { paar: "USDJPY", zeichen: -1 },
  USD: { paar: "EURUSD", zeichen: -1 },
};

const alter = (iso: string | null, jetzt: number) =>
  iso ? Math.max(0, (jetzt - Date.parse(iso)) / TAG_MS) : null;

function ampelNach(a: number | null, gut: number, warn: number): Ampel {
  if (a === null) return "schlecht";
  return a <= gut ? "gut" : a <= warn ? "warn" : "schlecht";
}

/** Standardwoche: am Wochenende die gerade zu Ende gegangene, sonst die letzte volle. */
export function standardWoche(jetzt = new Date()): string {
  const tag = jetzt.getUTCDay(); // 0 = So, 6 = Sa
  if (tag === 0 || tag === 6) return montagVon(jetzt);
  return montagVon(new Date(jetzt.getTime() - 7 * TAG_MS));
}

/** `dienst`: Service-Client für Läufe ohne Anmeldung (MCP). Ohne ihn liest die Funktion als angemeldeter Benutzer. */
export async function ladeRueckblick(woche: string, jetzt = Date.now(), dienst?: SupabaseClient): Promise<Rueckblick> {
  const db = createTradingClient();
  const start = Date.parse(`${woche}T00:00:00Z`);
  const ende = start + 5 * TAG_MS; // bis Samstag 00:00 UTC
  const wocheEnde = new Date(ende - TAG_MS).toISOString().slice(0, 10);
  const seit = new Date(start - 4 * TAG_MS).toISOString().slice(0, 10);

  /* ---------------------------------------------------------- Rohdaten */
  const kerzenCache = new Map<string, Awaited<ReturnType<typeof holeTageskerzen>>>();
  const kerzen = async (paar: string) => {
    if (!kerzenCache.has(paar)) kerzenCache.set(paar, await holeTageskerzen(paar, seit));
    return kerzenCache.get(paar)!;
  };

  const [alleIdeen, wochenReleases, kommende, makro] = await Promise.all([
    ladeWochenideen(woche),
    ladeReleases({ ab: new Date(start).toISOString(), bis: new Date(ende).toISOString(), db: dienst }),
    ladeReleases({ ab: new Date(jetzt).toISOString(), bis: new Date(jetzt + 8 * TAG_MS).toISOString(), db: dienst }),
    ladeMakro(dienst),
  ]);
  const urteile = await ladeUrteile(makro.zeilen, G8, dienst);

  /* ------------------------------------------------------- 1. Datenalter */
  const holeMax = async (tabelle: string, spalte: string): Promise<string | null> => {
    if (!db) return null;
    const { data } = await db.from(tabelle).select(spalte).order(spalte, { ascending: false }).limit(1).maybeSingle();
    const wert = (data as unknown as Record<string, unknown> | null)?.[spalte];
    return wert ? String(wert) : null;
  };
  const [kurseStand, mt5Stand, fredStand, cotStand] = await Promise.all([
    holeMax("price_daily", "date"),
    holeMax("mt5_kalender", "geholt_am"),
    holeMax("fred_series", "date"),
    holeMax("cot_reports", "report_date"),
  ]);
  const letztesIst = [...(await ladeReleases({ ab: new Date(jetzt - 14 * TAG_MS).toISOString(), bis: new Date(jetzt).toISOString(), db: dienst }))]
    .filter((r) => r.ist !== null).pop()?.event_time ?? null;
  const testKerzen = await kerzen("EURUSD");
  const kerzenErreichbar = testKerzen.length > 0;

  const a = (iso: string | null) => alter(iso, jetzt);
  const daten: DatenStand[] = [
    {
      name: "Kurse (Tabelle price_daily)", stand: kurseStand, alterTage: a(kurseStand),
      ampel: ampelNach(a(kurseStand), 3.5, 6),
      hinweis: "Der tägliche Lauf /api/marktdaten-sync?job=preise schreibt sie. Steht sie, fehlt der Cron oder OANDA lehnt ab.",
    },
    {
      name: "Kerzen für Messungen (Render-Backend)", stand: kerzenErreichbar ? new Date(jetzt).toISOString() : null,
      alterTage: kerzenErreichbar ? 0 : null, ampel: kerzenErreichbar ? "gut" : "schlecht",
      hinweis: kerzenErreichbar
        ? "Erreichbar. Die Wochenaussicht und dieser Rückblick holen ihre Kerzen noch von dort."
        : "Nicht erreichbar (Render schläft oder ist aus). Ohne Kerzen gibt es keine Messung.",
    },
    {
      name: "Kalender: letztes Ist", stand: letztesIst, alterTage: a(letztesIst),
      ampel: ampelNach(a(letztesIst), 3.5, 7),
      hinweis: "Letzte Veröffentlichung mit Ist-Wert. Am Wochenende sind 2 Tage normal.",
    },
    {
      name: "MT5-Kalender (Brücke)", stand: mt5Stand, alterTage: a(mt5Stand),
      ampel: ampelNach(a(mt5Stand), 1.5, 4),
      hinweis: "Läuft nur, solange der PC mit MetaTrader an ist.",
    },
    {
      name: "Zinsen und Renditen (FRED)", stand: fredStand, alterTage: a(fredStand),
      ampel: ampelNach(a(fredStand), 4, 8),
      hinweis: "Tageswerte, am Wochenende kommt nichts Neues.",
    },
    {
      name: "COT-Positionierung", stand: cotStand, alterTage: a(cotStand),
      ampel: ampelNach(a(cotStand), 10, 17),
      hinweis: "Wöchentlich, Stichtag Dienstag, veröffentlicht am Freitag.",
    },
  ];

  /* ----------------------------------------------------------- 2. Modell */
  const ideen: IdeeMessung[] = [];
  for (const idee of alleIdeen.filter((i) => i.woche === woche)) {
    const k = await kerzen(idee.paar);
    const m = k.length ? messe(k.map((c) => ({ zeit: c.zeit, open: c.open, close: c.close })), woche, idee.seite, idee.paar, jetzt) : null;
    ideen.push({ idee, prozent: m?.prozent[1] ?? null, pips: m?.pips[1] ?? null });
  }
  let ideenHinweis: string | null = null;
  if (ideen.length === 0) {
    ideenHinweis = `Für die Woche ab ${woche} wurden keine Paar-Ideen festgehalten (der Montags-Lauf der Wochenaussicht ist nicht gelaufen). `
      + "Nachträglich festgehalten würde das heutige Urteil benutzt, das die Woche schon kennt — das wäre kein Test.";
  } else if (!kerzenErreichbar) {
    ideenHinweis = "Die Kerzen sind nicht erreichbar, deshalb ist die Woche nicht gemessen.";
  }

  /* ------------------------------------------------------------- 3. News */
  const wichtig = wochenReleases
    .filter((r) => r.ist !== null && r.z !== null && G8.includes(r.ccy as (typeof G8)[number])
      && ["high", "medium"].includes((r.impact ?? "").toLowerCase()))
    .sort((x, y) => Math.abs(y.z ?? 0) - Math.abs(x.z ?? 0))
    .slice(0, 12);
  const news: NewsReaktion[] = [];
  for (const r of wichtig) {
    const mp = MESSPAAR[r.ccy];
    let reaktion: number | null = null;
    if (mp) {
      const t = Date.parse(r.event_time);
      const kerze = (await kerzen(mp.paar)).find((c) => {
        const s = Date.parse(c.zeit);
        return t >= s && t < s + TAG_MS;
      });
      if (kerze) reaktion = Math.round(((kerze.close / kerze.open - 1) * 100 * mp.zeichen) * 100) / 100;
    }
    news.push({
      release: r, paar: mp?.paar ?? null, reaktion,
      inRichtung: reaktion === null || r.z === null || r.z === 0 ? null : (reaktion > 0) === (r.z > 0),
    });
  }

  /* --------------------------------------------------- 4. Nächste Woche */
  const naechste: NaechsteWoche[] = G8.map((ccy) => {
    const u = urteile[ccy];
    const eigene = wochenReleases.filter((r) => r.ccy === ccy && r.ist !== null);
    const letzte = eigene.length ? eigene[eigene.length - 1].event_time : null;
    const fehlend = u.kern.filter((k) => k.fehlt).length;
    let ampel: Ampel = "gut";
    let grund = "Kernzahlen vollständig, Urteil gestützt.";
    if (u.wort === "keine Daten" || u.score === null) {
      ampel = "schlecht"; grund = "Keine belastbaren Daten — nicht benutzen.";
    } else if (fehlend >= Math.ceil(u.kern.length / 3)) {
      ampel = "warn"; grund = `${fehlend} von ${u.kern.length} Kernzahlen fehlen — Urteil nur mit Vorsicht.`;
    } else if (!kerzenErreichbar && kurseStand && (a(kurseStand) ?? 99) > 6) {
      ampel = "warn"; grund = "Kurse zum Gegenprüfen veraltet.";
    } else if (fehlend > 0) {
      grund = `${fehlend} Kernzahl${fehlend === 1 ? "" : "en"} ohne Wert, Rest vollständig.`;
    }
    const termine = kommende
      .filter((r) => r.ccy === ccy && (r.impact ?? "").toLowerCase() === "high")
      .slice(0, 4);
    return { ccy, urteil: u, ampel, grund, termine, letzteMeldung: letzte };
  });

  return { woche, wocheEnde, daten, ideen, ideenHinweis, kerzenErreichbar, news, naechste };
}
