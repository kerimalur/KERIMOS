/**
 * Einstieg nach dem GVA-Treffer, als feste Regel (11.10.2026, Kerims Ansage).
 *
 * Beispiel Short (Long spiegelbildlich):
 *  1. Treffer der Top-GVA. Ab hier wird das Hoch H laufend nachgeführt.
 *  2. Break of Structure: eine Kerze bricht das letzte bestätigte Swing-Tief
 *     vor dem Hoch — per Schlusskurs (Standard) oder per Docht (Variante) —
 *     und dieses Swing-Tief liegt unter dem Daily Open des Handelstags.
 *  3. Fibonacci von H zum tiefsten Tief seit H (L, wird nachgeführt, solange
 *     kein Einstieg kam). Einstieg: Limit bei 0.618. SL = H. TP = −1 (L − (H − L)).
 *     Damit ist das Chance-Risiko fix 1.618 / 0.382 ≈ 4.24 R.
 *  4. Ein Trade pro GVA. Kommt bis `maxKerzenBisEinstieg` kein Einstieg, verfällt das Setup.
 *
 * Long wird über gespiegelte Preise (× −1) mit derselben Logik gerechnet.
 * Bei Unklarheit innerhalb einer Kerze (Einstieg und SL, oder SL und TP in
 * derselben Kerze) zählt immer das schlechtere Ergebnis.
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
  /** Kerzen links/rechts für ein Swing-Tief/-Hoch. */
  swingN: number;
  einstiegFib: number;
  tpFib: number;
  maxKerzenBisEinstieg: number;
  maxKerzenImTrade: number;
}

export const SETUP_STANDARD: SetupEinstellung = {
  bos: "schluss", swingN: 2, einstiegFib: 0.618, tpFib: -1,
  maxKerzenBisEinstieg: 240, maxKerzenImTrade: 2000,
};

export type SetupStatus = "kein_bos" | "kein_einstieg" | "tp" | "sl" | "zeit" | "offen";

export interface SetupErgebnis {
  status: SetupStatus;
  trefferT: number;
  bosT: number | null;
  einstiegT: number | null;
  ausstiegT: number | null;
  hoch: number | null;
  tief: number | null;
  einstieg: number | null;
  sl: number | null;
  tp: number | null;
  /** Ergebnis in R vor Kosten (null, wenn kein Trade). */
  r: number | null;
  /** Abstand Einstieg–SL in Preis. */
  risiko: number | null;
}

/** Für Long: Preise spiegeln, damit dieselbe Short-Logik gilt. */
export function spiegeln(bars: Bar[]): Bar[] {
  return bars.map((b) => ({ t: b.t, tag: b.tag, o: -b.o, h: -b.l, l: -b.h, c: -b.c }));
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

/** Tagesöffnung je Handelstag (erste Kerze des Tages). */
export function tagesOpen(bars: Bar[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bars) if (!m.has(b.tag)) m.set(b.tag, b.o);
  return m;
}

/**
 * Short-Logik ab dem Treffer-Index. `tiefs` = swingTiefs(bars), `open` = tagesOpen(bars),
 * beides einmal je Kerzenreihe vorberechnet.
 */
export function simuliereShort(
  bars: Bar[], start: number, tiefs: number[], open: Map<string, number>, e: SetupEinstellung = SETUP_STANDARD,
): SetupErgebnis {
  const res: SetupErgebnis = {
    status: "kein_bos", trefferT: bars[start].t, bosT: null, einstiegT: null, ausstiegT: null,
    hoch: null, tief: null, einstieg: null, sl: null, tp: null, r: null, risiko: null,
  };
  let H = -Infinity, hIdx = -1;
  let zustand: "bos" | "einstieg" = "bos";
  let L = Infinity;
  const frist = start + e.maxKerzenBisEinstieg;

  // Zeiger auf das letzte bestätigte Swing-Tief vor dem Hoch.
  const letztesTiefVor = (vorIdx: number, bisIdx: number): number | null => {
    let lo = 0, hi = tiefs.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tiefs[mid] < vorIdx) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    for (let k = best; k >= 0; k--) {
      if (tiefs[k] + e.swingN <= bisIdx - 1) return tiefs[k];
    }
    return null;
  };

  for (let i = start; i < bars.length; i++) {
    const b = bars[i];
    if (i > frist) {
      res.status = zustand === "bos" ? "kein_bos" : "kein_einstieg";
      return res;
    }
    if (zustand === "bos") {
      if (b.h > H) { H = b.h; hIdx = i; }
      if (i <= hIdx) continue;
      const ref = letztesTiefVor(hIdx, i);
      if (ref === null) continue;
      const refTief = bars[ref].l;
      const dOpen = open.get(b.tag);
      if (dOpen === undefined || !(refTief < dOpen)) continue;
      const bricht = e.bos === "schluss" ? b.c < refTief : b.l < refTief;
      if (!bricht) continue;
      zustand = "einstieg";
      res.bosT = b.t;
      L = Infinity;
      for (let k = hIdx; k <= i; k++) L = Math.min(L, bars[k].l);
      continue;
    }
    // zustand === "einstieg"
    const spanne = H - L;
    const einstieg = L + e.einstiegFib * spanne;
    if (b.h >= einstieg) {
      const sl = H;
      const tp = L + e.tpFib * spanne;
      Object.assign(res, { einstiegT: b.t, hoch: H, tief: L, einstieg, sl, tp, risiko: sl - einstieg });
      if (b.h >= sl) {
        Object.assign(res, { status: "sl", ausstiegT: b.t, r: -1 });
        return res;
      }
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
    if (b.l < L) L = b.l;
  }
  // Daten zu Ende, bevor die Frist um war: noch nicht entschieden.
  res.status = "offen";
  return res;
}
