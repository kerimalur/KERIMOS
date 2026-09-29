"use client";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cx } from "@/components/ui";
import { KATEGORIE_LABEL, QUELLE_LABEL, fmtAbweichung, fmtWert, fmtZ, type IstQuelle } from "@/lib/makro/releases";
import type { Kategorie } from "@/lib/makro/releases";
import type { SerieDaten } from "@/lib/makro/releases-laden";

/**
 * Die Liniengrafiken zu Erwartung gegen Ist (29.09.2026).
 *
 * Wie in ebenen-verlauf.tsx: keine zweite Y-Achse, nirgends. Deshalb steht
 * die Abweichung nicht im selben Diagramm wie die Werte, sondern als eigene
 * Balkenreihe darunter — auf derselben Zeitachse.
 */

const GITTER = "#2E2519";
const ACHSE = "#7A6E5C";
const GUT = "#5FC2A6";
const SCHLECHT = "#E28B72";

const ZEITRAEUME = [
  { key: "3m", label: "3 Monate", monate: 3 },
  { key: "6m", label: "6 Monate", monate: 6 },
  { key: "12m", label: "12 Monate", monate: 12 },
] as const;
type ZeitKey = (typeof ZEITRAEUME)[number]["key"];

const abDatum = (monate: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monate);
  return d.toISOString().slice(0, 10);
};
const tagKurz = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-CH", { day: "2-digit", month: "short", timeZone: "UTC" });
const tagLang = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-CH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function ZeitWahl({ wert, setze }: { wert: ZeitKey; setze: (k: ZeitKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ZEITRAEUME.map((z) => (
        <button key={z.key} type="button" onClick={() => setze(z.key)}
          className={cx("rounded-lg px-2.5 py-1 text-xs transition",
            z.key === wert ? "bg-accent font-medium text-ink-on" : "bg-sand text-ink-muted hover:text-ink")}>
          {z.label}
        </button>
      ))}
    </div>
  );
}

function Leer({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl bg-sand/40 px-4 text-center text-xs text-ink-muted">
      {text}
    </div>
  );
}

/* ------------------------------------------- Index einer Währung */

const KAT_FARBE: Record<string, string> = {
  gesamt: "#F5EFE3", wachstum: "#3987e5", inflation: "#d95926", arbeit: "#199e70",
};

export function IndexKategorien({ verlauf }: {
  verlauf: { datum: string; gesamt: number | null; wachstum: number | null; inflation: number | null; arbeit: number | null }[];
}) {
  const [zeit, setZeit] = useState<ZeitKey>("6m");
  const ab = abDatum(ZEITRAEUME.find((z) => z.key === zeit)!.monate);
  const daten = verlauf.filter((p) => p.datum >= ab);
  const reihen = ["gesamt", "wachstum", "inflation", "arbeit"] as const;
  const hatWerte = daten.some((p) => reihen.some((r) => p[r] !== null));

  return (
    <div>
      <div className="mb-3 flex justify-end"><ZeitWahl wert={zeit} setze={setZeit} /></div>
      <div className="h-[230px]">
        {hatWerte ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GITTER} />
              <XAxis dataKey="datum" tickFormatter={tagKurz} tick={{ fill: ACHSE, fontSize: 10 }}
                axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis orientation="right" width={34} domain={[-3, 3]} ticks={[-3, -2, -1, 0, 1, 2, 3]}
                tick={{ fill: ACHSE, fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}`} />
              <ReferenceLine y={0} stroke="#9A8C74" strokeWidth={1.5} />
              <Tooltip cursor={{ stroke: "#9A8C74" }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-line-strong bg-[#17130F] px-3 py-2 text-xs shadow-card">
                    <p className="mb-1 text-ink-faint">{tagLang(String(label))}</p>
                    {payload.filter((p) => typeof p.value === "number").map((p) => (
                      <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-soft">
                        <span className="h-2 w-2 rounded-full" style={{ background: String(p.color) }} />
                        {p.name}: <span className="tabular font-medium text-ink">{fmtZ(Number(p.value))}</span>
                      </p>
                    ))}
                  </div>
                );
              }} />
              <Legend verticalAlign="top" height={24} iconType="plainline"
                formatter={(v: string) => <span className="text-xs text-ink-soft">{v}</span>} />
              {reihen.map((r) => (
                <Line key={r} name={r === "gesamt" ? "Gesamt" : KATEGORIE_LABEL[r as Kategorie]} dataKey={r}
                  stroke={KAT_FARBE[r]} strokeWidth={r === "gesamt" ? 2.5 : 1.5}
                  strokeDasharray={r === "gesamt" ? undefined : "0"} dot={false}
                  connectNulls type="monotone" isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : <Leer text="Noch zu wenig Veröffentlichungen mit Erwartung und Ist." />}
      </div>
    </div>
  );
}

/* ------------------------------------------- Ist gegen Erwartung */

export function IstGegenErwartung({ serien, ccy }: { serien: SerieDaten[]; ccy: string }) {
  const vorwahl = serien.find((s) => /Manufacturing PMI|ISM Manufacturing/i.test(s.serie))?.serie ?? serien[0]?.serie ?? null;
  const [gewaehlt, setGewaehlt] = useState<string | null>(vorwahl);
  const [alle, setAlle] = useState(false);
  const s = serien.find((x) => x.serie === gewaehlt) ?? null;
  const sichtbar = alle ? serien : serien.slice(0, 12);

  const daten = (s?.punkte ?? []).map((p) => ({
    ...p,
    // Die Farbe der Abweichung folgt z, nicht der rohen Differenz: bei der
    // Arbeitslosenquote ist ein Minus eine gute Nachricht.
    farbe: p.z === null ? "#9A8C74" : p.z > 0.05 ? GUT : p.z < -0.05 ? SCHLECHT : "#9A8C74",
  }));
  const letzter = s?.punkte[s.punkte.length - 1] ?? null;

  if (serien.length === 0) {
    return (
      <div className="h-[200px]">
        <Leer text={`Für ${ccy} gibt es noch keine Reihe mit mindestens zwei Veröffentlichungen.`} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {sichtbar.map((x) => (
          <button key={x.serie} type="button" onClick={() => setGewaehlt(x.serie)}
            className={cx("rounded-lg px-2.5 py-1 text-xs transition",
              x.serie === gewaehlt ? "bg-trading font-medium text-ink-on" : "bg-sand text-ink-muted hover:text-ink")}>
            {x.serie}
          </button>
        ))}
        {serien.length > 12 && (
          <button type="button" onClick={() => setAlle(!alle)} className="text-[11px] text-accent-soft hover:underline">
            {alle ? "weniger" : `alle ${serien.length}`}
          </button>
        )}
      </div>

      {s && letzter && (
        <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="text-[11px] uppercase tracking-[0.1em]">{KATEGORIE_LABEL[s.kategorie]}</span>
          <span>zuletzt {tagLang(letzter.datum)}:</span>
          <span>Erwartung <span className="tabular font-mono text-ink-soft">{fmtWert(letzter.erwartung, s.einheit)}</span></span>
          <span>Ist <span className="tabular font-mono text-ink">{fmtWert(letzter.ist, s.einheit)}</span></span>
          <span>Abw. <span className="tabular font-mono text-ink">{fmtAbweichung(letzter.abweichung, s.einheit)}</span></span>
        </div>
      )}

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} syncId="ist-erwartung">
            <CartesianGrid vertical={false} stroke={GITTER} />
            <XAxis dataKey="datum" tickFormatter={tagKurz} tick={{ fill: ACHSE, fontSize: 10 }}
              axisLine={false} tickLine={false} minTickGap={30} />
            <YAxis orientation="right" width={44} domain={["auto", "auto"]}
              tick={{ fill: ACHSE, fontSize: 10 }} axisLine={false} tickLine={false} />
            {s && /PMI|ISM|Business ?NZ|Ivey/i.test(s.serie) && (
              <ReferenceLine y={50} stroke="#9A8C74" strokeDasharray="4 4"
                label={{ value: "50", position: "insideBottomLeft", fill: ACHSE, fontSize: 10 }} />
            )}
            <Tooltip cursor={{ stroke: "#9A8C74" }} content={({ active, payload }) => {
              if (!active || !payload?.length || !s) return null;
              const p = payload[0].payload as (typeof daten)[number];
              return (
                <div className="rounded-lg border border-line-strong bg-[#17130F] px-3 py-2 text-xs shadow-card">
                  <p className="mb-1 text-ink-faint">{tagLang(p.datum)} · {p.titel}</p>
                  <p className="text-ink-soft">Erwartung: <span className="tabular text-ink">{fmtWert(p.erwartung, s.einheit)}</span></p>
                  <p className="text-ink-soft">Ist: <span className="tabular font-medium text-ink">{fmtWert(p.ist, s.einheit)}</span></p>
                  <p className="text-ink-soft">Vorwert: <span className="tabular text-ink">{fmtWert(p.vorwert, s.einheit)}</span></p>
                  <p className="text-ink-soft">Abweichung: <span className="tabular text-ink">{fmtAbweichung(p.abweichung, s.einheit)}</span>
                    {p.z !== null && <span className="ml-1 text-ink-faint">(z {fmtZ(p.z)})</span>}</p>
                  {p.quelle && <p className="mt-1 text-[10px] text-ink-faint">Ist: {QUELLE_LABEL[p.quelle as IstQuelle]}</p>}
                </div>
              );
            }} />
            <Legend verticalAlign="top" height={24} iconType="plainline"
              formatter={(v: string) => <span className="text-xs text-ink-soft">{v}</span>} />
            <Line name="Ist" dataKey="ist" stroke="#F5EFE3" strokeWidth={2.2}
              dot={{ r: 3, fill: "#F5EFE3", stroke: "#1E1811", strokeWidth: 1.5 }}
              connectNulls type="monotone" isAnimationActive={false} />
            <Line name="Erwartung" dataKey="erwartung" stroke="#E7A96B" strokeWidth={1.8} strokeDasharray="5 4"
              dot={{ r: 2.5, fill: "#E7A96B", stroke: "#1E1811", strokeWidth: 1 }}
              connectNulls type="monotone" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 h-[90px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daten} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} syncId="ist-erwartung">
            <XAxis dataKey="datum" hide />
            <YAxis orientation="right" width={44} domain={[-3, 3]} ticks={[-3, 0, 3]}
              tick={{ fill: ACHSE, fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}`} />
            <ReferenceLine y={0} stroke="#9A8C74" />
            <Tooltip cursor={{ fill: "rgba(154,140,116,0.12)" }} content={() => null} />
            <Bar dataKey="z" isAnimationActive={false} radius={[3, 3, 3, 3]}>
              {daten.map((p) => <Cell key={p.datum + p.titel} fill={p.farbe} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">
        Oben das Ist (weiss) gegen die Erwartung (gestrichelt). Unten die Überraschung in typischen Schritten:
        grün stützt {ccy}, rot belastet.
      </p>
    </div>
  );
}
