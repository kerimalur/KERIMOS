/**
 * GVA-Erkennung, 1:1 nach „GVA Linien — Pur v1.1" (PineScript, Kerim).
 *
 * Zwei aufeinanderfolgende 3D-Kerzen A und B:
 *  - Long (Boden): A bärisch, B bullisch, Body B ≥ Body A × (1 + k2), die
 *    Body-Böden liegen höchstens tol % von Body A auseinander. Level = Body-Boden von B.
 *  - Short (Top): spiegelbildlich, Level = Body-Top von B.
 * Die Linie entsteht, wenn B geschlossen ist. Treffer = erste Berührung danach
 * (Docht zählt). Nachbar-Filter: zwischen B und der Treffer-Kerze muss mindestens
 * `mindestAbstand` 3D-Kerze komplett liegen, sonst wird die GVA verworfen.
 */

import { block3d, wochenSchluessel, zu3D, zuWoche, type Kerze } from "../trading/zeitrahmen";

export interface GvaEinstellung {
  tolProzent: number;
  k2Prozent: number;
  mindestAbstand: number;
}

/** Kerims Einstellung im Pine (11.10.2026): Toleranz 40 %, 2. Kerze 25 % grösser. Pine-Standard wäre 5 / 40. */
export const GVA_STANDARD: GvaEinstellung = { tolProzent: 40, k2Prozent: 25, mindestAbstand: 1 };

export interface Gva {
  seite: "long" | "short";
  level: number;
  /** Index der bildenden Kerze B in der 3D-Liste. */
  bIndex: number;
  /** Erster und letzter Handelstag von B. */
  bStart: string;
  bEnde: string;
}

export type HtfArt = "3D" | "W";

export interface DreiD {
  art: HtfArt;
  kerzen: Kerze[];
  /** Index der HTF-Kerze, in die ein Handelstag fällt. */
  indexVonTag: (tag: string) => number | undefined;
  /** Index → letzter Handelstag der Kerze. */
  letzterTag: string[];
}

/** Tageskerzen (Handelstag-Datum, Mo–Fr) → 3D- oder Wochenkerzen im Screener-Raster. */
export function baueHtf(tage: Kerze[], art: HtfArt): DreiD {
  const sortiert = [...tage].sort((a, b) => a.zeit.localeCompare(b.zeit));
  const schluessel = (iso: string): string | number => (art === "3D" ? block3d(iso) : wochenSchluessel(iso));
  const kerzen = art === "3D" ? zu3D(sortiert) : zuWoche(sortiert);
  const index = new Map<string | number, number>();
  kerzen.forEach((k, i) => index.set(schluessel(k.zeit), i));
  const letzterTag: string[] = kerzen.map(() => "");
  for (const t of sortiert) {
    const i = index.get(schluessel(t.zeit));
    if (i !== undefined && t.zeit > letzterTag[i]) letzterTag[i] = t.zeit;
  }
  return { art, kerzen, indexVonTag: (tag) => index.get(schluessel(tag)), letzterTag };
}

export const baue3D = (tage: Kerze[]): DreiD => baueHtf(tage, "3D");

export function findeGvas(d: DreiD, e: GvaEinstellung = GVA_STANDARD): Gva[] {
  const out: Gva[] = [];
  const k = d.kerzen;
  for (let i = 1; i < k.length; i++) {
    const A = k[i - 1], B = k[i];
    const bodyA = Math.abs(A.close - A.open);
    if (bodyA <= 0) continue;
    const bodyB = Math.abs(B.close - B.open);
    const tol = bodyA * (e.tolProzent / 100);
    const groesser = bodyB >= bodyA * (1 + e.k2Prozent / 100);
    if (!groesser) continue;
    const bull = A.close < A.open && B.close > B.open
      && Math.abs(Math.min(A.open, A.close) - Math.min(B.open, B.close)) <= tol;
    const bear = A.close > A.open && B.close < B.open
      && Math.abs(Math.max(A.open, A.close) - Math.max(B.open, B.close)) <= tol;
    if (!bull && !bear) continue;
    out.push({
      seite: bull ? "long" : "short",
      level: bull ? Math.min(B.open, B.close) : Math.max(B.open, B.close),
      bIndex: i, bStart: B.zeit, bEnde: d.letzterTag[i],
    });
  }
  return out;
}

/** Wurde die GVA zu früh getroffen (Nachbar-Filter)? `trefferTag` = Handelstag des Treffers. */
export function zuFrueh(d: DreiD, g: Gva, trefferTag: string, e: GvaEinstellung = GVA_STANDARD): boolean {
  const idx = d.indexVonTag(trefferTag);
  if (idx === undefined) return false;
  return idx - g.bIndex < e.mindestAbstand + 1;
}

/** Berührt eine Kerze das Level? Docht zählt. */
export const beruehrt = (g: Gva, hoch: number, tief: number) =>
  g.seite === "long" ? tief <= g.level : hoch >= g.level;
