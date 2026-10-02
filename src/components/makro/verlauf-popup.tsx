"use client";
import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cx } from "@/components/ui";

/**
 * Verlauf als Pop-up (02.10.2026). Kerim: „Ob die Zinsen bei 4 % stehen,
 * interessiert mich weniger — mich interessiert, wohin sie gehen und wie
 * sie zum Ziel stehen." Deshalb mehrere Linien auf EINER Prozent-Achse
 * (keine zweite Achse), das Zielband als Fläche, und darunter in Worten,
 * was der Markt schon erwartet.
 *
 * Farben: kategorial in fester Reihenfolge, für die dunkle Fläche geprüft.
 */
const FARBEN = ["#3987e5", "#d95926", "#199e70"];
const GITTER = "#2E2519";
const ACHSE = "#7A6E5C";

export interface VerlaufLinie { label: string; punkte: { datum: string; wert: number }[]; stufe?: boolean }

const ZEIT = [
  { key: "1j", label: "1 Jahr", monate: 12 },
  { key: "2j", label: "2 Jahre", monate: 24 },
  { key: "5j", label: "5 Jahre", monate: 60 },
] as const;

export function VerlaufPopup({ titel, knopf, linien, einheit = "%", band, referenz, zeilen = [] }: {
  titel: string;
  knopf: string;
  linien: VerlaufLinie[];
  einheit?: string;
  /** Zielband als Fläche, z.B. Inflationsziel. */
  band?: { min: number; max: number; text: string };
  /** Waagrechte Linie, z.B. 50 beim PMI. */
  referenz?: { wert: number; text: string };
  /** Sätze unter dem Diagramm: Realzins, Markterwartung, nächster Schritt. */
  zeilen?: string[];
}) {
  const [offen, setOffen] = useState(false);
  const [zeit, setZeit] = useState<(typeof ZEIT)[number]["key"]>("2j");

  const daten = useMemo(() => {
    const monate = ZEIT.find((z) => z.key === zeit)!.monate;
    const ab = new Date();
    ab.setUTCMonth(ab.getUTCMonth() - monate);
    const grenze = ab.toISOString().slice(0, 10);
    const tage = new Map<string, Record<string, number | string>>();
    linien.forEach((l, i) => {
      for (const p of l.punkte) {
        if (p.datum < grenze) continue;
        const z = tage.get(p.datum) ?? { datum: p.datum };
        z[`l${i}`] = p.wert;
        tage.set(p.datum, z);
      }
    });
    return [...tage.values()].sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
  }, [linien, zeit]);

  const leer = linien.every((l) => l.punkte.length === 0);

  return (
    <>
      <button type="button" onClick={() => setOffen(true)} disabled={leer}
        className="text-[11px] text-accent-soft hover:underline disabled:text-ink-faint disabled:no-underline">
        {knopf} ↗
      </button>
      {offen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOffen(false)}>
          <div className="w-full max-w-3xl rounded-2xl border border-line bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label={titel}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-semibold text-ink">{titel}</h3>
              <div className="ml-auto flex gap-1">
                {ZEIT.map((z) => (
                  <button key={z.key} type="button" onClick={() => setZeit(z.key)}
                    className={cx("rounded-lg px-2.5 py-1 text-xs", zeit === z.key ? "bg-accent font-medium text-ink-on" : "bg-sand text-ink-muted hover:text-ink")}>
                    {z.label}
                  </button>
                ))}
                <button type="button" onClick={() => setOffen(false)} className="ml-2 rounded-lg bg-sand px-2.5 py-1 text-xs text-ink-muted hover:text-ink" aria-label="Schliessen">✕</button>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-ink-soft">
              {linien.map((l, i) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded" style={{ background: FARBEN[i] }} />{l.label}
                </span>
              ))}
              {band && <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-[#199e70]/20" />{band.text}</span>}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daten} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GITTER} vertical={false} />
                  <XAxis dataKey="datum" tick={{ fill: ACHSE, fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40}
                    tickFormatter={(d: string) => d.slice(0, 7)} />
                  <YAxis tick={{ fill: ACHSE, fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]}
                    tickFormatter={(x: number) => `${x}${einheit === "%" ? " %" : ""}`} />
                  {band && <ReferenceArea y1={band.min === band.max ? band.min - 0.3 : band.min} y2={band.min === band.max ? band.max + 0.3 : band.max}
                    fill="#199e70" fillOpacity={0.12} stroke="none" ifOverflow="extendDomain" />}
                  {referenz && <ReferenceLine y={referenz.wert} stroke={ACHSE} strokeDasharray="4 4"
                    label={{ value: referenz.text, fill: ACHSE, fontSize: 10, position: "insideTopLeft" }} />}
                  <Tooltip contentStyle={{ background: "#1C1610", border: "1px solid #3A2F22", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "#C9BBA3" }}
                    formatter={(w: number, name: string) => [`${Number(w).toFixed(2)}${einheit === "%" ? " %" : ""}`, linien[Number(name.slice(1))]?.label ?? name]} />
                  {linien.map((l, i) => (
                    <Line key={l.label} dataKey={`l${i}`} type={l.stufe ? "stepAfter" : "monotone"} stroke={FARBEN[i]}
                      strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {zeilen.length > 0 && (
              <ul className="mt-3 space-y-1">
                {zeilen.map((z) => <li key={z} className="text-xs leading-snug text-ink-soft">• {z}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
