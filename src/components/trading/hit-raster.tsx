"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { signalUebernehmen, signalVerwerfen } from "@/lib/journal-actions";
import type { HitChart, HitLage } from "@/lib/trading/hit-detail";
import { GvaChart } from "@/components/trading/gva-chart";
import { Modal, ModalKopf } from "@/components/trading/modal";
import { cx } from "@/components/ui";

/**
 * Das Cockpit — Kacheln, und sonst nichts.
 *
 * Der Aufbau folgt bewusst der Heatmap und nicht einer Liste: die Kacheln
 * stehen immer an derselben Stelle, egal was gerade los ist. Eine Liste, die
 * nach Dringlichkeit sortiert, ist beim ersten Blick schneller und beim
 * hundertsten langsamer — man muss jedes Mal neu lesen, wo etwas steht.
 *
 * Gruppiert wird nach der Basiswährung, weil die 28 Majors genau so zerfallen:
 * sieben USD-Paare, sechs EUR-Crosses, fünf GBP, vier AUD, drei NZD, zwei CAD,
 * eines mit CHF. Diese Treppe ist keine Design-Idee, sondern die Struktur der
 * Sache — und sie gibt jeder Kachel einen Platz, den man wiederfindet.
 *
 * Drei Zustände, mehr gibt es nicht:
 *   grau   — der Screener sieht für dieses Paar keine Linie in Reichweite
 *   farbig — es gibt eine Linie, rot für Short, grün für Long, mit Zeitrahmen
 *   Ring   — die Linie wurde getroffen und wartet auf eine Entscheidung
 *
 * Nur der Ring ist anklickbar. Alles andere ist Information, keine Aufgabe.
 */

export interface KachelHit {
  signalId: string;
  level: number;
  formiert: string | null;
  /**
   * Steht dieser Treffer schon in den aktiven Trades?
   *
   * Bewusst NICHT aus `signals.status` abgelesen, sondern daraus, ob es die
   * Zeile in `trading_watchlist` wirklich gibt. Der Status sagte früher
   * „watchlist", während die Zeile nirgends existierte — und das Cockpit
   * antwortete „hier gibt es nichts mehr zu entscheiden" auf einen Treffer,
   * den man weder sehen noch löschen konnte. Was zählt, ist die Liste.
   */
  inListe: boolean;
  seite: "long" | "short";
}

export interface Kachel {
  paar: string;
  /** Richtung der Linie, die für dieses Paar gerade zählt. */
  seite: "long" | "short" | null;
  zeitrahmen: "3D" | "W" | null;
  hit: KachelHit | null;
}

export interface Gruppe {
  titel: string;
  kacheln: Kachel[];
}

export function HitRaster({ gruppen }: { gruppen: Gruppe[] }) {
  const [offen, setOffen] = useState<Kachel | null>(null);

  return (
    <>
      <div className="space-y-6">
        {gruppen.map((g) => (
          <div key={g.titel}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
                {g.titel}
              </span>
              <span className="h-px flex-1 bg-line/50" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
              {g.kacheln.map((k) => (
                <KachelFeld key={k.paar} k={k} onOeffnen={() => setOffen(k)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {offen?.hit && (
        <HitDialog kachel={offen} hit={offen.hit} schliessen={() => setOffen(null)} />
      )}
    </>
  );
}

function KachelFeld({ k, onOeffnen }: { k: Kachel; onOeffnen: () => void }) {
  const wartet = !!k.hit && !k.hit.inListe;
  const beobachtet = !!k.hit?.inListe;
  const seite = k.hit?.seite ?? k.seite;

  const grund =
    seite === "long" ? "bg-good-tint text-good-bright"
      : seite === "short" ? "bg-bad-tint text-bad-bright"
        : "bg-sand/40 text-ink-faint";

  const ring =
    wartet ? "ring-2 ring-warn ring-offset-2 ring-offset-card"
      : beobachtet ? "ring-1 ring-accent-deep"
        : "";

  const klassen = cx(
    "flex h-[74px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-center",
    grund, ring,
  );

  const inhalt = (
    <>
      <span className="font-display text-[13px] font-bold leading-none tracking-tight">
        {k.paar.slice(0, 3)}<span className="opacity-45">/</span>{k.paar.slice(3, 6)}
      </span>
      <span className="flex h-4 items-center gap-1">
        {k.zeitrahmen && (
          <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-medium leading-none">
            {k.zeitrahmen}
          </span>
        )}
        {wartet && (
          <span className="text-[10px] font-medium leading-none text-warn">Hit</span>
        )}
        {beobachtet && (
          <span className="text-[10px] leading-none text-accent-soft">aktiv</span>
        )}
      </span>
    </>
  );

  if (!k.hit) return <div className={klassen} title={k.paar}>{inhalt}</div>;

  return (
    <button type="button" onClick={onOeffnen} title={`${k.paar} — Hit ansehen`}
      className={cx(klassen,
        "transition duration-150 ease-tactile hover:brightness-125 active:scale-95")}>
      {inhalt}
    </button>
  );
}

/* ------------------------------------------------------------------ Dialog */

function HitDialog({
  kachel, hit, schliessen,
}: { kachel: Kachel; hit: KachelHit; schliessen: () => void }) {
  const [chart, setChart] = useState<HitChart | null>(null);
  const [lage, setLage] = useState<HitLage | null>(null);
  const [chartFehler, setChartFehler] = useState<string | null>(null);
  const [lageFehler, setLageFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  /**
   * Chart und Lage werden getrennt geholt: sie kommen aus verschiedenen
   * Systemen (Render bzw. Supabase) und brauchen verschieden lange. In einem
   * Aufruf wartete das ganze Popup auf das Langsamste, und wenn eine Quelle
   * zickte, blieb auch die andere leer.
   */
  const hole = useCallback(async <T,>(
    teil: "chart" | "lage",
    setzen: (v: T) => void,
    fehler: (s: string) => void,
  ) => {
    const q = new URLSearchParams({
      teil, paar: kachel.paar, seite: hit.seite, level: String(hit.level),
    });
    if (hit.formiert) q.set("formiert", hit.formiert);
    try {
      const res = await fetch(`/api/trading/hit-detail?${q}`);
      const json = await res.json();
      if (!res.ok) { fehler(json?.fehler ?? "Konnte nicht geladen werden."); return; }
      setzen(json as T);
    } catch {
      fehler("Keine Verbindung zum Server.");
    }
  }, [kachel.paar, hit.seite, hit.level, hit.formiert]);

  useEffect(() => {
    void hole<HitChart>("chart", setChart, setChartFehler);
    void hole<HitLage>("lage", setLage, setLageFehler);
  }, [hole]);

  /**
   * Beide Entscheidungen laufen über `useTransition` und nicht über
   * `<form action={…}>`: Ein Formular, das in seinem eigenen `onSubmit` den
   * Dialog schliesst, reisst sich mitten in der Übertragung selbst aus dem
   * Baum — die Server-Aktion wird dann je nach Timing gar nicht ausgeführt.
   * So wird erst gespeichert und dann geschlossen.
   */
  const entscheiden = (was: "uebernehmen" | "verwerfen") => {
    const fd = new FormData();
    fd.set("id", hit.signalId);
    fd.set("pair", kachel.paar);
    fd.set("lineType", hit.seite);
    fd.set("lineLevel", String(hit.level));
    if (hit.formiert) fd.set("formiert", hit.formiert);
    starte(async () => {
      if (was === "uebernehmen") await signalUebernehmen(fd);
      else await signalVerwerfen(fd);
      schliessen();
    });
  };

  const uebernommen = hit.inListe;
  const lang = hit.seite === "long";
  const nachkomma = kachel.paar.includes("JPY") ? 3 : 5;

  return (
    <Modal offen schliessen={schliessen} breite="max-w-2xl">
      <ModalKopf schliessen={schliessen}>
        <span className="font-display text-lg font-bold text-ink">
          {kachel.paar.slice(0, 3)}<span className="text-ink-faint">/</span>{kachel.paar.slice(3)}
        </span>
        <span className={cx("rounded-lg px-2 py-0.5 text-[11px] font-medium",
          lang ? "bg-good-tint text-good-bright" : "bg-bad-tint text-bad-bright")}>
          {lang ? "Long" : "Short"}
        </span>
        {chart?.chart && (
          <span className="rounded-lg bg-sand px-2 py-0.5 text-[11px] text-ink-muted">
            {chart.chart.zeitrahmen}
          </span>
        )}
        <span className="tabular text-sm text-ink-soft">{hit.level.toFixed(nachkomma)}</span>
        {hit.formiert && (
          <span className="text-xs text-ink-faint">Linie vom {fmtDatum(hit.formiert)}</span>
        )}
      </ModalKopf>

      <div className="space-y-5 px-5 py-5">
        {/* ------------------------------------------------------------ Chart */}
        <section>
          <Ueberschrift>Der Chart, als die Linie entstand</Ueberschrift>
          <div className="rounded-2xl border border-line/60 bg-sand/25 p-3">
            {chartFehler ? (
              <Hinweis>{chartFehler}</Hinweis>
            ) : !chart ? (
              <Hinweis>Kerzen werden geholt …</Hinweis>
            ) : chart.chart ? (
              <>
                <GvaChart bild={chart.chart} />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  Der Kasten markiert die bildende Kerze. Der Chart endet bewusst
                  wenige Kerzen danach und nicht heute — sonst stünde die Antwort
                  schon im Bild und die Entscheidung wäre keine mehr.
                </p>
              </>
            ) : (
              <Hinweis>{chart.fehler}</Hinweis>
            )}
          </div>
        </section>

        {/* -------------------------------------------------------- Confluences */}
        <section>
          <Ueberschrift>Spricht die Lage dafür?</Ueberschrift>
          {lageFehler ? (
            <div className="rounded-2xl border border-line/60 p-3"><Hinweis>{lageFehler}</Hinweis></div>
          ) : !lage ? (
            <div className="rounded-2xl border border-line/60 p-3">
              <Hinweis>Ranking, COT und Saisonalität werden geholt …</Hinweis>
            </div>
          ) : (
            <div className="space-y-2">
              <Zeile titel="Ranking" ton={tonVon(lage.ranking.urteil)}
                wert={lage.ranking.baseQ === null ? "—"
                  : `${lage.ranking.baseCode} Q${lage.ranking.baseQ} · `
                    + `${lage.ranking.quoteCode} Q${lage.ranking.quoteQ}`}
                satz={lage.rankingSatz} />

              <Zeile titel="Commercials / Retail"
                ton={lage.cotFehler ? "neutral" : tonAusSatz(lage.cotSatz)}
                wert={lage.cotBasis && lage.cotKurs && !lage.cotFehler
                  ? `${cotKurz(lage.cotBasis)} · ${cotKurz(lage.cotKurs)}`
                  : "—"}
                satz={lage.cotFehler ?? lage.cotSatz}
                warnung={!!lage.cotFehler}
                fuss={lage.cotBasis?.datum ? `COT-Bericht vom ${fmtDatum(lage.cotBasis.datum)} · Zahlen sind Perzentilränge Commercials/Retail` : undefined} />

              <Zeile titel="Saisonalität"
                ton={lage.saisonFehler || !lage.saison?.belegt ? "neutral"
                  : (lage.saison.richtung > 0) === lang ? "good" : "bad"}
                wert={lage.saison
                  ? `${prozent(lage.saison.quote.quote)} · ${lage.saison.jahre} J.`
                  : "—"}
                satz={lage.saisonFehler ?? lage.saisonSatz}
                warnung={!!lage.saisonFehler} />
            </div>
          )}
        </section>

        {/* ---------------------------------------------------- Entscheidung */}
        <section className="border-t border-line/60 pt-4">
          {uebernommen ? (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                Steht in deinen <strong className="text-ink">aktiven Trades</strong> —
                dort kannst du Alarm und Notiz ändern.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a href="/trading"
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-ink-on
                             shadow-glow-accent transition active:scale-95">
                  Zur Liste
                </a>
                <button type="button" disabled={laeuft}
                  onClick={() => entscheiden("verwerfen")}
                  className="rounded-xl border border-line bg-sand px-4 py-2 text-sm
                             text-ink-muted transition hover:text-ink active:scale-95 disabled:opacity-50">
                  Doch verwerfen
                </button>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                {laeuft ? "wird gespeichert …"
                  : "„Doch verwerfen“ nimmt die Zeile auch aus den aktiven Trades wieder heraus."}
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={laeuft}
                  onClick={() => entscheiden("uebernehmen")}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-ink-on
                             shadow-glow-accent transition active:scale-95 disabled:opacity-50">
                  In aktive Trades
                </button>
                <button type="button" disabled={laeuft}
                  onClick={() => entscheiden("verwerfen")}
                  className="rounded-xl border border-line bg-sand px-4 py-2 text-sm
                             text-ink-muted transition hover:text-ink active:scale-95 disabled:opacity-50">
                  Verwerfen
                </button>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                {laeuft ? "wird gespeichert …"
                  : "„In aktive Trades“ legt die Linie auf der Übersicht ab, mit Alarm bei Treffer."}
              </p>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Teile */

const Ueberschrift = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
    {children}
  </h3>
);

const Hinweis = ({ children }: { children: React.ReactNode }) => (
  <p className="py-6 text-center text-sm text-ink-muted">{children}</p>
);

function Zeile({
  titel, wert, satz, ton, fuss, warnung,
}: {
  titel: string; wert: string; satz: string;
  ton: "good" | "bad" | "neutral";
  fuss?: string;
  /** Rot umrandet: hier fehlen Daten, das ist kein neutrales Urteil. */
  warnung?: boolean;
}) {
  const farbe = ton === "good" ? "text-good-bright"
    : ton === "bad" ? "text-bad-bright" : "text-ink-soft";
  return (
    <div className={cx("rounded-2xl border px-3.5 py-3",
      warnung ? "border-bad/40 bg-bad-tint/40" : "border-line/60")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{titel}</span>
        <span className={cx("tabular text-sm font-medium", farbe)}>{wert}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{satz}</p>
      {fuss && <p className="mt-1 text-[10px] text-ink-faint">{fuss}</p>}
    </div>
  );
}

/** "EUR 82/14 ▲" — Perzentilrang Commercials/Retail plus Richtung. */
const cotKurz = (s: { ccy: string; kommRang: number | null; retailRang: number | null; divergenz: number }) =>
  `${s.ccy} ${s.kommRang === null ? "?" : Math.round(s.kommRang)}`
  + `/${s.retailRang === null ? "?" : Math.round(s.retailRang)} ${pfeil(s.divergenz)}`;

const pfeil = (d: number) => (d > 0 ? "▲" : d < 0 ? "▼" : "–");

const prozent = (q: number | null) => (q === null ? "—" : `${Math.round(q * 100)} %`);

const fmtDatum = (iso: string) =>
  `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const tonVon = (u: string): "good" | "bad" | "neutral" =>
  u === "bestaetigt" ? "good" : u === "dagegen" ? "bad" : "neutral";

// Der Monty-Satz trägt sein Urteil im ersten Wort; ein zweites Feld nur für
// die Farbe wäre eine Zahl mehr, die auseinanderlaufen kann.
const tonAusSatz = (s: string): "good" | "bad" | "neutral" =>
  s.startsWith("Monty stützt") ? "good"
    : s.startsWith("Monty spricht dagegen") ? "bad" : "neutral";
