import "server-only";
import { createClient } from "@/lib/supabase/server";
import { G8 } from "@/lib/supabase/trading";
import { istVeraltet, type HandWert, type WaehrungsBild } from "@/lib/makro/bewertung";
import { erwarteterSchritt, urteilFuer, type UrteilBild } from "./urteil";
import { zuRelease } from "./releases-sync";
import {
  INDEX_KATEGORIEN, KATEGORIE_LABEL, indexBis, indexVerlauf, fmtWert,
  type Kategorie, type Release, type IndexPunkt,
} from "./releases";

/**
 * Releases für die Seiten laden und vorrechnen (29.09.2026).
 *
 * Alles, was die Diagramme brauchen, wird hier auf dem Server gerechnet und
 * als schlichte Daten an die Client-Komponenten gegeben — die Grafiken
 * rechnen nichts mehr selbst.
 */

const SEITE = 1000;

export async function ladeReleases(opt: { ccy?: string; ab?: string; bis?: string } = {}): Promise<Release[]> {
  const supabase = await createClient();
  const out: Release[] = [];
  for (let von = 0; ; von += SEITE) {
    let q = supabase.from("makro_releases")
      .select("id, ccy, titel, serie, kategorie, event_time, impact, einheit, erwartung, ist, vorwert, ist_quelle, abweichung, z")
      .order("event_time", { ascending: true })
      .range(von, von + SEITE - 1);
    if (opt.ccy) q = q.eq("ccy", opt.ccy);
    if (opt.ab) q = q.gte("event_time", opt.ab);
    if (opt.bis) q = q.lte("event_time", opt.bis);
    const { data, error } = await q;
    if (error || !data) break;
    out.push(...(data as Record<string, unknown>[]).map(zuRelease));
    if (data.length < SEITE) break;
  }
  return out;
}

const tageZurueck = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/* ------------------------------------------------------------ Terminal */

export interface MatrixZelle { wert: number | null; n: number }

export interface Terminal {
  /** Je Währung und Kategorie der aktuelle Index; „gesamt" über alle drei. */
  matrix: Record<string, Record<Kategorie | "gesamt", MatrixZelle>>;
  /** Index-Verlauf je Währung, wöchentlich, 12 Monate. */
  verlauf: Record<string, IndexPunkt[]>;
  /**
   * Der erwartete nächste Zinsschritt aus dem Kalender — kommend oder
   * schon gefallen, aber noch ohne Ist. Die Leitzinsreihe (FRED/BIS) hinkt
   * Tage bis Wochen hinterher; der Kalender weiss es vorher.
   */
  schritt: Record<string, string | null>;
  status: {
    termine45: number;
    mitErwartung45: number;
    mitIst45: number;
    jeQuelle: Record<string, number>;
    offenOhneIst: number;
    letzterTermin: string | null;
  };
}

export async function ladeTerminal(): Promise<Terminal> {
  return baueTerminal(await ladeReleases({ ab: tageZurueck(400) }));
}

/**
 * Übersicht für das Terminal: das Urteil je Währung plus die Rohdaten für
 * den aufklappbaren Hintergrund — mit EINER Abfrage für beides.
 */
export async function ladeUebersicht(zeilen: WaehrungsBild[]): Promise<{ terminal: Terminal; urteile: Record<string, UrteilBild> }> {
  const releases = await ladeReleases({ ab: tageZurueck(400) });
  const urteile: Record<string, UrteilBild> = {};
  for (const ccy of G8) {
    urteile[ccy] = urteilFuer(zeilen.find((z) => z.ccy === ccy) ?? null, releases.filter((r) => r.ccy === ccy));
  }
  return { terminal: baueTerminal(releases), urteile };
}

function baueTerminal(releases: Release[]): Terminal {
  const heute = new Date();
  const grenze45 = Date.now() - 45 * 86_400_000;

  const matrix: Terminal["matrix"] = {};
  const verlauf: Terminal["verlauf"] = {};
  const schritt: Terminal["schritt"] = {};
  for (const ccy of G8) {
    const eigene = releases.filter((r) => r.ccy === ccy);
    schritt[ccy] = erwarteterSchritt(eigene);
    const zeile = {} as Record<Kategorie | "gesamt", MatrixZelle>;
    const zaehle = (k: Kategorie[]) => eigene.filter((r) =>
      r.z !== null && k.includes(r.kategorie) && Date.parse(r.event_time) >= grenze45).length;
    for (const k of INDEX_KATEGORIEN) {
      zeile[k] = { wert: indexBis(eigene, heute, [k]).wert, n: zaehle([k]) };
    }
    for (const k of ["notenbank", "stimmung", "sonstiges"] as Kategorie[]) {
      zeile[k] = { wert: indexBis(eigene, heute, [k]).wert, n: zaehle([k]) };
    }
    zeile.gesamt = { wert: indexBis(eigene, heute).wert, n: zaehle(INDEX_KATEGORIEN) };
    matrix[ccy] = zeile;
    verlauf[ccy] = indexVerlauf(eigene, 12, heute);
  }

  const vergangen45 = releases.filter((r) => {
    const t = Date.parse(r.event_time);
    return t >= grenze45 && t <= Date.now();
  });
  const jeQuelle: Record<string, number> = {};
  for (const r of vergangen45) if (r.ist_quelle) jeQuelle[r.ist_quelle] = (jeQuelle[r.ist_quelle] ?? 0) + 1;
  const vergangen = releases.filter((r) => Date.parse(r.event_time) <= Date.now());

  return {
    matrix,
    verlauf,
    schritt,
    status: {
      termine45: vergangen45.length,
      mitErwartung45: vergangen45.filter((r) => r.erwartung !== null).length,
      mitIst45: vergangen45.filter((r) => r.ist !== null).length,
      jeQuelle,
      offenOhneIst: vergangen45.filter((r) => r.erwartung !== null && r.ist === null).length,
      letzterTermin: vergangen[vergangen.length - 1]?.event_time ?? null,
    },
  };
}

/* ------------------------------------------------------------ Währung */

export interface SeriePunkt {
  datum: string;
  erwartung: number | null;
  ist: number | null;
  vorwert: number | null;
  abweichung: number | null;
  z: number | null;
  quelle: string | null;
  titel: string;
}

export interface SerieDaten {
  serie: string;
  kategorie: Kategorie;
  einheit: string;
  punkte: SeriePunkt[];
  wichtig: number;
}

export interface WaehrungsReleases {
  ccy: string;
  urteil: UrteilBild;
  jetzt: Record<Kategorie | "gesamt", number | null>;
  /** Index gesamt und je Kategorie, wöchentlich, 12 Monate. */
  verlauf: { datum: string; gesamt: number | null; wachstum: number | null; inflation: number | null; arbeit: number | null }[];
  serien: SerieDaten[];
  /** Vergangene 45 Tage, jüngste zuerst. */
  letzte: Release[];
  /** Nächste 14 Tage, frühester zuerst. */
  naechste: Release[];
  /** Notenbank-Entscheide, jüngste zuerst. */
  entscheide: Release[];
  luecken: string[];
}

/** Welche Reihen im Diagramm zuerst stehen: die, die den Markt bewegen. */
function wichtigkeit(serie: string, impact: string | null): number {
  let w = impact === "High" ? 30 : impact === "Medium" ? 20 : 10;
  if (/Manufacturing PMI|ISM Manufacturing/i.test(serie)) w += 9;
  if (/Services PMI|ISM Services|Ivey/i.test(serie)) w += 8;
  if (/^(Core )?CPI y\/y|CPI Flash Estimate y\/y|Trimmed Mean CPI/i.test(serie)) w += 7;
  if (/Non-Farm Employment Change|Employment Change|Unemployment Rate/i.test(serie)) w += 6;
  if (/GDP/i.test(serie)) w += 5;
  return w;
}

const TAG = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" });
export const tagKurz = (iso: string) => TAG.format(new Date(iso));

const FELD_LABEL: Record<string, string> = {
  pmi_industrie: "PMI Industrie",
  pmi_dienste: "PMI Dienste",
  bip_yoy: "BIP zum Vorjahr",
  fruehindikator: "Frühindikator",
  arbeitslos: "Arbeitslosenquote",
};

export async function ladeWaehrungsReleases(
  ccy: string, hand: Partial<Record<string, HandWert>>, zeile: WaehrungsBild | null,
): Promise<WaehrungsReleases> {
  const alle = await ladeReleases({ ccy, ab: tageZurueck(800) });
  const heute = new Date();
  const jetztMs = Date.now();

  const jetzt = {} as Record<Kategorie | "gesamt", number | null>;
  for (const k of ["wachstum", "inflation", "arbeit", "notenbank", "stimmung", "sonstiges"] as Kategorie[]) {
    jetzt[k] = indexBis(alle, heute, [k]).wert;
  }
  jetzt.gesamt = indexBis(alle, heute).wert;

  const g = indexVerlauf(alle, 12, heute);
  const w = indexVerlauf(alle, 12, heute, ["wachstum"]);
  const i = indexVerlauf(alle, 12, heute, ["inflation"]);
  const a = indexVerlauf(alle, 12, heute, ["arbeit"]);
  const verlauf = g.map((p, n) => ({
    datum: p.datum, gesamt: p.wert, wachstum: w[n]?.wert ?? null, inflation: i[n]?.wert ?? null, arbeit: a[n]?.wert ?? null,
  }));

  // Reihen fürs Diagramm: nur mit mindestens zwei Terminen, die ein Ist
  // oder eine Erwartung haben.
  const jeSerie = new Map<string, Release[]>();
  for (const r of alle) {
    if (Date.parse(r.event_time) > jetztMs) continue;
    if (r.ist === null && r.erwartung === null) continue;
    const l = jeSerie.get(r.serie) ?? [];
    l.push(r);
    jeSerie.set(r.serie, l);
  }
  const serien: SerieDaten[] = [...jeSerie.entries()]
    .filter(([, l]) => l.length >= 2)
    .map(([serie, l]) => ({
      serie,
      kategorie: l[0].kategorie,
      einheit: l.find((r) => r.einheit)?.einheit ?? "",
      wichtig: Math.max(...l.map((r) => wichtigkeit(serie, r.impact))),
      punkte: l.map((r) => ({
        datum: r.event_time.slice(0, 10),
        erwartung: r.erwartung, ist: r.ist, vorwert: r.vorwert,
        abweichung: r.abweichung, z: r.z, quelle: r.ist_quelle, titel: r.titel,
      })),
    }))
    .sort((x, y) => y.wichtig - x.wichtig || x.serie.localeCompare(y.serie));

  const grenze45 = jetztMs - 45 * 86_400_000;
  const grenze14 = jetztMs + 14 * 86_400_000;
  const letzte = alle
    .filter((r) => { const t = Date.parse(r.event_time); return t >= grenze45 && t <= jetztMs; })
    .filter((r) => r.erwartung !== null || r.ist !== null)
    .reverse();
  const naechste = alle
    .filter((r) => { const t = Date.parse(r.event_time); return t > jetztMs && t <= grenze14; })
    .filter((r) => r.impact === "High" || r.impact === "Medium" || r.kategorie === "notenbank");
  const entscheide = alle
    .filter((r) => r.kategorie === "notenbank" && Date.parse(r.event_time) <= jetztMs && r.erwartung !== null)
    .reverse()
    .slice(0, 6);

  /* Lücken — alles, was fehlt oder nicht trägt, in Worten. */
  const luecken: string[] = [];
  for (const [feld, label] of Object.entries(FELD_LABEL)) {
    const h = hand[feld];
    if (!h || h.wert === null) luecken.push(`${label} fehlt — keine freie Quelle liefert ihn für ${ccy}.`);
    else if (istVeraltet(feld, h)) luecken.push(`${label} veraltet (Stand ${h.stand ?? "?"}).`);
  }
  for (const e of entscheide) {
    if (e.ist === null) luecken.push(`Notenbank-Entscheid ${tagKurz(e.event_time)}: Ist fehlt noch (erwartet ${fmtWert(e.erwartung, e.einheit)}).`);
  }
  const offen = letzte.filter((r) => r.erwartung !== null && r.ist === null && r.kategorie !== "notenbank");
  if (offen.length > 0) {
    luecken.push(`${offen.length} Veröffentlichung${offen.length === 1 ? "" : "en"} der letzten 45 Tage noch ohne Ist (z.B. ${offen[0].titel} vom ${tagKurz(offen[0].event_time)}).`);
  }
  const ohneErwartung = letzte.filter((r) => r.erwartung === null).length;
  if (ohneErwartung > 0) luecken.push(`${ohneErwartung} Veröffentlichung${ohneErwartung === 1 ? "" : "en"} ohne Erwartung im Kalender.`);
  for (const k of INDEX_KATEGORIEN) {
    const n = letzte.filter((r) => r.kategorie === k && r.z !== null).length;
    if (n === 0) luecken.push(`${KATEGORIE_LABEL[k]}: keine Veröffentlichung mit Erwartung und Ist in 45 Tagen.`);
  }

  return { ccy, urteil: urteilFuer(zeile, alle), jetzt, verlauf, serien, letzte, naechste, entscheide, luecken };
}

/* ------------------------------------------------------------ Kalender */

export async function ladeKalender(tageZurueckN = 30, tageVor = 14): Promise<Release[]> {
  return ladeReleases({
    ab: tageZurueck(tageZurueckN),
    bis: new Date(Date.now() + tageVor * 86_400_000).toISOString(),
  });
}
