// Varianten-Vergleich LOKAL rechnen (02.10.2026) — ohne Next, ohne Vercel.
// Liest .env.local, holt Komponenten wie die Rückrechnung und Tageskerzen aus
// trading.price_daily (OANDA), rechnet alle Varianten und gibt die Tabelle aus.
//
// Aufruf (im Projektordner):
//   node --conditions=react-server --import tsx tools/varianten-lokal.mts [ausgabe.json]
import fs from "node:fs";

const roh = fs.readFileSync(".env.local", "utf8").replace(/^﻿/, "");
for (const l of roh.split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i < 1 || l.trim().startsWith("#")) continue;
  const k = l.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
// Haupt- und Trading-Datenbank sind dasselbe Projekt; lokal fehlt der Haupt-Schlüssel.
process.env.SUPABASE_SERVICE_ROLE_KEY ??= process.env.TRADING_SUPABASE_SERVICE_ROLE_KEY;

const { komponentenProWoche } = await import("../src/lib/makro/rueckrechnung");
const { createTradingClient, G8 } = await import("../src/lib/supabase/trading");
const { PAARE } = await import("../src/lib/trading/journal");
const V = await import("../src/lib/makro/varianten-rechnen");

const t0 = Date.now();
const { wochen, komponenten } = await komponentenProWoche();
console.error(`Komponenten: ${wochen.length} Wochen in ${Math.round((Date.now() - t0) / 1000)} s`);
const letzte = komponenten.get(wochen[wochen.length - 1]) ?? {};
console.error(`Kontrolle letzte Woche, 2J-Rendite: ${G8.map((c) => `${c} ${letzte[c]?.zweiJahr ?? "—"}`).join(" · ")}`);

const komp = new Map<string, Record<string, import("../src/lib/makro/varianten-rechnen").KompWoche>>();
for (const w of wochen) {
  const r0 = komponenten.get(w) ?? {};
  const k: Record<string, import("../src/lib/makro/varianten-rechnen").KompWoche> = {};
  for (const c of G8) {
    const r = r0[c];
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
const scores = V.variantenScores(wochen, komp);

const fx = (PAARE as readonly string[]).filter((p) => p.length === 6 && !/X[AU]|BTC|ETH/.test(p));
const db = createTradingClient()!;
const kerzen = new Map<string, { zeit: string; open: number; close: number }[]>();
for (const p of fx) {
  const inst = `${p.slice(0, 3)}_${p.slice(3)}`;
  const { data, error } = await db.from("price_daily").select("date, open, close")
    .eq("instrument", inst).gte("date", "2024-02-01").order("date", { ascending: true }).limit(5000);
  if (error) throw new Error(`${inst}: ${error.message}`);
  // OANDA-Tageskerzen sind nach ihrem Beginn datiert (Sonntag 22:00 UTC = Montagskerze).
  kerzen.set(p, (data ?? []).map((r: Record<string, unknown>) => ({
    zeit: `${String(r.date).slice(0, 10)}T22:00:00Z`, open: Number(r.open), close: Number(r.close),
  })));
}

const jetzt = Date.now();
const zeilen: import("../src/lib/makro/varianten-rechnen").VariantenZeile[] = [];
for (const v of V.VARIANTEN) {
  for (const w of wochen) {
    for (const i of V.rangIdeen(scores.get(v.key)!.get(w) ?? {}, PAARE)) {
      const m = V.messeHorizonte(kerzen.get(i.paar) ?? [], w, i.seite, jetzt);
      zeilen.push({ variante: v.key, woche: w, paar: i.paar, seite: i.seite, extrem: i.extrem,
        p1: m[1] ?? null, p2: m[2] ?? null, p4: m[4] ?? null, p8: m[8] ?? null });
    }
  }
}
const bild = V.variantenBild(zeilen);
const ausgabe = process.argv[2];
if (ausgabe) fs.writeFileSync(ausgabe, JSON.stringify({ bild, zeilen: zeilen.length }, null, 1));

for (const f of ["alle", "extrem"] as const) {
  for (const h of V.MESS_HORIZONTE) {
    console.log(`\n=== ${h} W · ${f === "alle" ? "Top 2 gegen Flop 2" : "Platz 1 gegen 8"} ===  (Treffer % / Schnitt % / n)`);
    for (const v of V.VARIANTEN) {
      const z = V.JAHRE.map((j) => {
        const s = bild.stat[v.key][h][f][j];
        return s.n ? `${j}: ${s.treffer}% ${s.schnitt! > 0 ? "+" : ""}${s.schnitt!.toFixed(2)} (${s.n})` : `${j}: —`;
      });
      console.log(`${v.label.padEnd(32)} ${z.join(" | ")}`);
    }
  }
}
