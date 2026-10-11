/**
 * Ein Durchlauf des Strategie-Labors (11.10.2026): alle 28 Paare, eine
 * Einstellung. Rein bis auf die Datenquelle, die von aussen kommt — so nutzen
 * der Server (Strategie-Labor in KerimOS) und das Terminal (tools/backtest)
 * denselben Code.
 */
import type { Kerze } from "../trading/zeitrahmen";
import { baueHtf, beruehrt, findeGvas, zuFrueh, type DreiD, type Gva } from "./gva";
import { sitzungsEnde } from "./zeit";
import {
  simuliereShort, spiegeln, strukturImpuls, strukturPunkte, tagesAtr, tagesOpen, zurueckSpiegeln,
  type Bar, type SetupErgebnis, type SetupStatus,
} from "./setup";
import { kennzahlen, type Kennzahlen, type TradeZeile } from "./auswertung";
import { pipGroesse, tageAusBars, zu4h, type LaborTf } from "./kerzen";

export interface LaufEinstellung {
  /** GVA-Erkennung wie im Pine: Toleranz in % von Body A, 2. Kerze mindestens X % grösser. */
  gvaTol: number;
  gvaK2: number;
  /** Zusätzlich Wochen-GVAs (Set 2 im Pine). */
  wochen: boolean;
  /**
   * Struktur, die gebrochen werden muss:
   *  impuls4h — Ursprung des letzten Impulses auf 4h (ZigZag, Gegenbewegungen < impulsAtr × Tages-ATR zählen nicht)
   *  4h       — letztes 4h-Swing vor dem Treffer
   *  chart    — letztes Swing auf dem Ausführungs-Zeitrahmen
   */
  strukturTf: "impuls4h" | "chart" | "4h";
  impulsAtr: number;
  tf: LaborTf;
  bos: "schluss" | "docht";
  swingN: number;
  dailyOpen: boolean;
  tolPips: number;
  /** Frist ab Treffer bis zum Einstieg, in Handelstagen. */
  maxTage: number;
  einstiegFib: number;
  tpFib: number;
  /** Kosten je Trade in Pips (Spread + Kommission). */
  kostenMajors: number;
  kostenCrosses: number;
}

export const LAUF_STANDARD: LaufEinstellung = {
  gvaTol: 40, gvaK2: 25, wochen: false, strukturTf: "impuls4h", impulsAtr: 0.75,
  tf: "1h", bos: "schluss", swingN: 2, dailyOpen: true, tolPips: 3, maxTage: 10,
  einstiegFib: 0.618, tpFib: -1, kostenMajors: 1.2, kostenCrosses: 2.2,
};

export const PAARE_28 = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "CADJPY", "CHFJPY", "EURAUD",
  "EURCAD", "EURCHF", "EURNZD", "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD",
  "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "NZDCAD", "NZDCHF", "NZDJPY",
];
const MAJORS = new Set(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"]);

export interface Datenquelle {
  /** Tageskerzen mit Handelstag-Datum (Mo–Fr), aufsteigend. */
  tage(paar: string): Promise<Kerze[]>;
  /** Stundenkerzen, aufsteigend. */
  stunden(paar: string): Promise<Bar[]>;
}

export interface LaufEreignis extends SetupErgebnis {
  paar: string;
  seite: "long" | "short";
  level: number;
  gvaTf: "3D" | "W";
  bStart: string;
  bEnde: string;
  rNetto: number | null;
  risikoPips: number | null;
}

export interface LaufErgebnis {
  ereignisse: LaufEreignis[];
  kennzahlen: Kennzahlen;
  zaehler: Record<SetupStatus | "treffer" | "mitBos" | "verworfen", number>;
  fenster: { von: string | null; bis: string | null };
  fehler: string[];
}

export async function fuehreLaufAus(
  e: LaufEinstellung, q: Datenquelle, paare: string[] = PAARE_28,
  meldung?: (text: string) => void,
): Promise<LaufErgebnis> {
  const ereignisse: LaufEreignis[] = [];
  const fehler: string[] = [];
  let verworfen = 0;
  let von: string | null = null, bis: string | null = null;
  const kerzenJeTag = e.tf === "1h" ? 24 : 6;

  // Vier Paare gleichzeitig: schnell genug, ohne Yahoo zu überrennen.
  const warteschlange = [...paare];
  async function arbeiter() {
    for (let paar = warteschlange.shift(); paar; paar = warteschlange.shift()) {
      try {
        const [tageRoh, stunden] = await Promise.all([q.tage(paar), q.stunden(paar)]);
        const bars = e.tf === "1h" ? stunden : zu4h(stunden);
        if (bars.length < 50) { fehler.push(`${paar}: zu wenig Kerzen`); continue; }
        if (!von || bars[0].tag < von) von = bars[0].tag;
        if (!bis || bars[bars.length - 1].tag > bis) bis = bars[bars.length - 1].tag;
        const letzter = tageRoh[tageRoh.length - 1]?.zeit ?? "0000";
        const tage = [...tageRoh, ...tageAusBars(stunden).filter((k) => k.zeit > letzter)];
        const gvaEinst = { tolProzent: e.gvaTol ?? 40, k2Prozent: e.gvaK2 ?? 25, mindestAbstand: 1 };
        const reihen: DreiD[] = [baueHtf(tage, "3D"), ...(e.wochen ? [baueHtf(tage, "W")] : [])];
        const gvas: { g: Gva; d: DreiD }[] = reihen.flatMap((d) => findeGvas(d, gvaEinst).map((g) => ({ g, d })));
        const pip = pipGroesse(paar);
        const einst = {
          bos: e.bos, swingN: e.swingN, dailyOpen: e.dailyOpen, tolPreis: e.tolPips * pip,
          einstiegFib: e.einstiegFib, tpFib: e.tpFib,
          maxKerzenBisEinstieg: Math.round(e.maxTage * kerzenJeTag), maxKerzenImTrade: 60 * kerzenJeTag,
        };
        const STUNDE = 3_600_000;
        const ausfDauer = e.tf === "1h" ? STUNDE : 4 * STUNDE;
        const gespiegelt = spiegeln(bars);
        // Struktur: Impuls-Ursprung auf 4h, 4h-Swing oder Swing auf dem Ausführungs-Zeitrahmen.
        const art = e.strukturTf ?? "4h";
        const strukturBars = art === "chart" ? bars : zu4h(stunden);
        const strukturDauer = art === "chart" ? ausfDauer : 4 * STUNDE;
        const atr = tagesAtr(tage);
        const baueStruktur = (b: Bar[]) => (art === "impuls4h"
          ? strukturImpuls(b, (tag) => atr.get(tag), e.impulsAtr ?? 0.75, strukturDauer)
          : strukturPunkte(b, e.swingN, strukturDauer));
        const vor = {
          short: { bars, struktur: baueStruktur(strukturBars), open: tagesOpen(bars) },
          long: { bars: gespiegelt, struktur: baueStruktur(spiegeln(strukturBars)), open: tagesOpen(gespiegelt) },
        };
        const ersterVollerTag = bars.find((b, i) => i > 0 && b.tag !== bars[i - 1].tag)?.tag ?? bars[0].tag;

        for (const { g, d } of gvas) {
          // Vor dem Intraday-Fenster schon getroffen → für diesen Lauf ohne Belang.
          let schonVorher = false;
          for (const k of tage) {
            if (k.zeit <= g.bEnde) continue;
            if (k.zeit >= ersterVollerTag) break;
            if (beruehrt(g, k.high, k.low)) { schonVorher = true; break; }
          }
          if (schonVorher) continue;
          const bEndeMs = sitzungsEnde(g.bEnde);
          let start = -1;
          for (let i = 0; i < bars.length; i++) {
            if (bars[i].t < bEndeMs || bars[i].tag < ersterVollerTag) continue;
            if (beruehrt(g, bars[i].h, bars[i].l)) { start = i; break; }
          }
          if (start < 0) continue;
          if (zuFrueh(d, g, bars[start].tag)) { verworfen++; continue; }
          const s = vor[g.seite];
          const r0 = simuliereShort(s.bars, start, s.struktur, s.open, einst);
          const r = g.seite === "long" ? zurueckSpiegeln(r0) : r0;
          const risikoPips = r0.risiko === null ? null : r0.risiko / pip;
          const kosten = MAJORS.has(paar) ? e.kostenMajors : e.kostenCrosses;
          const rNetto = r0.r === null || risikoPips === null || risikoPips <= 0 ? null : r0.r - kosten / risikoPips;
          ereignisse.push({ ...r, paar, seite: g.seite, level: g.level, gvaTf: d.art, bStart: g.bStart, bEnde: g.bEnde, rNetto, risikoPips });
        }
        meldung?.(`${paar}: ${gvas.length} GVAs`);
      } catch (err) {
        fehler.push(`${paar}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);

  ereignisse.sort((a, b) => a.trefferT - b.trefferT);
  const trades: TradeZeile[] = ereignisse
    .filter((x) => x.r !== null && x.rNetto !== null && (x.status === "tp" || x.status === "sl" || x.status === "zeit"))
    .map((x) => ({
      paar: x.paar, seite: x.seite, trefferT: x.trefferT, einstiegT: x.einstiegT!, ausstiegT: x.ausstiegT!,
      status: x.status as TradeZeile["status"], rBrutto: x.r!, rNetto: x.rNetto!,
    }));
  const zaehler = {
    treffer: ereignisse.length, mitBos: ereignisse.filter((x) => x.bosT !== null).length, verworfen,
    verfallen: 0, kein_einstieg: 0, ungueltig: 0, tp: 0, sl: 0, zeit: 0, offen: 0,
  } as LaufErgebnis["zaehler"];
  for (const x of ereignisse) zaehler[x.status]++;
  return { ereignisse, kennzahlen: kennzahlen(trades), zaehler, fenster: { von, bis }, fehler };
}
