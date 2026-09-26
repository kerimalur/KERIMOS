import "server-only";
import { createClient } from "@/lib/supabase/server";
import { G8, fetchRanking, type RankingCurrency } from "@/lib/supabase/trading";
import { ladeFuerStichtag } from "@/lib/confluence/daten";
import { werteFuer, baueRegime, type RegimeLage } from "@/lib/confluence/faktoren";
import { heuteISO } from "@/lib/time";
import {
  bewerteWaehrung, rangliste,
  type Eingabe, type HandWert, type RangZeile, type Umfeld, type Zyklus,
} from "@/lib/makro/bewertung";

/**
 * Lädt die fundamentale Lage zusammen — aus zwei Datenbanken.
 *
 * Trading-DB (über lib/confluence): Leitzins, Inflation, Realzins,
 * 2-Jahres-Rendite, COT, Risiko-Regime. KerimOS-DB: die von Hand gepflegten
 * Zahlen, der Zinszyklus und die laufenden Ereignisse.
 *
 * Fehlt eine Quelle, fehlt genau ihr Teil — nie die ganze Seite. Eine Zahl,
 * die nicht da ist, wird als „nicht da" gezeigt und nicht als null.
 */

export interface MakroBild {
  stichtag: string;
  zeilen: RangZeile[];
  umfeld: Umfeld;
  regime: RegimeLage;
  /** Notizen zur Notenbank je Währung. */
  notizen: Record<string, string>;
  zyklen: Record<string, Zyklus | null>;
  /** Rohwerte der Handeingaben, für das Formular. */
  hand: Record<string, Partial<Record<string, HandWert>>>;
  ereignisse: Ereignis[];
  /** Das ML-Ranking daneben — zum Vergleich, nicht als Urteil. */
  mlRanking: RankingCurrency[];
}

export interface Ereignis {
  id: string;
  titel: string;
  datum: string;
  bis: string | null;
  profitiert: string[];
  leidet: string[];
  notiz: string;
}

const zahl = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export async function ladeMakro(): Promise<MakroBild> {
  const stichtag = heuteISO();
  const supabase = await createClient();

  const [markt, werteRes, lageRes, ereignisRes, mlRanking] = await Promise.all([
    ladeFuerStichtag(stichtag).catch(() => null),
    supabase.from("makro_werte").select("ccy, feld, wert, vorwert, stand, quelle"),
    supabase.from("makro_lage").select("ccy, zyklus, notiz"),
    supabase.from("makro_ereignisse")
      .select("id, titel, datum, bis, profitiert, leidet, notiz")
      .order("datum", { ascending: false }).limit(20),
    fetchRanking().catch(() => []),
  ]);

  const hand: Record<string, Partial<Record<string, HandWert>>> = {};
  for (const r of (werteRes.data ?? []) as Record<string, unknown>[]) {
    const ccy = String(r.ccy);
    hand[ccy] = hand[ccy] ?? {};
    hand[ccy][String(r.feld)] = {
      wert: zahl(r.wert), vorwert: zahl(r.vorwert),
      stand: r.stand ? String(r.stand) : null,
      quelle: r.quelle ? String(r.quelle) : null,
    };
  }

  const zyklen: Record<string, Zyklus | null> = {};
  const notizen: Record<string, string> = {};
  for (const r of (lageRes.data ?? []) as Record<string, unknown>[]) {
    zyklen[String(r.ccy)] = (r.zyklus as Zyklus) ?? null;
    notizen[String(r.ccy)] = String(r.notiz ?? "");
  }

  const ereignisse: Ereignis[] = ((ereignisRes.data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      id: String(r.id),
      titel: String(r.titel ?? ""),
      datum: String(r.datum ?? "").slice(0, 10),
      bis: r.bis ? String(r.bis).slice(0, 10) : null,
      profitiert: Array.isArray(r.profitiert) ? (r.profitiert as string[]) : [],
      leidet: Array.isArray(r.leidet) ? (r.leidet as string[]) : [],
      notiz: String(r.notiz ?? ""),
    }));

  const regime: RegimeLage = markt
    ? baueRegime(markt.daten, stichtag)
    : { score: null, lage: "unbekannt", teile: [], fehlend: ["Trading-Datenbank"], datum: null, frische: "fehlt" };

  const marktWerte = G8.map((ccy) =>
    markt ? werteFuer(markt.daten, ccy, stichtag) : null);

  const mittel = (werte: (number | null)[]) => {
    const da = werte.filter((v): v is number => v !== null);
    return da.length === 0 ? null : da.reduce((s, v) => s + v, 0) / da.length;
  };

  const umfeld: Umfeld = {
    zinsSchnitt: mittel(marktWerte.map((w) => w?.leitzins ?? null)),
    realSchnitt: mittel(marktWerte.map((w) => w?.realzins ?? null)),
    regime: regime.score,
  };

  const eingaben: Eingabe[] = G8.map((ccy, i) => {
    const w = marktWerte[i];
    const treffer = ereignisse.filter(
      (e) => e.profitiert.includes(ccy) || e.leidet.includes(ccy));
    return {
      ccy,
      hand: hand[ccy] ?? {},
      zyklus: zyklen[ccy] ?? null,
      leitzins: w?.leitzins ?? null,
      leitzins6M: w?.leitzins6M ?? null,
      inflation: w?.cpi ?? null,
      realzins: w?.realzins ?? null,
      zweiJahr: w?.zweiJahr ?? null,
      erwartung: w?.erwartung ?? null,
      cotRang: w?.cotRang ?? null,
      risikoBeta: w?.risikoBeta ?? 0,
      ereignisse: treffer.map((e) => ({
        titel: e.titel,
        richtung: (e.profitiert.includes(ccy) ? 1 : -1) as 1 | -1,
      })),
    };
  });

  return {
    stichtag,
    zeilen: rangliste(eingaben.map((e) => bewerteWaehrung(e, umfeld))),
    umfeld, regime, notizen, zyklen, hand, ereignisse,
    mlRanking,
  };
}
