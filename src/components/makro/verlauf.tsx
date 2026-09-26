"use client";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cx } from "@/components/ui";
import { ZustandMarke } from "@/components/makro/teile";
import type { Indikator, Punkt, Gruppe } from "@/lib/makro/verlauf";

/**
 * Die Verlaufsseite einer Währung: je Kennzahl eine Karte mit dem aktuellen
 * Wert, der Veränderung im gewählten Zeitraum und dem Verlauf als Fläche.
 *
 * Der Zeitraum gilt für alle Karten zugleich und wird im Browser gefiltert —
 * Umschalten ist sofort da, ohne neu zu laden. Damit eine Quartals- oder
 * Jahresreihe im 6-Monats-Fenster nicht als einzelner Punkt dasteht, zählt
 * der letzte Wert VOR dem Fenster als Startpunkt mit.
 */

const ZEITRAEUME = [
  { key: "6m", label: "6 Monate", monate: 6 },
  { key: "1j", label: "1 Jahr", monate: 12 },
  { key: "2j", label: "2 Jahre", monate: 24 },
  { key: "3j", label: "3 Jahre", monate: 36 },
  { key: "alle", label: "Alles", monate: 1200 },
] as const;

const GRUPPEN: Gruppe[] = ["Wirtschaft", "Zinsen & Notenbank", "Positionierung", "Kontext"];

const AKZENT = "#E7A96B";
const GEDAEMPFT = "#7A6E5C";

function imFenster(p: Punkt[], monate: number): Punkt[] {
  if (p.length === 0) return p;
  const fenster = (bis: Date) => {
    const start = new Date(bis);
    start.setUTCMonth(start.getUTCMonth() - monate);
    const s = start.toISOString().slice(0, 10);
    const i = p.findIndex((x) => x.datum >= s);
    return i === -1 ? [] : p.slice(Math.max(0, i - 1));
  };
  const heute = fenster(new Date());
  // Veraltete Reihe (letzter Wert vor dem Fenster): dann den gleichen
  // Zeitraum bis zu ihrem letzten Wert zeigen — mit Veraltet-Marke, statt
  // einer leeren Karte.
  return heute.length > 1 ? heute : fenster(new Date(`${p[p.length - 1].datum}T12:00:00Z`));
}

/** Höchstens ~180 Punkte — eine Tagesreihe über drei Jahre wären 1000. */
function ausduennen(p: Punkt[], max = 180): Punkt[] {
  if (p.length <= max) return p;
  const schritt = p.length / max;
  const out: Punkt[] = [];
  for (let i = 0; i < max; i++) out.push(p[Math.floor(i * schritt)]);
  out[out.length - 1] = p[p.length - 1];
  return out;
}

const zahl = (v: number, einheit: string) => {
  const betrag = Math.abs(v);
  const n = betrag >= 100 ? v.toFixed(1) : betrag >= 10 ? v.toFixed(1) : v.toFixed(2);
  return einheit ? `${n} ${einheit}` : n;
};

const monatKurz = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-CH", { month: "short", year: "2-digit", timeZone: "UTC" });
const tagLang = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-CH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export function Verlauf({ ccy, indikatoren }: { ccy: string; indikatoren: Indikator[] }) {
  const [zeitraum, setZeitraum] = useState<(typeof ZEITRAEUME)[number]["key"]>("1j");
  const monate = ZEITRAEUME.find((z) => z.key === zeitraum)!.monate;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-2 text-[11px] uppercase tracking-[0.12em] text-ink-muted">Zeitraum</span>
        {ZEITRAEUME.map((z) => (
          <button key={z.key} type="button" onClick={() => setZeitraum(z.key)}
            className={cx("rounded-xl px-3 py-1.5 text-sm transition duration-150",
              z.key === zeitraum ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                : "bg-sand text-ink-muted hover:text-ink")}>
            {z.label}
          </button>
        ))}
      </div>

      {GRUPPEN.map((g) => {
        const liste = indikatoren.filter((i) => i.gruppe === g);
        if (liste.length === 0) return null;
        return (
          <section key={g}>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">{g}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {liste.map((i) => <Karte key={i.key} ccy={ccy} i={i} monate={monate} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Karte({ ccy, i, monate }: { ccy: string; i: Indikator; monate: number }) {
  const punkte = useMemo(() => ausduennen(imFenster(i.punkte, monate)), [i.punkte, monate]);
  const letzter = i.punkte[i.punkte.length - 1];
  const erster = punkte[0];
  const delta = letzter && erster && punkte.length > 1 ? letzter.wert - erster.wert : null;
  const deltaTon = delta === null || Math.abs(delta) < 1e-9 || i.besser === "neutral" ? "text-ink-soft"
    : (delta > 0) === (i.besser === "hoch") ? "text-good-bright" : "text-bad-bright";
  const farbe = i.status === "veraltet" ? GEDAEMPFT : AKZENT;
  const verlaufId = `v-${i.key}`;

  // Y-Achse mit etwas Luft, und die Hilfslinie immer im Bild, wenn sie nah ist.
  const werte = punkte.map((p) => p.wert);
  let min = Math.min(...werte), max = Math.max(...werte);
  if (i.referenz && i.referenz.wert >= min - (max - min) && i.referenz.wert <= max + (max - min)) {
    min = Math.min(min, i.referenz.wert); max = Math.max(max, i.referenz.wert);
  }
  const luft = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1;

  return (
    <div className={cx("rounded-2xl border bg-card p-4 shadow-card",
      i.status === "veraltet" ? "border-accent/30" : i.status === "fehlt" ? "border-bad/30" : "border-line/70")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-soft">{i.label}</p>
          {letzter ? (
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="tabular font-display text-2xl font-bold text-ink">{zahl(letzter.wert, i.einheit)}</span>
              {delta !== null && (
                <span className={cx("tabular text-xs font-medium", deltaTon)}>
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "▪"} {zahl(Math.abs(delta), i.einheit === "%" || i.einheit === "% BIP" || i.einheit === "% OI" ? "pp" : "")}
                  <span className="ml-1 font-normal text-ink-faint">seit {monatKurz(erster.datum)}</span>
                </span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 font-display text-2xl font-bold text-ink-faint">—</p>
          )}
        </div>
      </div>

      {punkte.length > 1 ? (
        <div className="mt-2 h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={punkte} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={verlaufId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={farbe} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={farbe} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#2E2519" strokeDasharray="0" />
              <XAxis dataKey="datum" tickFormatter={monatKurz} tick={{ fill: "#7A6E5C", fontSize: 10 }}
                axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis orientation="right" domain={[min - luft, max + luft]} width={38}
                tick={{ fill: "#7A6E5C", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1))} tickCount={4} />
              {i.referenz && (
                <ReferenceLine y={i.referenz.wert} stroke="#9A8C74" strokeDasharray="4 4" strokeWidth={1}
                  label={{ value: i.referenz.text, position: "insideTopLeft", fill: "#7A6E5C", fontSize: 10 }} />
              )}
              <Tooltip
                cursor={{ stroke: "#9A8C74", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Punkt;
                  return (
                    <div className="rounded-lg border border-line-strong bg-[#17130F] px-2.5 py-1.5 text-xs shadow-card">
                      <p className="text-ink-faint">{tagLang(p.datum)}</p>
                      <p className="tabular font-medium text-ink">{zahl(p.wert, i.einheit)}</p>
                    </div>
                  );
                }} />
              <Area type={i.stufe ? "stepAfter" : "monotone"} dataKey="wert" stroke={farbe} strokeWidth={2}
                fill={`url(#${verlaufId})`} isAnimationActive={false}
                dot={punkte.length <= 24 ? { r: 3, fill: farbe, stroke: "#1E1811", strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: farbe, stroke: "#1E1811", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-2 flex h-[150px] items-center justify-center rounded-xl bg-sand/40 text-xs text-ink-faint">
          {i.punkte.length === 1 ? "Nur ein Wert — noch kein Verlauf." : "Keine Daten."}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-snug text-ink-muted">{i.hinweis}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-faint">
        {letzter && <span>Stand {monatKurz(letzter.datum)}</span>}
        {i.quelle && <span>· {i.quelle}</span>}
        {i.feld && <ZustandMarke ccy={ccy} feld={i.feld} status={i.status} />}
      </div>
    </div>
  );
}
