import type { Bar } from "@/lib/strategie/setup";
import { sitzungsEnde } from "@/lib/strategie/zeit";
import type { LaborEreignis } from "@/lib/strategie/labor-laden";

/**
 * Grafiken des Strategie-Labors (11.10.2026), reines SVG vom Server.
 *  - Kurve: Summe R netto über die Trades
 *  - TradeChart: Kerzen um ein Ereignis mit GVA, Struktur, BOS, H, L,
 *    Einstieg, SL, TP und Ausgang — so, wie es der Durchlauf gesehen hat.
 */

export function Kurve({ punkte }: { punkte: number[] }) {
  if (punkte.length < 2) return <p className="text-sm text-ink-muted">Zu wenige Trades für eine Kurve.</p>;
  const W = 800, H = 180, P = 8;
  let s = 0;
  const kum = [0, ...punkte.map((r) => (s += r))];
  const lo = Math.min(0, ...kum), hi = Math.max(0, ...kum);
  const x = (i: number) => P + (i / (kum.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const pfad = kum.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ende = kum[kum.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`Summe R: ${ende.toFixed(1)}`}>
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="stroke-line" strokeDasharray="4 4" />
      <path d={pfad} fill="none" strokeWidth={2} className={ende >= 0 ? "stroke-good-bright" : "stroke-bad-bright"} />
      <text x={W - P} y={y(ende) - 6} textAnchor="end" className="fill-ink text-[12px] font-semibold">
        {ende >= 0 ? "+" : ""}{ende.toFixed(1)} R
      </text>
    </svg>
  );
}

const ZEIT = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" });

export function TradeChart({ bars, e }: { bars: Bar[]; e: LaborEreignis }) {
  if (bars.length < 5) return <p className="text-sm text-ink-muted">Keine Kerzen für diesen Zeitraum (Yahoo).</p>;
  const W = 1000, H = 440, PL = 62, PR = 132, PT = 14, PB = 24;
  const ms = (s: string | null) => (s ? Date.parse(s) : null);
  const preise = [e.level, e.struktur, e.hoch, e.tief, e.einstieg, e.sl, e.tp].filter((v): v is number => v !== null);
  const lo = Math.min(...bars.map((b) => b.l), ...preise);
  const hi = Math.max(...bars.map((b) => b.h), ...preise);
  const pad = (hi - lo) * 0.04;
  const y = (v: number) => PT + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - PT - PB);
  const bw = (W - PL - PR) / bars.length;
  const xi = (i: number) => PL + i * bw + bw / 2;
  const idxVon = (t: number | null) => {
    if (t === null) return null;
    let best = 0;
    for (let i = 0; i < bars.length; i++) if (bars[i].t <= t) best = i;
    return best;
  };
  const iTreffer = idxVon(ms(e.trefferT));
  const iStruktur = idxVon(ms(e.strukturT));
  const iBos = idxVon(ms(e.bosT));
  const iHoch = idxVon(ms(e.hochT));
  const iTief = idxVon(ms(e.tiefT));
  const iEin = idxVon(ms(e.einstiegT));
  const iAus = idxVon(ms(e.ausstiegT));
  const kurz = e.seite === "short";
  const nachkomma = e.paar.endsWith("JPY") ? 3 : 5;
  const fmt = (v: number) => v.toFixed(nachkomma);
  // Preisachse: 6 runde Stufen
  const spanne = hi - lo + 2 * pad;
  const roh = spanne / 6;
  const pot = 10 ** Math.floor(Math.log10(roh));
  const stufe = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((x) => x >= roh) ?? roh;
  const ticks: number[] = [];
  for (let v = Math.ceil((lo - pad) / stufe) * stufe; v <= hi + pad; v += stufe) ticks.push(v);
  // Bildende GVA-Kerze, falls im Ausschnitt
  const bVon = e.bStart ? sitzungsEnde(e.bStart) - 86_400_000 : null;
  const bBis = e.bEnde ? sitzungsEnde(e.bEnde) : null;
  const iBVon = bVon !== null && bVon >= bars[0].t ? idxVon(bVon) : null;
  const iBBis = bBis !== null && bBis >= bars[0].t ? idxVon(bBis) : null;

  const Linie = ({ v, von, bis, klasse, text, strich }: { v: number | null; von: number | null; bis?: number | null; klasse: string; text: string; strich?: string }) =>
    v === null ? null : (
      <g>
        <line x1={von === null ? PL : xi(von)} x2={bis === null || bis === undefined ? W - PR : xi(bis)} y1={y(v)} y2={y(v)}
          className={klasse} strokeWidth={1.4} strokeDasharray={strich} />
        <text x={W - PR + 4} y={y(v) + 4} className={`${klasse.replace("stroke-", "fill-")} text-[11px]`}>{text} {fmt(v)}</text>
      </g>
    );
  const Marke = ({ i, v, text, oben, klasse }: { i: number | null; v: number | null; text: string; oben: boolean; klasse: string }) =>
    i === null || v === null ? null : (
      <g>
        <circle cx={xi(i)} cy={y(v)} r={3.5} className={klasse.replace("fill-", "fill-")} />
        <text x={xi(i)} y={y(v) + (oben ? -8 : 16)} textAnchor="middle" className={`${klasse} text-[11px] font-semibold`}>{text}</text>
      </g>
    );

  const tage: { i: number; text: string }[] = [];
  bars.forEach((b, i) => { if (i === 0 || b.tag !== bars[i - 1].tag) tage.push({ i, text: ZEIT.format(new Date(`${b.tag}T12:00:00Z`)) }); });
  const schritt = Math.max(1, Math.ceil(tage.length / 12));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${e.paar} ${e.seite} – ${e.status}`}>
      {/* Preisachse */}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={0.4} />
          <text x={PL - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-faint text-[10px]">{fmt(v)}</text>
        </g>
      ))}
      {/* Bildende GVA-Kerze */}
      {iBBis !== null && (
        <g>
          <rect x={xi(iBVon ?? 0) - bw / 2} y={PT} width={Math.max(bw, xi(iBBis) - xi(iBVon ?? 0) + bw)} height={H - PT - PB}
            className="fill-warn" opacity={0.08} />
          <text x={xi(iBVon ?? 0)} y={PT + 18} className="fill-warn text-[10px]">GVA-Kerze ({e.gvaTf})</text>
        </g>
      )}
      {/* Tagesgrenzen */}
      {tage.filter((_, k) => k % schritt === 0).map((d) => (
        <g key={d.i}>
          <line x1={xi(d.i) - bw / 2} x2={xi(d.i) - bw / 2} y1={PT} y2={H - PB} className="stroke-line" strokeWidth={0.6} />
          <text x={xi(d.i)} y={H - 6} className="fill-ink-faint text-[10px]">{d.text}</text>
        </g>
      ))}
      {/* Kerzen */}
      {bars.map((b, i) => {
        const auf = b.c >= b.o;
        const k = auf ? "stroke-good-bright fill-good-bright" : "stroke-bad-bright fill-bad-bright";
        const top = y(Math.max(b.o, b.c)), unten = y(Math.min(b.o, b.c));
        return (
          <g key={b.t} className={k}>
            <line x1={xi(i)} x2={xi(i)} y1={y(b.h)} y2={y(b.l)} strokeWidth={0.8} />
            <rect x={xi(i) - bw * 0.35} y={top} width={Math.max(0.8, bw * 0.7)} height={Math.max(0.6, unten - top)} />
          </g>
        );
      })}
      {/* Level */}
      <Linie v={e.level} von={iBBis ?? null} bis={iTreffer} klasse="stroke-warn" text="GVA" />
      <Linie v={e.struktur} von={iStruktur} bis={iBos} klasse="stroke-ink-muted" text="Struktur" strich="3 3" />
      <Linie v={e.einstieg} von={iBos} bis={iAus ?? null} klasse="stroke-accent" text="0.618" strich="5 3" />
      <Linie v={e.sl} von={iBos} bis={iAus ?? null} klasse="stroke-bad-bright" text="SL" strich="5 3" />
      <Linie v={e.tp} von={iBos} bis={iAus ?? null} klasse="stroke-good-bright" text="TP" strich="5 3" />
      {/* Marken */}
      <Marke i={iTreffer} v={e.level} text="Treffer" oben={kurz} klasse="fill-warn" />
      <Marke i={iHoch} v={e.hoch} text={`${kurz ? "H" : "L"} ${e.hoch === null ? "" : fmt(e.hoch)}`} oben={kurz} klasse="fill-ink" />
      <Marke i={iBos} v={e.struktur} text="BOS" oben={!kurz} klasse="fill-ink-soft" />
      <Marke i={iTief} v={e.tief} text={`${kurz ? "L" : "H"} ${e.tief === null ? "" : fmt(e.tief)}`} oben={!kurz} klasse="fill-accent" />
      <Marke i={iEin} v={e.einstieg} text="Einstieg" oben={kurz} klasse="fill-accent" />
      {iAus !== null && e.einstieg !== null && (
        <Marke i={iAus} v={e.status === "tp" ? e.tp : e.status === "sl" ? e.sl : null} text={e.status.toUpperCase()} oben={e.status === "sl" ? kurz : !kurz}
          klasse={e.status === "tp" ? "fill-good-bright" : "fill-bad-bright"} />
      )}
      <text x={PL + 4} y={PT + 6} className="fill-ink-muted text-[11px]">
        {e.paar} · {e.seite === "short" ? "Short" : "Long"} · {e.gvaTf}-GVA {fmt(e.level)}
      </text>
    </svg>
  );
}
