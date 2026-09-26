"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cx } from "@/components/ui";
import { ScoreBalken, ZustandMarke } from "@/components/makro/teile";
import type { Indikator, Punkt } from "@/lib/makro/verlauf";
import type { ZinsSchritt } from "@/lib/makro/bewertung";

/**
 * Die Währungsseite nach Kerims drei Ebenen (26.09.2026 abends).
 *
 * Jede Ebene ist EIN Block mit EINER gemeinsamen Grafik — nicht zwölf
 * Kästen. Der Sinn: auf einen Blick sehen, ob die Dinge einer Ebene sich
 * einig sind.
 *
 *   Ebene 1  PMI Industrie, PMI Dienste, BIP — als Abstand zur Schwelle
 *            (PMI − 50, BIP − 0) auf einer Achse. Über der Nulllinie heisst
 *            für alle drei dasselbe: positiv. Die echten Werte stehen im
 *            Tooltip und in den Chips darüber.
 *   Ebene 2  Leitzins (Treppe), Inflation und 2J-Rendite — alle in % und
 *            damit ehrlich auf einer Achse. Jeder Zinsschritt ist markiert;
 *            liegt die 2J-Rendite unter dem Leitzins, preist der Markt
 *            Senkungen ein. Das ist die Absicht, die man sehen soll.
 *   Ebene 3  wird nur angezeigt, nicht gewertet.
 *
 * Keine zweite Y-Achse, nirgends. Farben: die drei ersten Slots der
 * geprüften Kategorien-Palette (dunkel), validiert gegen die Kartenfläche.
 */

const FARBE = ["#3987e5", "#d95926", "#199e70"] as const;
const GITTER = "#2E2519";
const ACHSE = "#7A6E5C";

const ZEITRAEUME = [
  { key: "6m", label: "6 Monate", monate: 6 },
  { key: "1j", label: "1 Jahr", monate: 12 },
  { key: "2j", label: "2 Jahre", monate: 24 },
  { key: "3j", label: "3 Jahre", monate: 36 },
  { key: "alle", label: "Alles", monate: 1200 },
] as const;

export interface EbenenDaten {
  ccy: string;
  scores: { e1: number | null; e2: number | null };
  e1: { pmiI: Indikator; pmiD: Indikator; bip: Indikator; kontext: Indikator[] };
  e2: {
    leitzins: Indikator; inflation: Indikator; zweijahr: Indikator; kontext: Indikator[];
    schritte: ZinsSchritt[];
    zyklus: { label: string; auto: boolean; ton: "gut" | "schlecht" | "neutral" } | null;
    erwartung: { wert: number | null; text: string };
    notiz: string;
  };
  e3: {
    cot: Indikator; cotReal: Indikator;
    abhaengigkeit: string;
    regime: string;
    ereignisse: { titel: string; datum: string; richtung: 1 | -1; notiz: string }[];
  };
  /** Das Formular für Zyklus und Notiz — vom Server gerendert. */
  notizFormular?: React.ReactNode;
}

/* ------------------------------------------------------------ Hilfen */

const startDatum = (monate: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monate);
  return d.toISOString().slice(0, 10);
};

/** Punkte im Fenster, plus der letzte davor als Anker. */
function fenster(p: Punkt[], ab: string): Punkt[] {
  const i = p.findIndex((x) => x.datum >= ab);
  if (i === -1) return p.slice(-1);
  return p.slice(Math.max(0, i - 1));
}

type Zeile = { datum: string } & Record<string, number | string | null>;

/** Mehrere Reihen auf eine gemeinsame Datumsachse legen, höchstens ~200 Zeilen. */
function zusammen(reihen: { key: string; punkte: Punkt[]; minus?: number }[], ab: string): Zeile[] {
  const map = new Map<string, Zeile>();
  for (const r of reihen) {
    for (const p of fenster(r.punkte, ab)) {
      const z = map.get(p.datum) ?? ({ datum: p.datum } as Zeile);
      z[r.key] = p.wert - (r.minus ?? 0);
      z[`${r.key}_roh`] = p.wert;
      map.set(p.datum, z);
    }
  }
  const zeilen = [...map.values()].sort((a, b) => a.datum.localeCompare(b.datum));
  if (zeilen.length <= 200) return zeilen;
  // Ausdünnen, aber jede Zeile mit einem Wert einer seltenen Reihe behalten.
  const schritt = zeilen.length / 200;
  const behalten = new Set<number>();
  for (let i = 0; i < 200; i++) behalten.add(Math.floor(i * schritt));
  behalten.add(zeilen.length - 1);
  return zeilen.filter((z, i) => behalten.has(i)
    || reihen.some((r) => r.punkte.length < 80 && z[r.key] !== undefined));
}

const monatKurz = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-CH", { month: "short", year: "2-digit", timeZone: "UTC" });
const tagLang = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-CH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (v: number, n = 1) => v.toFixed(n);
const letzter = (i: Indikator) => i.punkte[i.punkte.length - 1] ?? null;

/* ------------------------------------------------------------ Seite */

export function EbenenVerlauf(d: EbenenDaten) {
  const [zeitraum, setZeitraum] = useState<(typeof ZEITRAEUME)[number]["key"]>("1j");
  const ab = startDatum(ZEITRAEUME.find((z) => z.key === zeitraum)!.monate);

  return (
    <div className="space-y-5">
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

      <EbeneWirtschaft d={d} ab={ab} />
      <EbeneZentralbank d={d} ab={ab} />
      <EbeneSentiment d={d} ab={ab} />
    </div>
  );
}

function EbenenKopf({ nr, titel, unter, score, gewertet = true }: {
  nr: number; titel: string; unter: string; score?: number | null; gewertet?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3 border-b border-line/70 pb-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-tint
                       font-display text-sm font-bold text-accent-soft">{nr}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-bold leading-tight text-ink">{titel}</h2>
        <p className="text-xs text-ink-muted">{unter}</p>
      </div>
      {gewertet ? <ScoreBalken score={score ?? null} breit={120} />
        : <span className="rounded-lg bg-sand px-2 py-1 text-[11px] text-ink-muted">nur angezeigt · nicht gewertet</span>}
    </div>
  );
}

/* ------------------------------------------------------- Ebene 1 */

function EbeneWirtschaft({ d, ab }: { d: EbenenDaten; ab: string }) {
  const { pmiI, pmiD, bip, kontext } = d.e1;
  const serien = [
    { key: "pmiI", ind: pmiI, schwelle: 50, name: "PMI Industrie" },
    { key: "pmiD", ind: pmiD, schwelle: 50, name: "PMI Dienste" },
    { key: "bip", ind: bip, schwelle: 0, name: "BIP zum Vorjahr" },
  ];
  const daten = useMemo(() => zusammen(
    serien.map((s) => ({ key: s.key, punkte: s.ind.punkte, minus: s.schwelle })), ab),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [pmiI, pmiD, bip, ab]);

  // Einig? Nur frische Werte zählen — ein veralteter Wert entscheidet nichts.
  const vorzeichen = serien
    .filter((s) => s.ind.status === "ok" && letzter(s.ind))
    .map((s) => Math.sign(letzter(s.ind)!.wert - s.schwelle));
  const einig = vorzeichen.length === 0 ? null
    : vorzeichen.every((v) => v > 0) ? "positiv"
      : vorzeichen.every((v) => v < 0) ? "negativ" : "gemischt";

  return (
    <section className="rounded-2xl border border-line/70 bg-card p-5 shadow-card">
      <EbenenKopf nr={1} titel="Die Wirtschaft"
        unter="Umfragen der Einkaufsmanager und Wachstum — über 50 bzw. über 0 ist positiv."
        score={d.scores.e1} />

      <div className="flex flex-wrap items-center gap-2">
        {serien.map((s, i) => {
          const l = letzter(s.ind);
          const pos = l ? l.wert > s.schwelle : null;
          return (
            <span key={s.key} className="inline-flex items-center gap-2 rounded-xl border border-line bg-sand/60 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: FARBE[i] }} />
              <span className="text-xs text-ink-muted">{s.name}</span>
              <span className="tabular text-sm font-semibold text-ink">
                {l ? `${fmt(l.wert)}${s.key === "bip" ? " %" : ""}` : "—"}
              </span>
              {pos !== null && s.ind.status === "ok" && (
                <span className={cx("text-xs font-semibold", pos ? "text-good-bright" : "text-bad-bright")}>
                  {pos ? "▲ positiv" : "▼ negativ"}
                </span>
              )}
              <ZustandMarke ccy={d.ccy} feld={s.ind.feld!} status={s.ind.status} />
            </span>
          );
        })}
        {einig && (
          <span className={cx("ml-auto rounded-xl px-3 py-1.5 text-sm font-semibold",
            einig === "positiv" ? "bg-good-tint text-good-bright"
              : einig === "negativ" ? "bg-bad-tint text-bad-bright" : "bg-sand text-ink-soft")}>
            {einig === "positiv" ? "Einig positiv — spricht für Long"
              : einig === "negativ" ? "Einig negativ — spricht für Short" : "Gemischt — keine klare Richtung"}
          </span>
        )}
      </div>

      <div className="mt-4 h-[240px]">
        {daten.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GITTER} />
              <XAxis dataKey="datum" tickFormatter={monatKurz} tick={{ fill: ACHSE, fontSize: 10 }}
                axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis orientation="right" width={36} tick={{ fill: ACHSE, fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}`} />
              <ReferenceLine y={0} stroke="#9A8C74" strokeWidth={1.5}
                label={{ value: "Schwelle (PMI 50 · BIP 0 %)", position: "insideBottomLeft", fill: ACHSE, fontSize: 10 }} />
              <Tooltip cursor={{ stroke: "#9A8C74" }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const z = payload[0].payload as Zeile;
                return (
                  <div className="rounded-lg border border-line-strong bg-[#17130F] px-3 py-2 text-xs shadow-card">
                    <p className="mb-1 text-ink-faint">{tagLang(String(label))}</p>
                    {serien.map((s, i) => z[`${s.key}_roh`] !== undefined && (
                      <p key={s.key} className="flex items-center gap-2 text-ink-soft">
                        <span className="h-2 w-2 rounded-full" style={{ background: FARBE[i] }} />
                        {s.name}: <span className="tabular font-medium text-ink">
                          {fmt(Number(z[`${s.key}_roh`]))}{s.key === "bip" ? " %" : ""}</span>
                      </p>
                    ))}
                  </div>
                );
              }} />
              <Legend verticalAlign="top" height={24} iconType="plainline"
                formatter={(v: string) => <span className="text-xs text-ink-soft">{v}</span>} />
              {serien.map((s, i) => (
                <Line key={s.key} name={s.name} dataKey={s.key} stroke={FARBE[i]} strokeWidth={2}
                  dot={s.key === "bip" ? { r: 4, fill: FARBE[i], stroke: "#1E1811", strokeWidth: 2 } : false}
                  activeDot={{ r: 5, stroke: "#1E1811", strokeWidth: 2 }}
                  connectNulls type="monotone" isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : <Leer />}
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">
        Achse: Abstand zur Schwelle — PMI in Punkten über/unter 50, BIP in % über/unter 0.
        Die echten Werte stehen oben und beim Überfahren.
      </p>

      <KontextListe titel="Weitere Kennzahlen (nicht gewertet)" liste={kontext} ccy={d.ccy} ab={ab} />
    </section>
  );
}

/* ------------------------------------------------------- Ebene 2 */

function EbeneZentralbank({ d, ab }: { d: EbenenDaten; ab: string }) {
  const { leitzins, inflation, zweijahr, kontext, schritte, zyklus, erwartung, notiz } = d.e2;
  const serien = [
    { key: "zins", ind: leitzins, name: "Leitzins", stufe: true },
    { key: "infl", ind: inflation, name: "Inflation" },
    { key: "zwei", ind: zweijahr, name: "2J-Rendite (Erwartung des Marktes)" },
  ];
  const daten = useMemo(() => zusammen(serien.map((s) => ({ key: s.key, punkte: s.ind.punkte })), ab),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [leitzins, inflation, zweijahr, ab]);

  const imFenster = schritte.filter((s) => s.datum >= ab);
  const letzterSchritt = schritte[schritte.length - 1];
  const zinsJetzt = letzter(leitzins);
  const monateSeit = letzterSchritt
    ? Math.round((Date.now() - Date.parse(`${letzterSchritt.datum}T12:00:00Z`)) / (30.44 * 86_400_000)) : null;

  return (
    <section className="rounded-2xl border border-line/70 bg-card p-5 shadow-card">
      <EbenenKopf nr={2} titel="Die Zentralbank"
        unter="Was hat sie getan — erhöht, gesenkt, gehalten — und was hat sie vor?"
        score={d.scores.e2} />

      <div className="grid gap-3 md:grid-cols-3">
        <Kachel titel="Zyklus">
          {zyklus ? (
            <span className={cx("font-display text-lg font-bold",
              zyklus.ton === "gut" ? "text-good-bright" : zyklus.ton === "schlecht" ? "text-bad-bright" : "text-ink")}>
              {zyklus.label}
            </span>
          ) : <span className="text-sm text-ink-faint">unbekannt</span>}
          {zyklus?.auto && <span className="mt-0.5 block text-[11px] text-ink-faint">aus dem Zinsverlauf abgeleitet</span>}
        </Kachel>
        <Kachel titel="Letzter Entscheid">
          {letzterSchritt ? (
            <>
              <span className={cx("tabular font-display text-lg font-bold",
                letzterSchritt.bps > 0 ? "text-good-bright" : "text-bad-bright")}>
                {letzterSchritt.bps > 0 ? "Erhöht" : "Gesenkt"} {letzterSchritt.bps > 0 ? "+" : ""}{letzterSchritt.bps} bp
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-faint">
                am {tagLang(letzterSchritt.datum)} auf {fmt(letzterSchritt.neu, 2)} %
                {monateSeit !== null && monateSeit >= 1 && ` · seitdem ${monateSeit} Mt. gehalten`}
              </span>
            </>
          ) : (
            <span className="text-sm text-ink-soft">
              {zinsJetzt ? `Gehalten bei ${fmt(zinsJetzt.wert, 2)} %` : "—"}
            </span>
          )}
        </Kachel>
        <Kachel titel="Absicht (was der Markt erwartet)">
          <span className={cx("font-display text-lg font-bold",
            erwartung.wert === null ? "text-ink-faint"
              : erwartung.wert > 0.1 ? "text-good-bright" : erwartung.wert < -0.1 ? "text-bad-bright" : "text-ink")}>
            {erwartung.wert === null ? "—"
              : erwartung.wert > 0.1 ? "Erhöhungen" : erwartung.wert < -0.1 ? "Senkungen" : "Keine Änderung"}
          </span>
          <span className="mt-0.5 block text-[11px] text-ink-faint">{erwartung.text}</span>
        </Kachel>
      </div>

      <div className="mt-4 h-[240px]">
        {daten.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GITTER} />
              <XAxis dataKey="datum" tickFormatter={monatKurz} tick={{ fill: ACHSE, fontSize: 10 }}
                axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis orientation="right" width={36} tick={{ fill: ACHSE, fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(1)}`} />
              <ReferenceLine y={2} stroke="#9A8C74" strokeDasharray="4 4"
                label={{ value: "2 % Inflationsziel", position: "insideTopLeft", fill: ACHSE, fontSize: 10 }} />
              <Tooltip cursor={{ stroke: "#9A8C74" }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const z = payload[0].payload as Zeile;
                return (
                  <div className="rounded-lg border border-line-strong bg-[#17130F] px-3 py-2 text-xs shadow-card">
                    <p className="mb-1 text-ink-faint">{tagLang(String(label))}</p>
                    {serien.map((s, i) => z[s.key] !== undefined && (
                      <p key={s.key} className="flex items-center gap-2 text-ink-soft">
                        <span className="h-2 w-2 rounded-full" style={{ background: FARBE[i] }} />
                        {s.name}: <span className="tabular font-medium text-ink">{fmt(Number(z[s.key]), 2)} %</span>
                      </p>
                    ))}
                  </div>
                );
              }} />
              <Legend verticalAlign="top" height={24} iconType="plainline"
                formatter={(v: string) => <span className="text-xs text-ink-soft">{v}</span>} />
              {serien.map((s, i) => (
                <Line key={s.key} name={s.name} dataKey={s.key} stroke={FARBE[i]} strokeWidth={2}
                  dot={false} activeDot={{ r: 5, stroke: "#1E1811", strokeWidth: 2 }}
                  connectNulls type={s.stufe ? "stepAfter" : "monotone"} isAnimationActive={false} />
              ))}
              {/* Jeder Zinsschritt als Punkt auf der Leitzins-Treppe: grün erhöht, rot gesenkt. */}
              {imFenster.map((s) => (
                <ReferenceDot key={s.datum} x={daten.find((z) => z.datum >= s.datum)?.datum ?? s.datum} y={s.neu}
                  r={5} fill={s.bps > 0 ? "#5FC2A6" : "#E28B72"} stroke="#1E1811" strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : <Leer />}
      </div>

      {imFenster.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...imFenster].reverse().map((s) => (
            <span key={s.datum} className={cx("rounded-lg px-2 py-1 text-[11px]",
              s.bps > 0 ? "bg-good-tint text-good-bright" : "bg-bad-tint text-bad-bright")}>
              {monatKurz(s.datum)} · {s.bps > 0 ? "+" : ""}{s.bps} bp → {fmt(s.neu, 2)} %
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-line bg-sand/40 p-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Warum — und welche Sorge besteht?
        </p>
        {notiz
          ? <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{notiz}</p>
          : <p className="mt-1 text-sm text-ink-faint">Noch nichts notiert — z.B. „EZB senkt wegen schwacher Industrie, Sorge: Rezession in DE".</p>}
        {d.notizFormular}
      </div>

      <KontextListe titel="Kontext (nicht gewertet)" liste={kontext} ccy={d.ccy} ab={ab} />
    </section>
  );
}

/* ------------------------------------------------------- Ebene 3 */

function EbeneSentiment({ d, ab }: { d: EbenenDaten; ab: string }) {
  const { cot, cotReal, abhaengigkeit, regime, ereignisse } = d.e3;
  const serien = [
    { key: "fonds", ind: cot, name: "Leveraged Funds" },
    { key: "real", ind: cotReal, name: "Asset Manager" },
  ];
  const daten = useMemo(() => zusammen(serien.map((s) => ({ key: s.key, punkte: s.ind.punkte })), ab),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [cot, cotReal, ab]);

  return (
    <section className="rounded-2xl border border-line/70 bg-card/70 p-5">
      <EbenenKopf nr={3} titel="Das Sentiment"
        unter="Geopolitik, Ereignisse, Abhängigkeiten — wohin das Geld gerade fliesst." gewertet={false} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Kachel titel="Wovon die Währung abhängt">
            <span className="text-sm text-ink-soft">{abhaengigkeit}</span>
          </Kachel>
          <Kachel titel="Risiko-Regime">
            <span className="text-sm text-ink-soft">{regime}</span>
          </Kachel>
          <Kachel titel="Ereignisse, die diese Währung treffen">
            {ereignisse.length === 0 ? (
              <span className="text-sm text-ink-faint">Nichts eingetragen.</span>
            ) : (
              <ul className="space-y-1.5">
                {ereignisse.map((e) => (
                  <li key={e.titel + e.datum} className="text-sm">
                    <span className={cx("mr-1.5 font-semibold", e.richtung > 0 ? "text-good-bright" : "text-bad-bright")}>
                      {e.richtung > 0 ? "profitiert" : "leidet"}
                    </span>
                    <span className="text-ink-soft">{e.titel}</span>
                    <span className="ml-1 text-[11px] text-ink-faint">seit {tagLang(e.datum)}</span>
                    {e.notiz && <span className="block text-[11px] text-ink-muted">{e.notiz}</span>}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/trading/fundamentals#ereignisse" className="mt-2 inline-block text-[11px] text-accent-soft hover:underline">
              Ereignis eintragen →
            </Link>
          </Kachel>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Positionierung (COT, netto in % des Open Interest)
          </p>
          <div className="h-[220px]">
            {daten.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={GITTER} />
                  <XAxis dataKey="datum" tickFormatter={monatKurz} tick={{ fill: ACHSE, fontSize: 10 }}
                    axisLine={false} tickLine={false} minTickGap={40} />
                  <YAxis orientation="right" width={36} tick={{ fill: ACHSE, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(0)}`} />
                  <ReferenceLine y={0} stroke="#9A8C74" strokeWidth={1.5} />
                  <Tooltip cursor={{ stroke: "#9A8C74" }} content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const z = payload[0].payload as Zeile;
                    return (
                      <div className="rounded-lg border border-line-strong bg-[#17130F] px-3 py-2 text-xs shadow-card">
                        <p className="mb-1 text-ink-faint">{tagLang(String(label))}</p>
                        {serien.map((s, i) => z[s.key] !== undefined && (
                          <p key={s.key} className="flex items-center gap-2 text-ink-soft">
                            <span className="h-2 w-2 rounded-full" style={{ background: FARBE[i] }} />
                            {s.name}: <span className="tabular font-medium text-ink">{fmt(Number(z[s.key]))} %</span>
                          </p>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend verticalAlign="top" height={24} iconType="plainline"
                    formatter={(v: string) => <span className="text-xs text-ink-soft">{v}</span>} />
                  {serien.map((s, i) => (
                    <Line key={s.key} name={s.name} dataKey={s.key} stroke={FARBE[i]} strokeWidth={2}
                      dot={false} connectNulls type="monotone" isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : <Leer />}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------- Bausteine */

function Kachel({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-sand/40 p-3">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">{titel}</p>
      {children}
    </div>
  );
}

function Leer() {
  return (
    <div className="flex h-full items-center justify-center rounded-xl bg-sand/40 text-xs text-ink-faint">
      Noch kein Verlauf für diesen Zeitraum.
    </div>
  );
}

/**
 * Die Kennzahlen, die angezeigt, aber nicht gewertet werden — als schmale
 * Zeilen mit Minigrafik statt als eigene Kästen.
 */
function KontextListe({ titel, liste, ccy, ab }: { titel: string; liste: Indikator[]; ccy: string; ab: string }) {
  if (liste.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">{titel}</p>
      <ul className="divide-y divide-line/60">
        {liste.map((i) => {
          const p = fenster(i.punkte, ab);
          const l = letzter(i);
          const delta = p.length > 1 && l ? l.wert - p[0].wert : null;
          const ton = delta === null || Math.abs(delta) < 1e-9 || i.besser === "neutral" ? "text-ink-muted"
            : (delta > 0) === (i.besser === "hoch") ? "text-good-bright" : "text-bad-bright";
          return (
            <li key={i.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[180px_1fr_110px_auto]">
              <span className="text-sm text-ink-soft">{i.label}</span>
              <span className="tabular text-right text-sm text-ink sm:order-3">
                {l ? `${fmt(l.wert, 2)} ${i.einheit}` : "—"}
                {delta !== null && <span className={cx("ml-1.5 text-[11px]", ton)}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "▪"}{fmt(Math.abs(delta), 2)}</span>}
              </span>
              <span className="col-span-2 h-7 sm:order-2 sm:col-span-1">
                {p.length > 1 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={p}>
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <Line dataKey="wert" stroke={i.status === "veraltet" ? "#7A6E5C" : "#E7A96B"} strokeWidth={1.5}
                        dot={false} isAnimationActive={false} type={i.stufe ? "stepAfter" : "monotone"} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </span>
              <span className="col-span-2 flex flex-wrap items-center justify-end gap-1.5 text-[10px] text-ink-faint sm:order-4 sm:col-span-1">
                {l && <span>{monatKurz(l.datum)}</span>}
                {i.feld && <ZustandMarke ccy={ccy} feld={i.feld} status={i.status} />}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
