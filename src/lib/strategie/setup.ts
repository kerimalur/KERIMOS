/**
 * Einstieg nach dem GVA-Treffer als feste Regel — Stand Pine „GVA → BOS v0.2"
 * (11.10.2026, nach Kerims Kontrolle am AUDCAD-Setup Ende August).
 *
 * Short (Long spiegelbildlich, über gespiegelte Preise × −1):
 *  1. Treffer der Top-GVA. Das Hoch H seit dem Treffer wird nachgeführt.
 *  2. Struktur = letztes bestätigtes Swing-Tief VOR dem Treffer — wahlweise auf
 *     dem Ausführungs-Zeitrahmen oder auf 4h (Kerim 11.10.: „wirklich das
 *     4-Stunden-Swing", sonst ist das Setup zu schnell).
 *     BOS = eine Kerze schliesst (oder sticht per Docht) unter die Struktur,
 *     und die Struktur liegt unter dem Daily Open des Tages (abschaltbar).
 *  3. Nach dem BOS: L = tiefstes Tief seit H (nachgeführt).
 *     Fibonacci H→L: Einstieg Limit bei 0.618, SL = H, TP bei −1.
 *     Wird H vor dem Einstieg überschritten:
 *       Schluss höchstens `tolPreis` darüber (oder nur Docht) → neues H,
 *       neuer BOS nötig (Struktur = letztes Swing-Tief vor dem neuen H).
 *       Schluss klar darüber → ungültig.
 *     (Weil der Einstieg unter H liegt, wird er in der Regel vorher gefüllt —
 *     dann ist das Überschreiten von H schlicht der SL.)
 *  4. Frist: ohne BOS bzw. ohne Einstieg innerhalb `maxKerzenBisEinstieg`
 *     Kerzen nach dem Treffer → verfallen bzw. kein Einstieg.
 *  Bei Unklarheit innerhalb einer Kerze zählt immer das schlechtere Ergebnis.
 */

export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Handelstag (17:00 New York). */
  tag: string;
}

export interface SetupEinstellung {
  bos: "schluss" | "docht";
  swingN: number;
  dailyOpen: boolean;
  /** Toleranz über H in Preis (Short-Sicht). */
  tolPreis: number;
  einstiegFib: number;
  tpFib: number;
  maxKerzenBisEinstieg: number;
  maxKerzenImTrade: number;
}

export const SETUP_STANDARD: SetupEinstellung = {
  bos: "schluss", swingN: 2, dailyOpen: true, tolPreis: 0, einstiegFib: 0.618, tpFib: -1,
  maxKerzenBisEinstieg: 240, maxKerzenImTrade: 2000,
};

export type SetupStatus = "verfallen" | "kein_einstieg" | "ungueltig" | "tp" | "sl" | "zeit" | "offen";

export interface SetupErgebnis {
  status: SetupStatus;
  trefferT: number;
  strukturT: number | null;
  struktur: number | null;
  bosT: number | null;
  hochT: number | null;
  hoch: number | null;
  tiefT: number | null;
  tief: number | null;
  einstiegT: number | null;
  einstieg: number | null;
  sl: number | null;
  tp: number | null;
  ausstiegT: number | null;
  /** Ergebnis in R vor Kosten (null, wenn kein Trade). */
  r: number | null;
  /** Abstand Einstieg–SL in Preis. */
  risiko: number | null;
  /** Wie oft das H vor dem Einstieg neu gesetzt wurde (Docht/Toleranz). */
  neueHochs: number;
}

/** Für Long: Preise spiegeln, damit dieselbe Short-Logik gilt. */
export function spiegeln(bars: Bar[]): Bar[] {
  return bars.map((b) => ({ t: b.t, tag: b.tag, o: -b.o, h: -b.l, l: -b.h, c: -b.c }));
}

/** Ergebnis aus der gespiegelten Rechnung zurück in echte Preise. */
export function zurueckSpiegeln(r: SetupErgebnis): SetupErgebnis {
  const n = (x: number | null) => (x === null ? null : -x);
  return {
    ...r, struktur: n(r.struktur), hoch: n(r.hoch), tief: n(r.tief),
    einstieg: n(r.einstieg), sl: n(r.sl), tp: n(r.tp),
  };
}

/** Indizes der bestätigten Swing-Tiefs (strikt tiefer als n Kerzen links und rechts). */
export function swingTiefs(bars: Bar[], n: number): number[] {
  const out: number[] = [];
  for (let j = n; j < bars.length - n; j++) {
    let ok = true;
    for (let k = 1; k <= n && ok; k++) {
      if (!(bars[j].l < bars[j - k].l && bars[j].l < bars[j + k].l)) ok = false;
    }
    if (ok) out.push(j);
  }
  return out;
}

/** Ein Swing-Tief als Struktur: Kerze (Beginn/Ende), wann es bestätigt war, Preis. */
export interface StrukturPunkt {
  t: number;
  ende: number;
  bestaetigt: number;
  preis: number;
}

/** Swing-Tiefs einer Kerzenreihe als Strukturpunkte. `dauerMs` = Länge einer Kerze. */
export function strukturPunkte(bars: Bar[], n: number, dauerMs: number): StrukturPunkt[] {
  return swingTiefs(bars, n).map((j) => ({
    t: bars[j].t, ende: bars[j].t + dauerMs, bestaetigt: bars[j + n].t + dauerMs, preis: bars[j].l,
  }));
}

/**
 * Impuls-Ursprünge als Struktur (Kerim 11.10.: „das Hoch, von dem der letzte
 * Impuls startete"): ZigZag auf den übergebenen Kerzen (Short-Sicht → Tiefs).
 * Ein Tief gilt als Ursprung, sobald der Kurs danach um mindestens
 * `faktor × Tages-ATR` gestiegen ist — kleinere Gegenbewegungen (Range,
 * Konsolidierung) zählen nicht. Bestätigt ist es mit dem Ende der Kerze,
 * die diese Schwelle überschreitet: kein Blick in die Zukunft.
 */
export function strukturImpuls(
  bars: Bar[], atrVonTag: (tag: string) => number | undefined, faktor: number, dauerMs: number,
): StrukturPunkt[] {
  const out: StrukturPunkt[] = [];
  if (bars.length === 0) return out;
  let richtung: 1 | -1 = 1;
  let ext = bars[0].h, extI = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const atr = atrVonTag(b.tag);
    if (!atr) continue;
    const schwelle = faktor * atr;
    if (richtung === 1) {
      if (b.h > ext) { ext = b.h; extI = i; } else if (b.l < ext - schwelle) { richtung = -1; ext = b.l; extI = i; }
    } else if (b.l < ext) {
      ext = b.l; extI = i;
    } else if (b.h > ext + schwelle) {
      out.push({ t: bars[extI].t, ende: bars[extI].t + dauerMs, bestaetigt: b.t + dauerMs, preis: ext });
      richtung = 1; ext = b.h; extI = i;
    }
  }
  return out;
}

/** ATR(14) der Tageskerzen, je Handelstag der Wert vom Vortag (kein Blick in die Zukunft). */
export function tagesAtr(tage: { zeit: string; high: number; low: number; close: number }[], n = 14): Map<string, number> {
  const m = new Map<string, number>();
  const tr: number[] = [];
  for (let i = 0; i < tage.length; i++) {
    if (tr.length) m.set(tage[i].zeit, tr.reduce((a, x) => a + x, 0) / tr.length);
    if (i > 0) {
      const p = tage[i - 1].close, d = tage[i];
      tr.push(Math.max(d.high - d.low, Math.abs(d.high - p), Math.abs(d.low - p)));
      if (tr.length > n) tr.shift();
    }
  }
  return m;
}

/** Tagesöffnung je Handelstag (erste Kerze des Tages). */
export function tagesOpen(bars: Bar[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bars) if (!m.has(b.tag)) m.set(b.tag, b.o);
  return m;
}

/** Short-Logik ab dem Treffer-Index (Long: mit gespiegelten Reihen aufrufen). */
export function simuliereShort(
  bars: Bar[], start: number, struktur: StrukturPunkt[], open: Map<string, number>, e: SetupEinstellung = SETUP_STANDARD,
): SetupErgebnis {
  const res: SetupErgebnis = {
    status: "verfallen", trefferT: bars[start].t, strukturT: null, struktur: null, bosT: null,
    hochT: null, hoch: null, tiefT: null, tief: null, einstiegT: null, einstieg: null, sl: null, tp: null,
    ausstiegT: null, r: null, risiko: null, neueHochs: 0,
  };
  let H = -Infinity, hIdx = start, vor = start;
  let zustand: 0 | 1 = 0;
  let L = Infinity, lIdx = -1;
  const frist = start + e.maxKerzenBisEinstieg;

  // Letztes Swing-Tief, dessen Kerze vor `vorT` endete und das bis `jetztT` bestätigt war.
  const letztesTiefVor = (vorT: number, jetztT: number): StrukturPunkt | null => {
    let lo = 0, hi = struktur.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (struktur[mid].ende <= vorT) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    for (let k = best; k >= 0; k--) if (struktur[k].bestaetigt <= jetztT) return struktur[k];
    return null;
  };
  const merke = () => {
    res.hoch = H; res.hochT = bars[hIdx].t;
    if (lIdx >= 0) { res.tief = L; res.tiefT = bars[lIdx].t; }
  };

  for (let i = start; i < bars.length; i++) {
    const b = bars[i];
    if (i > frist) {
      merke();
      res.status = zustand === 0 ? "verfallen" : "kein_einstieg";
      return res;
    }
    if (zustand === 0) {
      if (b.h > H) { H = b.h; hIdx = i; }
      if (i <= hIdx) continue;
      const ref = letztesTiefVor(bars[vor].t, b.t);
      if (ref === null) continue;
      const rp = ref.preis;
      // Auch ohne BOS festhalten, auf welche Struktur gewartet wurde (für den Chart).
      res.strukturT = ref.t; res.struktur = rp;
      if (e.dailyOpen) {
        const d = open.get(b.tag);
        if (d === undefined || !(rp < d)) continue;
      }
      const bricht = e.bos === "schluss" ? b.c < rp : b.l < rp;
      if (!bricht) continue;
      zustand = 1;
      res.bosT = b.t; res.strukturT = ref.t; res.struktur = rp;
      L = Infinity; lIdx = -1;
      for (let k = hIdx; k <= i; k++) if (bars[k].l < L) { L = bars[k].l; lIdx = k; }
      continue;
    }
    // zustand 1: nach dem BOS, Limit bei der Einstiegs-Fib
    const spanne = H - L;
    const einstieg = L + e.einstiegFib * spanne;
    if (b.h >= einstieg) {
      const sl = H;
      const tp = L + e.tpFib * spanne;
      merke();
      Object.assign(res, { einstiegT: b.t, einstieg, sl, tp, risiko: sl - einstieg });
      if (b.h >= sl) { Object.assign(res, { status: "sl", ausstiegT: b.t, r: -1 }); return res; }
      const rTp = (einstieg - tp) / (sl - einstieg);
      for (let j = i + 1; j < bars.length; j++) {
        const x = bars[j];
        if (x.h >= sl) { Object.assign(res, { status: "sl", ausstiegT: x.t, r: -1 }); return res; }
        if (x.l <= tp) { Object.assign(res, { status: "tp", ausstiegT: x.t, r: rTp }); return res; }
        if (j - i >= e.maxKerzenImTrade) {
          Object.assign(res, { status: "zeit", ausstiegT: x.t, r: (einstieg - x.c) / (sl - einstieg) });
          return res;
        }
      }
      res.status = "offen";
      return res;
    }
    if (b.h > H) {
      if (b.c > H + e.tolPreis) {
        merke();
        res.status = "ungueltig";
        res.ausstiegT = b.t;
        return res;
      }
      H = b.h; hIdx = i; vor = i; zustand = 0; res.neueHochs++;
      continue;
    }
    if (b.l < L) { L = b.l; lIdx = i; }
  }
  merke();
  res.status = "offen";
  return res;
}
