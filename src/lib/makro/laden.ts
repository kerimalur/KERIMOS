import "server-only";
import { createClient } from "@/lib/supabase/server";
import { G8 } from "@/lib/supabase/trading";
import { ladeFuerStichtag } from "@/lib/confluence/daten";
import { cotBildFuer } from "@/lib/confluence/cot-divergenz";
import { werteFuer, baueRegime, type RegimeLage } from "@/lib/confluence/faktoren";
import { heuteISO } from "@/lib/time";
import {
  bewerteWaehrung, rangliste,
  type Eingabe, type HandWert, type RangZeile, type Umfeld, type Zyklus,
} from "@/lib/makro/bewertung";
import { montyAbgleich, type Abgleich, type CotStand } from "@/lib/makro/monty-abgleich";

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
  /** Wann der FRED-Lauf zuletzt durch war, und was er gemeldet hat. */
  sync: { gelaufen: string | null; bericht: Record<string, string> };
  zeilen: RangZeile[];
  umfeld: Umfeld;
  regime: RegimeLage;
  /** Notizen zur Notenbank je Währung. */
  notizen: Record<string, string>;
  zyklen: Record<string, Zyklus | null>;
  /** Rohwerte der Handeingaben, für das Formular. */
  hand: Record<string, Partial<Record<string, HandWert>>>;
  ereignisse: Ereignis[];
  /**
   * Monty als Gegenprobe: stimmen die Commercials mit der Rangliste überein?
   *
   * Kein zweites Ranking mehr. Am 26.09.2026 ist der Q-Score ersatzlos
   * entfallen und Monty von einer eigenen Seite zu dieser einen Spalte
   * geworden — zwei Ranglisten, die dasselbe Paar unterschiedlich bewerten,
   * kosten bei jedem Blick eine Entscheidung und liefern keine.
   */
  monty: Abgleich;
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

  const [markt, werteRes, reihenRes, syncRes, lageRes, ereignisRes] = await Promise.all([
    ladeFuerStichtag(stichtag).catch(() => null),
    supabase.from("makro_werte").select("ccy, feld, wert, vorwert, stand, quelle"),
    // Automatisch geholte Reihen: die letzten zwei Werte je Feld reichen —
    // der jüngste ist der Stand, der davor macht den Trendpfeil.
    // Die View liefert je Reihe nur die jüngsten zwei Werte (Migration 30).
    supabase.from("makro_reihen_stand").select("ccy, feld, datum, wert, serie")
      .order("datum", { ascending: false }),
    supabase.from("makro_sync").select("gelaufen, bericht").eq("id", 1).maybeSingle(),
    supabase.from("makro_lage").select("ccy, zyklus, notiz"),
    supabase.from("makro_ereignisse")
      .select("id, titel, datum, bis, profitiert, leidet, notiz")
      .order("datum", { ascending: false }).limit(20),
  ]);

  const hand: Record<string, Partial<Record<string, HandWert>>> = {};

  /*
   * Zuerst die automatischen Reihen, danach die Handeingaben — so gewinnt
   * eine Zahl, die Kerim selbst eingetragen hat, immer. Das ist Absicht: die
   * OECD-Reihen hinken zwei bis sechs Wochen hinterher, und wer den frischen
   * Wert kennt, soll ihn setzen können, ohne dass der Cron ihn überschreibt.
   */
  const jeSerie = new Map<string, { datum: string; wert: number; serie: string }[]>();
  for (const r of (reihenRes.data ?? []) as Record<string, unknown>[]) {
    const schluessel = `${r.ccy}|${r.feld}`;
    const liste = jeSerie.get(schluessel) ?? [];
    if (liste.length < 2) {
      liste.push({ datum: String(r.datum), wert: Number(r.wert), serie: String(r.serie) });
      jeSerie.set(schluessel, liste);
    }
  }
  for (const [schluessel, werte] of jeSerie) {
    const [ccy, feld] = schluessel.split("|");
    hand[ccy] = hand[ccy] ?? {};
    // Periodenlänge aus dem Abstand der letzten zwei Werte: 1 = monatlich,
    // 3 = Quartal, 12 = Jahr. Daran hängt, ab wann ein Wert veraltet ist.
    const periode = werte[1]
      ? Math.max(1, Math.round((Date.parse(werte[0].datum) - Date.parse(werte[1].datum)) / (30.44 * 86_400_000)))
      : 1;
    hand[ccy][feld] = {
      wert: werte[0]?.wert ?? null,
      vorwert: werte[1]?.wert ?? null,
      stand: werte[0]?.datum ?? null,
      // Ältere Läufe schrieben nur die FRED-ID, neuere den ganzen Namen.
      quelle: werte[0] ? (werte[0].serie.includes("·") ? werte[0].serie : `FRED · ${werte[0].serie}`) : null,
      periode,
    };
  }

  for (const r of (werteRes.data ?? []) as Record<string, unknown>[]) {
    const ccy = String(r.ccy);
    hand[ccy] = hand[ccy] ?? {};
    const eigen: HandWert = {
      wert: zahl(r.wert), vorwert: zahl(r.vorwert),
      stand: r.stand ? String(r.stand) : null,
      quelle: r.quelle ? `von Hand · ${r.quelle}` : "von Hand",
      periode: 1,
    };
    // Von Hand gewinnt — ausser die geholte Zahl ist neuer. Sonst bliebe ein
    // einmal eingetragener Wert für immer stehen, auch wenn die Quelle
    // längst weiter ist.
    const geholt = hand[ccy][String(r.feld)];
    if (geholt?.stand && eigen.stand && eigen.wert !== null) {
      const ende = new Date(`${geholt.stand}T12:00:00Z`);
      ende.setUTCMonth(ende.getUTCMonth() + (geholt.periode ?? 1));
      if (ende.toISOString().slice(0, 10) > eigen.stand) continue;
    }
    hand[ccy][String(r.feld)] = eigen;
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

  const sync = syncRes.data as { gelaufen: string | null; bericht: unknown } | null;

  const zeilen = rangliste(eingaben.map((e) => bewerteWaehrung(e, umfeld)));

  // Monty kommt aus denselben COT-Reihen wie Ebene 3 — kein zweiter Ladeweg,
  // der irgendwann von der Ebene abweichen könnte.
  const cotStaende: CotStand[] = G8.map((ccy) => {
    if (!markt) return { ccy, kommRang: null, retailRang: null, divergenz: 0 as const };
    const b = cotBildFuer(markt.daten, ccy, stichtag);
    return { ccy, kommRang: b.kommRang, retailRang: b.retailRang, divergenz: b.divergenz };
  });

  return {
    stichtag,
    sync: {
      gelaufen: sync?.gelaufen ?? null,
      bericht: (sync?.bericht && typeof sync.bericht === "object"
        ? sync.bericht as Record<string, string> : {}),
    },
    zeilen,
    umfeld, regime, notizen, zyklen, hand, ereignisse,
    monty: montyAbgleich(zeilen, cotStaende),
  };
}
