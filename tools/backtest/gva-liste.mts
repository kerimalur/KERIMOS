import { readFileSync } from "node:fs";
/**
 * Listet die GVAs eines Paars mit erstem Treffer (Tageskerzen, OANDA) — zum
 * Abgleich mit dem PineScript in TradingView.
 * Aufruf: npx -y tsx tools/backtest/gva-liste.mts GBPAUD 2025-01-01
 */
import { baue3D, findeGvas, zuFrueh, beruehrt } from "../../src/lib/strategie/gva";
const env: Record<string,string> = {};
for (const z of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m = z.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,""); }
const paar = process.argv[2] ?? "GBPAUD"; const von = process.argv[3] ?? "2025-01-01";
const inst = `${paar.slice(0,3)}_${paar.slice(3)}`;
const r = await fetch(`${env.TRADING_SUPABASE_URL}/rest/v1/price_daily?select=date,open,high,low,close&instrument=eq.${inst}&order=date.asc&date=gte.2023-01-01`, { headers: { apikey: env.TRADING_SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.TRADING_SUPABASE_SERVICE_ROLE_KEY}`, "Accept-Profile": env.TRADING_SUPABASE_SCHEMA || "trading" } });
const roh = await r.json() as any[];
const tage = roh.map((x) => ({ zeit: new Date(Date.parse(x.date+"T12:00:00Z")+86400000).toISOString().slice(0,10), open:+x.open, high:+x.high, low:+x.low, close:+x.close }));
const d3 = baue3D(tage);
for (const g of findeGvas(d3)) {
  if (g.bEnde < von) continue;
  let hit = "nie";
  for (const k of tage) { if (k.zeit <= g.bEnde) continue; if (beruehrt(g, k.high, k.low)) { hit = k.zeit + (zuFrueh(d3, g, k.zeit) ? " (zu früh→verworfen)" : ""); break; } }
  console.log(g.seite.padEnd(5), "B", g.bStart, "–", g.bEnde, "Level", g.level.toFixed(5), "Treffer", hit);
}
