import "server-only";
import { createTradingClient } from "@/lib/supabase/trading";
import {
  erkenntnisse, gruppiere, kategorieName, ausgerichtet,
  type Erkenntnis, type Ereignis, type GruppeErgebnis, type Horizont,
} from "./rechnen";
import { fazit, pruefstand, type HypothesenErgebnis } from "./hypothesen";

export type Ampel = "gut" | "warn" | "schlecht";

export interface BeobachterStand {
  tabelleFehlt: boolean;
  lauf: { gelaufen: string | null; alterStunden: number | null; ampel: Ampel; fehler: string | null };
  kurse: { bis: string | null; alterTage: number | null; ampel: Ampel };
  ereignisse: number;
  vollGemessen: number;
  offen: number;
  neuLetzterLauf: number;
  ersterTag: string | null;
  letzterTag: string | null;
  h: Horizont;
  minZ: number;
  ueberraschungen: number;
  gesamt: GruppeErgebnis;
  jeKategorie: GruppeErgebnis[];
  jeWaehrung: GruppeErgebnis[];
  matrix: Record<string, Record<string, GruppeErgebnis>>;
  jeSerie: GruppeErgebnis[];
  erkenntnisse: Erkenntnis[];
  pruefstand: HypothesenErgebnis[];
  fazit: string;
  mitStunden: number;
  geprueft: number;
  letzte: { e: Ereignis; a: number | null }[];
}

const SEITE = 1000;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function ladeBeobachter(h: Horizont = "1d", minZ = 1): Promise<BeobachterStand> {
  const db = createTradingClient();
  const leerGruppe: GruppeErgebnis = { schluessel: "alle", titel: "Alle Überraschungen", n: 0, mittel: 0, treffer: null, t: null, haelfteA: null, haelfteB: null, status: "zuwenig", mittelR: null, netto: 0 };
  const leer: BeobachterStand = {
    tabelleFehlt: false,
    lauf: { gelaufen: null, alterStunden: null, ampel: "schlecht", fehler: null },
    kurse: { bis: null, alterTage: null, ampel: "schlecht" },
    ereignisse: 0, vollGemessen: 0, offen: 0, neuLetzterLauf: 0, ersterTag: null, letzterTag: null,
    h, minZ, ueberraschungen: 0, gesamt: leerGruppe, jeKategorie: [], jeWaehrung: [], matrix: {}, jeSerie: [],
    erkenntnisse: [], pruefstand: [], fazit: "", mitStunden: 0, geprueft: 0, letzte: [],
  };
  if (!db) return leer;

  const st = await db.from("beobachter_status").select("*").eq("id", 1).maybeSingle();
  if (st.error && /does not exist|relation|schema cache/i.test(st.error.message)) return { ...leer, tabelleFehlt: true };

  const zeilen: Ereignis[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await db.from("beobachter_ereignisse").select("*").order("event_time").range(von, von + SEITE - 1);
    if (error) break;
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      zeilen.push({
        release_id: String(r.release_id), ccy: String(r.ccy), kategorie: String(r.kategorie),
        serie: (r.serie as string | null) ?? null, titel: (r.titel as string | null) ?? null, impact: (r.impact as string | null) ?? null,
        event_time: String(r.event_time), z: Number(r.z), paar: String(r.paar), basis_datum: (r.basis_datum as string | null) ?? null,
        bewegung_1h: num(r.bewegung_1h), bewegung_4h: num(r.bewegung_4h),
        bewegung_1: num(r.bewegung_1), bewegung_3: num(r.bewegung_3), bewegung_5: num(r.bewegung_5),
        vola: num(r.vola), vorlauf_5: num(r.vorlauf_5),
      });
    }
    if ((data?.length ?? 0) < SEITE) break;
  }

  const s = (st.data ?? null) as Record<string, unknown> | null;
  const gelaufen = (s?.gelaufen as string | null) ?? null;
  const alterStunden = gelaufen ? (Date.now() - Date.parse(gelaufen)) / 3_600_000 : null;
  const bis = (s?.preise_bis as string | null) ?? null;
  const alterTage = bis ? (Date.now() - Date.parse(`${bis}T12:00:00Z`)) / 86_400_000 : null;
  const ampelLauf: Ampel = alterStunden === null ? "schlecht" : alterStunden <= 36 ? "gut" : alterStunden <= 96 ? "warn" : "schlecht";
  const ampelKurse: Ampel = alterTage === null ? "schlecht" : alterTage <= 4 ? "gut" : alterTage <= 8 ? "warn" : "schlecht";

  const gross = zeilen.filter((e) => Math.abs(e.z) >= minZ);
  const gesamt = gruppiere(zeilen, h, minZ, () => "alle", () => "Alle Überraschungen")[0] ?? leerGruppe;
  const jeKategorie = gruppiere(zeilen, h, minZ, (e) => e.kategorie, kategorieName).sort((a, b) => b.n - a.n);
  const jeWaehrung = gruppiere(zeilen, h, minZ, (e) => e.ccy).sort((a, b) => b.n - a.n);
  const kombi = gruppiere(zeilen, h, minZ, (e) => `${e.ccy}|${e.kategorie}`, (k) => { const [c, kat] = k.split("|"); return `${c} · ${kategorieName(kat)}`; });
  const matrix: Record<string, Record<string, GruppeErgebnis>> = {};
  for (const g of kombi) { const [c, kat] = g.schluessel.split("|"); (matrix[c] ??= {})[kat] = g; }
  const serien = gruppiere(zeilen, h, minZ, (e) => `${e.ccy} ${e.serie ?? e.titel ?? "?"}`);
  const jeSerie = serien.filter((g) => g.n >= 15).sort((a, b) => Math.abs(b.t ?? 0) - Math.abs(a.t ?? 0)).slice(0, 15);

  const ps = pruefstand(zeilen);
  const alleGruppen = [...jeKategorie, ...kombi, ...serien.filter((g) => g.n >= 30)];
  return {
    tabelleFehlt: false,
    lauf: { gelaufen, alterStunden, ampel: ampelLauf, fehler: (s?.fehler as string | null) ?? null },
    kurse: { bis, alterTage, ampel: ampelKurse },
    ereignisse: zeilen.length,
    vollGemessen: zeilen.filter((e) => e.bewegung_5 !== null).length,
    offen: zeilen.filter((e) => e.bewegung_5 === null).length,
    neuLetzterLauf: Number(s?.neu_gemessen ?? 0),
    ersterTag: zeilen[0]?.event_time ?? null,
    letzterTag: zeilen[zeilen.length - 1]?.event_time ?? null,
    h, minZ, ueberraschungen: gross.length, gesamt, jeKategorie, jeWaehrung, matrix, jeSerie,
    erkenntnisse: erkenntnisse(alleGruppen, h, 8),
    pruefstand: ps, fazit: fazit(ps),
    mitStunden: zeilen.filter((e) => e.bewegung_4h !== null).length,
    geprueft: alleGruppen.filter((g) => g.n >= 30).length,
    letzte: [...gross].reverse().slice(0, 15).map((e) => ({ e, a: ausgerichtet(e, h) })),
  };
}
