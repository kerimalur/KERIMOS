"use client";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Card, CardTitle, Empty, cx } from "@/components/ui";
import {
  ERGEBNIS_FARBE, TradeOverlay, datumDE, type TradeLage,
} from "@/components/backtest-trade-karte";
import {
  RESULT_LABEL, type BacktestResult, type NativeBacktestTrade,
} from "@/lib/backtest-types";
import type { Spur, ZeitstrahlBild, ZeitstrahlTrade } from "@/lib/confluence/zeitstrahl-typen";

/**
 * Die drei Fundamental-Spuren als Zeitstrahl.
 *
 * Warum ein Bild und nicht noch eine Tabelle: eine Tabelle beantwortet „wie
 * oft ging es gut, wenn der Faktor dafür stand", ein Zeitstrahl beantwortet
 * „wo im Verlauf sass dieser eine Trade". Das Zweite ist die Frage, die man
 * beim Durchsehen der Verluste wirklich hat.
 *
 * ─── Zwei Dinge sind Absicht und keine Design-Laune ───
 *
 * 1. **Die Form des Punktes ist die Richtung.** Eine steigende Linie ist nur
 *    dann Rückenwind, wenn man long war. Ohne Richtung im Symbol würde das
 *    Bild Muster zeigen, die nur daher kommen, dass mal so und mal so
 *    gehandelt wurde.
 *
 * 2. **Unter jeder Spur steht der Trenn-Befund.** Bei vierzig Trades klebt
 *    irgendwo garantiert eine Traube roter Punkte an einem Hoch — das ist
 *    Zufall, kein Befund. Das Bild stellt die Frage, der Satz darunter
 *    beantwortet sie (dieselbe Wilson-Prüfung wie in der Tabellensicht).
 */

const B = 800;
const PAD_L = 38, PAD_R = 10, PAD_Y = 12;
const H_GROSS = 156, H_FACETTE = 62, H_RASTER = 190, PAD_B = 20;

/** Zone, in der die Spur für Long spricht — bewusst nicht grün: „für Long" ist nicht „gut". */
const FARBE_LONG = "#6FA3D8";
const FARBE_SHORT = "#E7A96B";
const FARBE_LINIE = "#C4B4EE";
const FARBE_GEGEN = "#9A8C74";
const FARBE_GITTER = "#3E3222";

const MONAT_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const TAG = 86_400_000;
const zuMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const zuIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Modus = "kalender" | "jahre" | "monate";

const MODI: { key: Modus; label: string; hinweis: string }[] = [
  { key: "kalender", label: "Kalender", hinweis: "Durchgehend vom ersten bis zum letzten Trade — ziehen zum Verschieben." },
  { key: "jahre", label: "Jahre übereinander", hinweis: "Ein Streifen je Jahr, gleiche Achse — so liegt jeder Januar untereinander." },
  { key: "monate", label: "Monatsraster", hinweis: "Alle Jahre in zwölf Spalten geklappt — zeigt, ob ein Kalendermonat auffällt." },
];

type ErgebnisFilter = "alle" | "tp" | "sl" | "be" | "skip";

/**
 * Der Ergebnisfilter.
 *
 * Er ersetzt nicht die getrennten Spuren, er ergänzt sie: der Filter zeigt
 * eine Hälfte, das Nebeneinander zeigt den Unterschied. Gesucht ist meistens
 * der Unterschied — aber wer dreissig Verluste durchklickt, will die Gewinner
 * eben doch für einen Moment weghaben.
 */
const FILTER: { key: ErgebnisFilter; label: string; ergebnisse: BacktestResult[] }[] = [
  { key: "alle", label: "alle", ergebnisse: [] },
  { key: "tp", label: "nur TP", ergebnisse: ["full_tp", "teil_tp_be"] },
  { key: "sl", label: "nur SL", ergebnisse: ["sl"] },
  { key: "be", label: "nur Breakeven", ergebnisse: ["breakeven"] },
  { key: "skip", label: "nur Skips", ergebnisse: ["skip"] },
];

const GEWINN: BacktestResult[] = ["full_tp", "teil_tp_be"];

interface HoverStand {
  trade: ZeitstrahlTrade;
  xPct: number;
  yPct: number;
  wert: number | null;
}

/* -------------------------------------------------------------- Gitter */

interface Gitterlinie { t: number; jahr: boolean; label: string | null }

function gitterlinien(vonMs: number, bisMs: number): Gitterlinie[] {
  const raus: Gitterlinie[] = [];
  const start = new Date(vonMs);
  let jahr = start.getUTCFullYear();
  let monat = start.getUTCMonth() + 1;
  const monate = (bisMs - vonMs) / (30.44 * TAG);
  const nurJahre = monate > 40;
  const beschriftet = monate <= 15;

  for (let i = 0; i < 500; i++) {
    const t = Date.UTC(jahr, monat - 1, 1);
    if (t > bisMs) break;
    const istJahr = monat === 1;
    if (t >= vonMs && (!nurJahre || istJahr)) {
      raus.push({
        t, jahr: istJahr,
        label: istJahr ? String(jahr) : beschriftet ? MONAT_KURZ[monat - 1] : null,
      });
    }
    monat++;
    if (monat > 12) { monat = 1; jahr++; }
  }
  return raus;
}

/* ------------------------------------------------------------- Symbole */

function Marke({
  x, y, trade, stumm, onKlick, onHover, onWeg,
}: {
  x: number; y: number; trade: ZeitstrahlTrade; stumm: boolean;
  onKlick: () => void; onHover: () => void; onWeg: () => void;
}) {
  const farbe = ERGEBNIS_FARBE[trade.ergebnis];
  const gemeinsam = {
    onClick: onKlick,
    onMouseEnter: onHover,
    onMouseLeave: onWeg,
    style: { cursor: "pointer" as const },
    opacity: stumm ? 0.45 : 1,
  };

  if (trade.ergebnis === "skip") {
    return (
      <circle {...gemeinsam} cx={x} cy={y} r={3.4} fill="none"
        stroke={farbe} strokeWidth={1.4}>
        <title>{`${datumDE(trade.datum)} · Skip`}</title>
      </circle>
    );
  }

  // Dreieck nach oben = Long, nach unten = Short.
  const d = trade.richtung > 0
    ? `M${x},${y - 5.2} L${x - 4.6},${y + 3.4} L${x + 4.6},${y + 3.4} Z`
    : `M${x},${y + 5.2} L${x - 4.6},${y - 3.4} L${x + 4.6},${y - 3.4} Z`;

  return (
    <path {...gemeinsam} d={d} fill={farbe} stroke="#17130F" strokeWidth={0.9}>
      <title>
        {`${datumDE(trade.datum)} · ${trade.richtung > 0 ? "Long" : "Short"} · `
          + `${RESULT_LABEL[trade.ergebnis]}`}
      </title>
    </path>
  );
}

/* ------------------------------------------------------- Eine Zeichnung */

function SpurFlaeche({
  spur, punkte, vonMs, bisMs, hoehe, achse, id, zonen, gegen,
  onKlick, onHover, onWeg,
}: {
  spur: Spur;
  punkte: ZeitstrahlTrade[];
  vonMs: number; bisMs: number;
  hoehe: number;
  achse: boolean;
  id: string;
  /** Die eingefärbten Extremzonen. Bei aktivem Filter aus — dann liegt die
      Aussage in den Punkten, und die Fläche wäre nur noch Farbe. */
  zonen: boolean;
  /** Die gestrichelte Gegenlinie (Retail). Abschaltbar, weil sie die halbe
      Tinte des Bildes ausmacht und selten die Frage beantwortet. */
  gegen: boolean;
  onKlick: (t: ZeitstrahlTrade) => void;
  onHover: (h: HoverStand) => void;
  onWeg: () => void;
}) {
  const spanne = Math.max(1, bisMs - vonMs);
  const breite = B - PAD_L - PAD_R;
  const x = (t: number) => PAD_L + ((t - vonMs) / spanne) * breite;
  const hoch = spur.max - spur.min || 1;
  const y = (v: number) => PAD_Y + (1 - (v - spur.min) / hoch) * (hoehe - 2 * PAD_Y);

  const pfad = (liste: { datum: string; wert: number }[]) => liste
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(zuMs(p.datum)).toFixed(1)},${y(p.wert).toFixed(1)}`)
    .join(" ");

  const gitter = gitterlinien(vonMs, bisMs);
  const sichtbar = punkte.filter((t) => {
    const ms = zuMs(t.datum);
    return ms >= vonMs && ms <= bisMs;
  });

  return (
    <svg viewBox={`0 0 ${B} ${hoehe}`} className="block w-full touch-none select-none"
      role="img" aria-label={`${spur.titel} von ${zuIso(vonMs)} bis ${zuIso(bisMs)}`}>
      <defs>
        <clipPath id={`clip-${id}`}>
          <rect x={PAD_L} y={0} width={breite} height={hoehe} />
        </clipPath>
      </defs>

      <g style={{ pointerEvents: "none" }}>
        {/* Zonen, in denen die Spur überhaupt etwas sagt. */}
        {zonen && spur.schwelleOben !== null && (
          <rect x={PAD_L} y={y(spur.max)} width={breite}
            height={Math.max(0, y(spur.schwelleOben) - y(spur.max))}
            fill={FARBE_LONG} opacity={0.09} />
        )}
        {zonen && spur.schwelleUnten !== null && (
          <rect x={PAD_L} y={y(spur.schwelleUnten)} width={breite}
            height={Math.max(0, y(spur.min) - y(spur.schwelleUnten))}
            fill={FARBE_SHORT} opacity={0.09} />
        )}

        {/* Die „Mauern": Jahres- und Monatsgrenzen. */}
        {gitter.map((g) => (
          <g key={g.t}>
            <line x1={x(g.t)} y1={PAD_Y - 4} x2={x(g.t)} y2={hoehe - PAD_Y + 4}
              stroke={FARBE_GITTER} strokeWidth={g.jahr ? 1 : 0.5}
              opacity={g.jahr ? 0.55 : 0.22} />
            {achse && g.label && (
              <text x={x(g.t) + 3} y={PAD_Y - 3} fontSize={9}
                fill="#7A6E5C" className="tabular">{g.label}</text>
            )}
          </g>
        ))}

        {/* Mittelachse. */}
        <line x1={PAD_L} y1={y(spur.mitte)} x2={B - PAD_R} y2={y(spur.mitte)}
          stroke="#3E3222" strokeWidth={1} strokeDasharray="3 3" />

        {achse && (
          <>
            <text x={PAD_L - 5} y={y(spur.max) + 3} fontSize={9} textAnchor="end"
              fill="#7A6E5C" className="tabular">{spur.max.toFixed(spur.max >= 10 ? 0 : 1)}</text>
            <text x={PAD_L - 5} y={y(spur.mitte) + 3} fontSize={9} textAnchor="end"
              fill="#7A6E5C" className="tabular">{spur.mitte.toFixed(spur.mitte >= 10 ? 0 : 1)}</text>
            <text x={PAD_L - 5} y={y(spur.min) + 3} fontSize={9} textAnchor="end"
              fill="#7A6E5C" className="tabular">{spur.min.toFixed(spur.min <= -10 || spur.min >= 10 ? 0 : 1)}</text>
          </>
        )}

        <g clipPath={`url(#clip-${id})`}>
          {/* Saison zeichnet Blöcke statt einer Linie: ein Monat ist eine
              Beobachtung, keine stetige Kurve. Eine glatte Linie würde eine
              Tagesauflösung vortäuschen, die die Daten nicht haben. */}
          {spur.bloecke?.map((b) => {
            const x0 = x(zuMs(b.von));
            const x1 = x(zuMs(b.bis) + TAG);
            const oben = Math.min(y(b.wert), y(0));
            return (
              <rect key={b.von} x={x0} y={oben} width={Math.max(0.5, x1 - x0)}
                height={Math.abs(y(b.wert) - y(0))}
                fill={b.wert >= 0 ? FARBE_LONG : FARBE_SHORT}
                opacity={b.belegt ? 0.55 : 0.16} />
            );
          })}

          {gegen && spur.gegenLinie && spur.gegenLinie.length > 1 && (
            <path d={pfad(spur.gegenLinie)} fill="none" stroke={FARBE_GEGEN}
              strokeWidth={1.2} strokeDasharray="4 3" opacity={0.75}
              strokeLinejoin="round" />
          )}
          {!spur.bloecke && spur.linie.length > 1 && (
            <path d={pfad(spur.linie)} fill="none" stroke={FARBE_LINIE}
              strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </g>
      </g>

      <g clipPath={`url(#clip-${id})`}>
        {sichtbar.map((t) => {
          const wert = spur.linie.length === 0 && !spur.bloecke ? null : t.werte[spur.key];
          const py = y(wert ?? spur.mitte);
          const px = x(zuMs(t.datum));
          return (
            <Marke key={t.id} x={px} y={py} trade={t} stumm={wert === null}
              onKlick={() => onKlick(t)}
              onHover={() => onHover({
                trade: t, wert,
                xPct: (px / B) * 100, yPct: (py / hoehe) * 100,
              })}
              onWeg={onWeg} />
          );
        })}
      </g>
    </svg>
  );
}

/* -------------------------------------------------------- Monatsraster */

function monatsMittel(spur: Spur): (number | null)[] {
  const summe = Array<number>(12).fill(0);
  const anzahl = Array<number>(12).fill(0);
  const quelle = spur.bloecke
    ? spur.bloecke.map((b) => ({ datum: b.von, wert: b.wert }))
    : spur.linie;
  for (const p of quelle) {
    const m = Number(p.datum.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    summe[m] += p.wert;
    anzahl[m]++;
  }
  return summe.map((s, i) => (anzahl[i] > 0 ? s / anzahl[i] : null));
}

function MonatsRaster({
  spur, punkte, id, onKlick, onHover, onWeg,
}: {
  spur: Spur;
  punkte: ZeitstrahlTrade[];
  id: string;
  onKlick: (t: ZeitstrahlTrade) => void;
  onHover: (h: HoverStand) => void;
  onWeg: () => void;
}) {
  const hoehe = H_RASTER;
  const breite = B - PAD_L - PAD_R;
  const spalte = breite / 12;
  const hoch = spur.max - spur.min || 1;
  const y = (v: number) => PAD_Y + (1 - (v - spur.min) / hoch) * (hoehe - PAD_Y - PAD_B);
  const mittel = monatsMittel(spur);

  const proMonat: ZeitstrahlTrade[][] = Array.from({ length: 12 }, () => []);
  for (const t of punkte) proMonat[Number(t.datum.slice(5, 7)) - 1].push(t);

  return (
    <svg viewBox={`0 0 ${B} ${hoehe}`} className="block w-full select-none" role="img"
      aria-label={`${spur.titel}, alle Jahre in zwölf Monatsspalten`}>
      <line x1={PAD_L} y1={y(spur.mitte)} x2={B - PAD_R} y2={y(spur.mitte)}
        stroke="#3E3222" strokeWidth={1} strokeDasharray="3 3" />

      {Array.from({ length: 12 }, (_, i) => {
        const x0 = PAD_L + i * spalte;
        const liste = proMonat[i];
        const summeR = liste.reduce((s, t) => s + (t.r ?? 0), 0);
        const m = mittel[i];
        return (
          <g key={i}>
            {i % 2 === 0 && (
              <rect x={x0} y={PAD_Y} width={spalte} height={hoehe - PAD_Y - PAD_B}
                fill="#271F16" opacity={0.45} />
            )}
            <line x1={x0} y1={PAD_Y} x2={x0} y2={hoehe - PAD_B}
              stroke={FARBE_GITTER} strokeWidth={0.6} opacity={0.6} />

            {m !== null && (
              <line x1={x0 + 4} y1={y(m)} x2={x0 + spalte - 4} y2={y(m)}
                stroke={m >= spur.mitte ? FARBE_LONG : FARBE_SHORT}
                strokeWidth={2} opacity={0.8} />
            )}

            {liste.map((t, k) => {
              const px = x0 + (spalte * (k + 1)) / (liste.length + 1);
              const wert = t.werte[spur.key];
              const py = y(wert ?? spur.mitte);
              return (
                <Marke key={t.id} x={px} y={py} trade={t} stumm={wert === null}
                  onKlick={() => onKlick(t)}
                  onHover={() => onHover({
                    trade: t, wert, xPct: (px / B) * 100, yPct: (py / hoehe) * 100,
                  })}
                  onWeg={onWeg} />
              );
            })}

            <text x={x0 + spalte / 2} y={hoehe - 8} fontSize={9} textAnchor="middle"
              fill={liste.length === 0 ? "#7A6E5C" : summeR < 0 ? "#F0A08A" : "#CBC0AC"}>
              {MONAT_KURZ[i]}
            </text>
            {liste.length > 0 && (
              <text x={x0 + spalte / 2} y={hoehe - 0.5} fontSize={8} textAnchor="middle"
                fill="#7A6E5C" className="tabular">
                {liste.length}· {summeR > 0 ? "+" : ""}{summeR.toFixed(1)}R
              </text>
            )}
          </g>
        );
      })}

      <line x1={B - PAD_R} y1={PAD_Y} x2={B - PAD_R} y2={hoehe - PAD_B}
        stroke={FARBE_GITTER} strokeWidth={0.6} opacity={0.6} />
      <text x={PAD_L - 5} y={y(spur.max) + 3} fontSize={9} textAnchor="end"
        fill="#7A6E5C" className="tabular">{spur.max.toFixed(spur.max >= 10 ? 0 : 1)}</text>
      <text x={PAD_L - 5} y={y(spur.mitte) + 3} fontSize={9} textAnchor="end"
        fill="#7A6E5C" className="tabular">{spur.mitte.toFixed(spur.mitte >= 10 ? 0 : 1)}</text>
      <text id={id} x={PAD_L - 5} y={y(spur.min) + 3} fontSize={9} textAnchor="end"
        fill="#7A6E5C" className="tabular">{spur.min.toFixed(Math.abs(spur.min) >= 10 ? 0 : 1)}</text>
    </svg>
  );
}

/* --------------------------------------------------- Zwei Equity-Kurven */

const FARBE_DAFUER = "#7EE0C6";
const FARBE_DAGEGEN = "#F0A08A";

/** Ab so vielen Trades je Seite lohnt der Vergleich überhaupt hinzusehen. */
const MIN_KURVE = 5;

/**
 * Dieselbe Frage wie der Befund darunter, nur in R statt in Prozent.
 *
 * Der Zeitstrahl zeigt, wo die Trades lagen; diese beiden Kurven zeigen, was
 * dabei herauskam. Zwei Dinge sind bewusst so:
 *
 * 1. **Beide Kurven sind auf die volle Breite gestreckt.** Die Lager sind
 *    verschieden gross; nebeneinander gelegt vergleicht man sonst zwanzig
 *    Trades mit acht und liest den Grössenunterschied als Ergebnis. Zu
 *    vergleichen ist die STEIGUNG, nicht der Endpunkt — deshalb steht das Ø R
 *    je Trade gross daneben und die Summe klein.
 * 2. **Der Filter oben gilt hier nicht.** Eine Equity-Kurve aus lauter
 *    Stopouts wäre eine Gerade nach unten und hätte keine Aussage.
 */
function SpurEquity({ spur, trades }: { spur: Spur; trades: ZeitstrahlTrade[] }) {
  const gewertet = trades.filter((t) => t.ergebnis !== "skip" && t.r !== null);
  const dafuer = gewertet.filter((t) => t.stand[spur.key] > 0);
  const dagegen = gewertet.filter((t) => t.stand[spur.key] < 0);

  if (dafuer.length < MIN_KURVE || dagegen.length < MIN_KURVE) {
    return (
      <p className="mt-3 rounded-xl bg-sand/40 px-3 py-2 text-[11px] leading-relaxed text-ink-faint">
        Für die Gegenüberstellung fehlt eine Seite: {dafuer.length} dafür,{" "}
        {dagegen.length} dagegen. Ab {MIN_KURVE} je Seite werden hier zwei
        R-Kurven gezeichnet.
      </p>
    );
  }

  const kum = (liste: ZeitstrahlTrade[]) => {
    let summe = 0;
    // Die Null vorne, damit beide Kurven am selben Punkt starten.
    return [0, ...liste.map((t) => (summe += t.r ?? 0))];
  };
  const a = kum(dafuer);
  const b = kum(dagegen);

  const H = 128;
  const alle = [...a, ...b];
  const min = Math.min(0, ...alle);
  const max = Math.max(0, ...alle);
  const spanne = max - min || 1;
  const breite = B - PAD_L - PAD_R;
  const y = (v: number) => PAD_Y + (1 - (v - min) / spanne) * (H - 2 * PAD_Y);
  const pfad = (werte: number[]) => werte
    .map((v, i) => `${i === 0 ? "M" : "L"}${(PAD_L + (i / (werte.length - 1)) * breite).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  const schnitt = (liste: ZeitstrahlTrade[]) =>
    liste.reduce((s, t) => s + (t.r ?? 0), 0) / liste.length;

  const zeile = (name: string, liste: ZeitstrahlTrade[], farbe: string) => (
    <div className="flex items-baseline gap-2">
      <span className="inline-block h-0.5 w-4 shrink-0 rounded" style={{ backgroundColor: farbe }} />
      <span className="text-[11px] text-ink-muted">{name}</span>
      <span className="num text-sm font-medium" style={{ color: farbe }}>
        {schnitt(liste) > 0 ? "+" : ""}{schnitt(liste).toFixed(2)} R
      </span>
      <span className="text-[10px] text-ink-faint">
        je Trade · {liste.length} Trades ·{" "}
        <span className="num">
          {liste.reduce((s, t) => s + (t.r ?? 0), 0) > 0 ? "+" : ""}
          {liste.reduce((s, t) => s + (t.r ?? 0), 0).toFixed(1)} R gesamt
        </span>
      </span>
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-line bg-sand/30 p-3">
      <p className="mb-2 text-[11px] font-medium text-ink-soft">
        Was dabei herauskam — {spur.titel} dafür gegen dagegen
      </p>
      <svg viewBox={`0 0 ${B} ${H}`} className="block w-full" role="img"
        aria-label={`R-Kurven mit und gegen ${spur.titel}`}>
        <line x1={PAD_L} y1={y(0)} x2={B - PAD_R} y2={y(0)}
          stroke="#3E3222" strokeWidth={1} strokeDasharray="3 3" />
        <path d={pfad(b)} fill="none" stroke={FARBE_DAGEGEN} strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" />
        <path d={pfad(a)} fill="none" stroke={FARBE_DAFUER} strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" />
        <text x={PAD_L - 5} y={y(max) + 3} fontSize={9} textAnchor="end"
          fill="#7A6E5C" className="tabular">{max.toFixed(0)}</text>
        <text x={PAD_L - 5} y={y(min) + 3} fontSize={9} textAnchor="end"
          fill="#7A6E5C" className="tabular">{min.toFixed(0)}</text>
      </svg>
      <div className="mt-2 space-y-1">
        {zeile("dafür", dafuer, FARBE_DAFUER)}
        {zeile("dagegen", dagegen, FARBE_DAGEGEN)}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
        Beide Kurven sind auf dieselbe Breite gestreckt — zu vergleichen ist die
        Steigung, nicht der Endpunkt. Und beide zeigen alle gewerteten Trades,
        unabhängig vom Ergebnisfilter oben.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Eine Spur */

function SpurKarte({
  spur, bild, modus, fenster, setFenster, punkte, oeffne, zonen, gegen, getrennt,
}: {
  spur: Spur;
  bild: ZeitstrahlBild;
  modus: Modus;
  fenster: [number, number];
  setFenster: (f: [number, number]) => void;
  punkte: ZeitstrahlTrade[];
  oeffne: (id: string) => void;
  zonen: boolean;
  gegen: boolean;
  /** Gewinner und Stopouts in zwei Streifen statt übereinander. */
  getrennt: boolean;
}) {
  const [hover, setHover] = useState<HoverStand | null>(null);
  const bewegt = useRef(false);
  const zug = useRef<
    { x: number; von: number; bis: number; breite: number; gefangen: boolean } | null
  >(null);

  const vollVon = zuMs(bild.von);
  const vollBis = zuMs(bild.bis);

  const jahre = useMemo(() => {
    const a = Number(bild.von.slice(0, 4));
    const b = Number(bild.bis.slice(0, 4));
    return Array.from({ length: Math.max(1, b - a + 1) }, (_, i) => a + i);
  }, [bild.von, bild.bis]);

  function beginne(e: PointerEvent<HTMLDivElement>) {
    if (modus !== "kalender") return;
    bewegt.current = false;
    zug.current = {
      x: e.clientX, von: fenster[0], bis: fenster[1],
      breite: e.currentTarget.getBoundingClientRect().width || 1,
      gefangen: false,
    };
    // Bewusst NICHT sofort einfangen: bei aktivem Pointer-Capture landet das
    // anschliessende click-Ereignis am einfangenden Element statt am Dreieck —
    // dann liesse sich kein Trade mehr anklicken.
  }

  function ziehe(e: PointerEvent<HTMLDivElement>) {
    const z = zug.current;
    if (!z) return;
    const dx = e.clientX - z.x;
    if (Math.abs(dx) > 3) {
      bewegt.current = true;
      if (!z.gefangen) {
        e.currentTarget.setPointerCapture(e.pointerId);
        z.gefangen = true;
      }
    }
    if (!z.gefangen) return;
    const spanne = z.bis - z.von;
    let dt = -(dx / z.breite) * spanne;
    // An den Rändern anschlagen statt ins Leere zu ziehen.
    if (z.von + dt < vollVon) dt = vollVon - z.von;
    if (z.bis + dt > vollBis) dt = vollBis - z.bis;
    setFenster([z.von + dt, z.bis + dt]);
  }

  const ende = () => { zug.current = null; };

  const klick = (t: ZeitstrahlTrade) => {
    if (bewegt.current) return;
    oeffne(t.id);
  };

  const leer = spur.luecke !== null;

  return (
    <Card>
      <CardTitle>
        {spur.titel}
        <span className="ml-2 normal-case tracking-normal text-ink-faint">
          {spur.einheit}
        </span>
      </CardTitle>
      <p className="mb-3 max-w-3xl text-[11px] leading-relaxed text-ink-faint">
        {spur.erklaerung}
      </p>

      {leer ? (
        <Empty>{spur.luecke}</Empty>
      ) : (
        <>
          <div className="relative"
            onPointerDown={beginne} onPointerMove={ziehe}
            onPointerUp={ende} onPointerCancel={ende}
            style={{ cursor: modus === "kalender" ? "grab" : "default" }}>

            {modus === "kalender" && !getrennt && (
              <SpurFlaeche spur={spur} punkte={punkte} vonMs={fenster[0]} bisMs={fenster[1]}
                hoehe={H_GROSS} achse zonen={zonen} gegen={gegen} id={`${spur.key}-kal`}
                onKlick={klick} onHover={setHover} onWeg={() => setHover(null)} />
            )}

            {modus === "kalender" && getrennt && (
              <div className="space-y-1">
                {[
                  { name: "TP", liste: punkte.filter((t) => GEWINN.includes(t.ergebnis)) },
                  { name: "SL", liste: punkte.filter((t) => t.ergebnis === "sl") },
                ].map((streifen, i) => (
                  <div key={streifen.name} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-right text-[11px] text-ink-muted">
                      {streifen.name}
                    </span>
                    <div className="min-w-0 flex-1">
                      <SpurFlaeche spur={spur} punkte={streifen.liste}
                        vonMs={fenster[0]} bisMs={fenster[1]}
                        hoehe={H_FACETTE + 14} achse={i === 0}
                        zonen={zonen} gegen={gegen}
                        id={`${spur.key}-${streifen.name}`}
                        onKlick={klick} onHover={setHover} onWeg={() => setHover(null)} />
                    </div>
                    <span className="w-10 shrink-0 text-[10px] tabular text-ink-faint">
                      {streifen.liste.length}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {modus === "jahre" && (
              <div className="space-y-1">
                {jahre.map((j) => {
                  const von = Date.UTC(j, 0, 1);
                  const bis = Date.UTC(j, 11, 31);
                  const drin = punkte.filter((t) => t.datum.startsWith(String(j)));
                  return (
                    <div key={j} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-right text-[11px] tabular text-ink-muted">
                        {j}
                      </span>
                      <div className="min-w-0 flex-1">
                        <SpurFlaeche spur={spur} punkte={drin} vonMs={von} bisMs={bis}
                          hoehe={H_FACETTE} achse={j === jahre[0]} zonen={zonen} gegen={gegen}
                          id={`${spur.key}-j${j}`}
                          onKlick={klick} onHover={setHover} onWeg={() => setHover(null)} />
                      </div>
                      <span className="w-14 shrink-0 text-[10px] tabular text-ink-faint">
                        {drin.length > 0 && (
                          <>
                            {drin.length}·{" "}
                            {(() => {
                              const r = drin.reduce((s, t) => s + (t.r ?? 0), 0);
                              return `${r > 0 ? "+" : ""}${r.toFixed(1)}R`;
                            })()}
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {modus === "monate" && (
              <MonatsRaster spur={spur} punkte={punkte} id={`${spur.key}-raster`}
                onKlick={klick} onHover={setHover} onWeg={() => setHover(null)} />
            )}

            {hover && (
              <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[135%]
                              whitespace-nowrap rounded-lg border border-line bg-paper/95 px-2 py-1
                              text-[10px] leading-tight text-ink-soft shadow-card backdrop-blur-sm"
                style={{ left: `${hover.xPct}%`, top: `${hover.yPct}%` }}>
                <span className="tabular">{datumDE(hover.trade.datum)}</span>
                {" · "}{hover.trade.richtung > 0 ? "Long" : "Short"}
                {" · "}
                <span style={{ color: ERGEBNIS_FARBE[hover.trade.ergebnis] }}>
                  {RESULT_LABEL[hover.trade.ergebnis]}
                </span>
                {hover.trade.r !== null && (
                  <span className="tabular">
                    {" · "}{hover.trade.r > 0 ? "+" : ""}{hover.trade.r.toFixed(2)} R
                  </span>
                )}
                <br />
                {hover.wert === null
                  ? "Spur ohne Aussage an diesem Tag"
                  : <>{spur.linieTitel}: <span className="tabular">{hover.wert.toFixed(
                    Math.abs(hover.wert) >= 10 ? 0 : 2)}</span> {spur.einheit}</>}
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-faint">
            {!spur.bloecke && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 rounded"
                  style={{ backgroundColor: FARBE_LINIE }} />
                {spur.linieTitel}
              </span>
            )}
            {gegen && spur.gegenTitel && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-5 border-t border-dashed"
                  style={{ borderColor: FARBE_GEGEN }} />
                {spur.gegenTitel}
              </span>
            )}
            {spur.bloecke && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-3 rounded-sm"
                    style={{ backgroundColor: FARBE_LONG, opacity: 0.55 }} />
                  belegt
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-3 rounded-sm"
                    style={{ backgroundColor: FARBE_LONG, opacity: 0.16 }} />
                  nur ein Eindruck
                </span>
              </>
            )}
            {zonen && spur.schwelleOben !== null && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-3 rounded-sm"
                  style={{ backgroundColor: FARBE_LONG, opacity: 0.25 }} />
                spricht für Long
              </span>
            )}
            {zonen && spur.schwelleUnten !== null && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-3 rounded-sm"
                  style={{ backgroundColor: FARBE_SHORT, opacity: 0.25 }} />
                spricht für Short
              </span>
            )}
          </div>

          <SpurEquity spur={spur} trades={bild.trades} />

          <div className={cx("mt-3 rounded-xl px-3 py-2 text-xs leading-relaxed",
            spur.getrennt ? "bg-good-tint text-ink-soft" : "bg-sand/60 text-ink-muted")}>
            <strong className="text-ink">Befund:</strong> {spur.befund}
            <span className="ml-1 text-ink-faint">
              ({spur.dafuer.n} dafür · {spur.dagegen.n} dagegen · {spur.stumm} ohne Aussage)
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ Die Seite */

export function BacktestZeitstrahl({
  bild, trades, fokusJahr,
}: {
  bild: ZeitstrahlBild;
  /** Für das Overlay — dieselben Trades, in voller Länge. */
  trades: NativeBacktestTrade[];
  /** Vorgewähltes Jahr aus der Adresszeile. Null = ganze Spanne. */
  fokusJahr: string | null;
}) {
  const vollVon = bild.fehler ? 0 : zuMs(bild.von);
  const vollBis = bild.fehler ? 1 : zuMs(bild.bis);

  const [modus, setModus] = useState<Modus>("kalender");
  const [filter, setFilter] = useState<ErgebnisFilter>("alle");
  // Getrennte Streifen statt Übereinander — der eigentliche Kontrast.
  const [getrennt, setGetrennt] = useState(false);
  // Die Retail-Linie ist standardmässig aus: sie verdoppelt die Tinte und
  // beantwortet die Frage „wo lagen meine Trades" nicht mit.
  const [gegen, setGegen] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [fenster, setFenster] = useState<[number, number]>(() => {
    if (fokusJahr) {
      const von = Math.max(vollVon, Date.UTC(Number(fokusJahr), 0, 1));
      const bis = Math.min(vollBis, Date.UTC(Number(fokusJahr), 11, 31));
      if (bis > von) return [von, bis];
    }
    return [vollVon, vollBis];
  });

  const punkte = useMemo(() => {
    const f = FILTER.find((x) => x.key === filter)!;
    return f.ergebnisse.length === 0
      ? bild.trades
      : bild.trades.filter((t) => f.ergebnisse.includes(t.ergebnis));
  }, [bild.trades, filter]);

  const anzahl = useMemo(() => Object.fromEntries(FILTER.map((f) => [
    f.key,
    f.ergebnisse.length === 0
      ? bild.trades.length
      : bild.trades.filter((t) => f.ergebnisse.includes(t.ergebnis)).length,
  ])) as Record<ErgebnisFilter, number>, [bild.trades]);

  const nachId = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);
  const lagen = useMemo(
    () => new Map(bild.trades.map((t) => [t.id, t.stand as TradeLage])),
    [bild.trades],
  );

  if (bild.fehler) return <Empty>{bild.fehler}</Empty>;

  const zoom = (faktor: number) => {
    const mitte = (fenster[0] + fenster[1]) / 2;
    const halb = ((fenster[1] - fenster[0]) * faktor) / 2;
    const min = 30 * TAG;
    const breite = Math.min(vollBis - vollVon, Math.max(min, halb * 2));
    let von = mitte - breite / 2;
    let bis = mitte + breite / 2;
    if (von < vollVon) { bis += vollVon - von; von = vollVon; }
    if (bis > vollBis) { von -= bis - vollBis; bis = vollBis; }
    setFenster([Math.max(vollVon, von), Math.min(vollBis, bis)]);
  };

  const gesamt = fenster[0] <= vollVon && fenster[1] >= vollBis;
  const aktiv = offen ? nachId.get(offen) ?? null : null;
  const reihe = punkte.map((t) => t.id);
  const index = offen ? reihe.indexOf(offen) : -1;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-1.5">
          {MODI.map((m) => (
            <button key={m.key} type="button" onClick={() => setModus(m.key)}
              className={cx(
                "rounded-xl px-3 py-1.5 text-xs transition duration-150 ease-tactile active:scale-95",
                modus === m.key
                  ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                  : "border border-line bg-sand text-ink-muted hover:text-ink")}>
              {m.label}
            </button>
          ))}

          {modus === "kalender" && (
            <span className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => zoom(0.6)} aria-label="Näher heran"
                className="rounded-lg border border-line bg-sand px-2.5 py-1 text-xs text-ink-muted
                           transition hover:text-ink">＋</button>
              <button type="button" onClick={() => zoom(1.7)} aria-label="Weiter weg"
                className="rounded-lg border border-line bg-sand px-2.5 py-1 text-xs text-ink-muted
                           transition hover:text-ink">−</button>
              <button type="button" onClick={() => setFenster([vollVon, vollBis])}
                disabled={gesamt}
                className="rounded-lg px-2.5 py-1 text-xs text-ink-muted transition
                           hover:text-ink disabled:opacity-35">alles</button>
            </span>
          )}
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          {MODI.find((m) => m.key === modus)!.hinweis}
          {modus === "kalender" && (
            <>
              {" "}Gezeigt: <span className="tabular">{datumDE(zuIso(fenster[0]))}</span> bis{" "}
              <span className="tabular">{datumDE(zuIso(fenster[1]))}</span>.
            </>
          )}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className="mr-1 text-[11px] text-ink-faint">Zeigen</span>
          {FILTER.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              disabled={anzahl[f.key] === 0}
              className={cx(
                "rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile active:scale-95",
                "disabled:cursor-not-allowed disabled:opacity-35",
                filter === f.key
                  ? "bg-sand font-medium text-ink"
                  : "text-ink-muted hover:text-ink")}>
              {f.label}
              <span className="ml-1.5 tabular opacity-60">{anzahl[f.key]}</span>
            </button>
          ))}

          <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
            {modus === "kalender" && (
              <label className={cx("flex items-center gap-1.5 text-[11px]",
                filter === "alle"
                  ? "cursor-pointer text-ink-muted"
                  : "cursor-not-allowed text-ink-faint/60")}>
                <input type="checkbox" checked={getrennt} disabled={filter !== "alle"}
                  onChange={(e) => setGetrennt(e.target.checked)}
                  className="h-3 w-3 accent-[#E7A96B]" />
                TP und SL getrennt
              </label>
            )}
            {bild.spuren.some((sp) => sp.gegenTitel) && (
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-muted">
                <input type="checkbox" checked={gegen}
                  onChange={(e) => setGegen(e.target.checked)}
                  className="h-3 w-3 accent-[#E7A96B]" />
                Retail-Linie
              </label>
            )}
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M6,1.5 L10.5,9.5 L1.5,9.5 Z" fill="#CBC0AC" />
            </svg>
            Long
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M6,10.5 L1.5,2.5 L10.5,2.5 Z" fill="#CBC0AC" />
            </svg>
            Short
          </span>
          {(["full_tp", "teil_tp_be", "breakeven", "sl", "skip"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: ERGEBNIS_FARBE[k] }} />
              {RESULT_LABEL[k]}
            </span>
          ))}
          {filter !== "alle" && (
            <span className="ml-auto text-accent-soft">
              Gefiltert — die Extremzonen sind ausgeblendet, damit die Punkte allein stehen.
            </span>
          )}
        </div>
      </Card>

      {bild.spuren.map((spur) => (
        <SpurKarte key={spur.key} spur={spur} bild={bild} modus={modus}
          fenster={fenster} setFenster={setFenster} punkte={punkte} oeffne={setOffen}
          zonen={filter === "alle"} gegen={gegen}
          getrennt={getrennt && filter === "alle"} />
      ))}

      {aktiv && (
        <TradeOverlay trade={aktiv} lage={lagen.get(aktiv.id) ?? null}
          position={index >= 0 ? `${index + 1} von ${reihe.length}` : undefined}
          onSchliessen={() => setOffen(null)}
          onZurueck={index > 0 ? () => setOffen(reihe[index - 1]) : undefined}
          onVor={index >= 0 && index < reihe.length - 1
            ? () => setOffen(reihe[index + 1]) : undefined} />
      )}
    </div>
  );
}
