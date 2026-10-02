"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cx } from "@/components/ui";
import {
  JAHRE, MESS_HORIZONTE, VARIANTEN, type Filter, type MessHorizont, type VariantenBild, type VariantenStat,
} from "@/lib/makro/varianten-rechnen";
import { zufallsBand } from "@/lib/makro/rueckrechnung-rechnen";

/**
 * Varianten-Vergleich (02.10.2026): Tabelle je Variante und Jahr plus
 * kumulierte Kurve. Farben: kategorial in fester Reihenfolge, für dunkle
 * Fläche geprüft (dataviz-Validator, alle Checks bestanden). Höchstens 4
 * Linien gleichzeitig — mehr wird unlesbar.
 */
const FARBEN = ["#3987e5", "#d95926", "#199e70", "#c98500"];
const GITTER = "#2E2519";
const ACHSE = "#7A6E5C";
const STANDARD = ["modell", "modell_d4", "rendite_d4", "kombi"];

function Zelle({ s }: { s: VariantenStat }) {
  if (s.n === 0 || s.treffer === null) return <td className="py-1.5 text-right text-xs text-ink-faint">—</td>;
  const band = zufallsBand(s.n) ?? 100;
  const ueber = s.treffer > 50 + band, unter = s.treffer < 50 - band;
  return (
    <td className={cx("tabular py-1.5 pl-2 text-right text-xs", ueber ? "bg-good-tint text-good-bright" : unter ? "bg-bad-tint text-bad-bright" : "text-ink-soft")}
      title={`${s.n} Ideen · Zufall 50 % ± ${band} · Schnitt ${s.schnitt?.toFixed(2)} %`}>
      <span className="font-mono">{s.treffer} %</span>
      <span className="ml-1.5 font-mono text-[10px] text-ink-faint">{s.schnitt !== null ? `${s.schnitt > 0 ? "+" : ""}${s.schnitt.toFixed(2)}` : ""}</span>
    </td>
  );
}

export function VariantenVergleich({ bild, gerechnetAm }: { bild: VariantenBild; gerechnetAm: string | null }) {
  const [h, setH] = useState<MessHorizont>(2);
  const [f, setF] = useState<Filter>("alle");
  const [aktiv, setAktiv] = useState<string[]>(STANDARD);

  const daten = useMemo(() => {
    const wochen = new Map<string, Record<string, number | string>>();
    for (const key of aktiv) {
      for (const p of bild.kurven[key]?.[f] ?? []) {
        const z = wochen.get(p.woche) ?? { woche: p.woche };
        z[key] = p.wert;
        wochen.set(p.woche, z);
      }
    }
    return [...wochen.values()].sort((a, b) => String(a.woche).localeCompare(String(b.woche)));
  }, [aktiv, bild, f]);

  const robust = (key: string) => (["2024", "2025"] as const).every((j) => {
    const s = bild.stat[key]?.[h]?.[f]?.[j];
    return s && s.treffer !== null && s.n > 0 && s.treffer > 50 && (s.schnitt ?? 0) > 0;
  });

  const umschalten = (key: string) => setAktiv((a) =>
    a.includes(key) ? a.filter((k) => k !== key) : a.length >= 4 ? [...a.slice(1), key] : [...a, key]);

  const knopf = (an: boolean) => cx("rounded-lg px-2.5 py-1 text-xs transition", an ? "bg-accent font-medium text-ink-on" : "bg-sand text-ink-muted hover:text-ink");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] uppercase tracking-[0.1em] text-ink-muted">Haltedauer</span>
        {MESS_HORIZONTE.map((x) => <button key={x} type="button" onClick={() => setH(x)} className={knopf(h === x)}>{x} W</button>)}
        <span className="ml-4 w-14 text-[11px] uppercase tracking-[0.1em] text-ink-muted">Ideen</span>
        <button type="button" onClick={() => setF("alle")} className={knopf(f === "alle")}>Top 2 gegen Flop 2</button>
        <button type="button" onClick={() => setF("extrem")} className={knopf(f === "extrem")}>Nur Platz 1 gegen 8</button>
        <span className="ml-auto text-[11px] text-ink-faint">{gerechnetAm ? `gerechnet ${new Date(gerechnetAm).toLocaleString("de-CH", { timeZone: "Europe/Zurich" })}` : "noch nicht gerechnet"}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              <th className="pb-2 font-medium">Variante</th>
              {JAHRE.map((j) => <th key={j} className="pb-2 text-right font-medium">{j === "alle" ? "Alle Jahre" : j}</th>)}
              <th className="pb-2 pl-2 text-right font-medium">Kurve</th>
            </tr>
          </thead>
          <tbody>
            {VARIANTEN.map((v) => (
              <tr key={v.key} className="border-t border-line/60">
                <td className="py-1.5 pr-2">
                  <span className="text-xs text-ink" title={v.text}>{v.label}</span>
                  {robust(v.key) && <span className="ml-1.5 rounded bg-good-tint px-1 py-px text-[10px] font-medium uppercase text-good-bright" title="2024 und 2025 je über 50 % und im Schnitt positiv">robust</span>}
                </td>
                {JAHRE.map((j) => <Zelle key={j} s={bild.stat[v.key]?.[h]?.[f]?.[j] ?? { n: 0, treffer: null, schnitt: null }} />)}
                <td className="py-1.5 pl-2 text-right">
                  <button type="button" onClick={() => umschalten(v.key)}
                    className={cx("h-4 w-4 rounded border", aktiv.includes(v.key) ? "border-transparent" : "border-line-strong")}
                    style={aktiv.includes(v.key) ? { background: FARBEN[aktiv.indexOf(v.key)] } : undefined}
                    aria-label={`${v.label} in der Kurve ${aktiv.includes(v.key) ? "ausblenden" : "zeigen"}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Je Zelle: Trefferquote (Anteil Ideen im Plus nach {h} W) und Schnitt in %. Grün/rot = ausserhalb des Zufallsbands.
          „Robust" = 2024 und 2025 je über 50 % und im Schnitt positiv. Viele Varianten heisst: eine sieht immer zufällig gut aus —
          zählen nur Varianten, die in beiden Jahren tragen.
        </p>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Kumulierte Wochenrendite (1 W, ohne Überlappung) · höchstens 4 Linien</p>
        <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-ink-soft">
          {aktiv.map((k, i) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: FARBEN[i] }} />
              {VARIANTEN.find((v) => v.key === k)?.label}
            </span>
          ))}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daten} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GITTER} vertical={false} />
              <XAxis dataKey="woche" tick={{ fill: ACHSE, fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40}
                tickFormatter={(w: string) => w.slice(0, 7)} />
              <YAxis tick={{ fill: ACHSE, fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                tickFormatter={(x: number) => `${x} %`} />
              <ReferenceLine y={0} stroke={ACHSE} />
              <Tooltip
                contentStyle={{ background: "#1C1610", border: "1px solid #3A2F22", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "#C9BBA3" }}
                formatter={(wert: number, name: string) => [`${wert.toFixed(2)} %`, VARIANTEN.find((v) => v.key === name)?.label ?? name]} />
              {aktiv.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={FARBEN[i]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
