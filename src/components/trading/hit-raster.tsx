"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { signalUebernehmen, signalVerwerfen } from "@/lib/journal-actions";
import type { HitChart, HitLage } from "@/lib/trading/hit-detail";
import { GvaChart } from "@/components/trading/gva-chart";
import { Modal, ModalKopf } from "@/components/trading/modal";
import { cx } from "@/components/ui";

/**
 * Das Cockpit — eine Watchlist, wie Kerim sie aus TradingView kennt.
 *
 * Vorher war das ein Kachel-Raster. Die Idee war, dass man am Muster erkennt,
 * was los ist; in der Praxis zählt man Spalten, um ein Paar zu finden. Eine
 * Liste mit aufklappbaren Gruppen ist hier besser, weil sie genau die Form
 * hat, in der Kerim seine Paare ohnehin jeden Tag ansieht — dieselbe
 * Reihenfolge, dieselbe Gruppierung, dieselbe Lesart von links nach rechts.
 *
 * Die Spalten beantworten der Reihe nach: Welches Paar? In welche Richtung
 * liegt die Linie? Auf welchem Zeitrahmen? Auf welchem Kurs? Wie weit ist der
 * Preis noch weg? Mehr steht nicht drin — der Rest ist im Popup.
 *
 * Der farbige Balken ganz links ist die einzige Auszeichnung, die auffallen
 * soll: gelb heisst getroffen und wartet auf eine Entscheidung, bernstein
 * heisst schon in den aktiven Trades. Wer nichts Farbiges sieht, muss nichts
 * tun — und genau das ist die häufigste Antwort.
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
  /** Kurs der Linie, auf die es ankommt. */
  linie: number | null;
  /** Pips bis dorthin. Null, wenn der Screener keinen Preis hat. */
  distanz: number | null;
  hit: KachelHit | null;
}

export interface Gruppe {
  titel: string;
  kacheln: Kachel[];
}

/** Spaltenraster — einmal definiert, damit Kopf und Zeilen nicht auseinanderlaufen. */
const RASTER = "grid grid-cols-[3px_1fr_58px_28px] sm:grid-cols-[3px_1fr_72px_34px_92px_84px]";

export function HitRaster({ gruppen }: { gruppen: Gruppe[] }) {
  const [offen, setOffen] = useState<Kachel | null>(null);
  const [zu, setZu] = useState<Set<string>>(new Set());

  const umschalten = (titel: string) =>
    setZu((v) => {
      const n = new Set(v);
      if (n.has(titel)) n.delete(titel); else n.add(titel);
      return n;
    });

  return (
    <>
      <div className="overflow-x-auto">
        <div className="min-w-[300px]">
          <div className={cx(RASTER,
            "border-b border-line/70 pb-2 text-[11px] uppercase tracking-wide text-ink-faint")}>
            <span />
            <span className="pl-2">Symbol</span>
            <span className="text-right">Richtung</span>
            <span className="text-right">TF</span>
            <span className="hidden text-right sm:block">Linie</span>
            <span className="hidden text-right sm:block">Abstand</span>
          </div>

          {gruppen.map((g) => {
            const treffer = g.kacheln.filter((k) => k.hit).length;
            const eingeklappt = zu.has(g.titel);
            return (
              <div key={g.titel}>
                <button type="button" onClick={() => umschalten(g.titel)}
                  className="flex w-full items-center gap-1.5 py-1.5 pl-1 text-left
                             text-[11px] font-medium uppercase tracking-wide text-ink-muted
                             transition hover:text-ink">
                  <span className={cx("inline-block transition-transform duration-150",
                    eingeklappt ? "-rotate-90" : "rotate-0")}>⌄</span>
                  {g.titel}
                  {treffer > 0 && (
                    <span className="rounded bg-warn-tint px-1.5 py-0.5 text-[10px] text-warn">
                      {treffer}
                    </span>
                  )}
                </button>

                {!eingeklappt && g.kacheln.map((k) => (
                  <ZeileFeld key={k.paar} k={k} onOeffnen={() => setOffen(k)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {offen?.hit && (
        <HitDialog kachel={offen} hit={offen.hit} schliessen={() => setOffen(null)} />
      )}
    </>
  );
}

function ZeileFeld({ k, onOeffnen }: { k: Kachel; onOeffnen: () => void }) {
  const wartet = !!k.hit && !k.hit.inListe;
  const aktiv = !!k.hit?.inListe;
  const seite = k.hit?.seite ?? k.seite;
  const linie = k.hit?.level ?? k.linie;
  const nachkomma = k.paar.includes("JPY") ? 3 : 5;

  const inhalt = (
    <>
      {/* Der Marker links — dieselbe Rolle wie die Fahne in TradingView. */}
      <span className={cx("h-full w-[3px] rounded-full",
        wartet ? "bg-warn" : aktiv ? "bg-accent-deep" : "bg-transparent")} />

      <span className={cx("truncate pl-2 font-medium",
        k.hit ? "text-ink" : seite ? "text-ink-soft" : "text-ink-faint")}>
        {k.paar}
      </span>

      <span className={cx("text-right text-[12px]",
        seite === "long" ? "text-good-bright"
          : seite === "short" ? "text-bad-bright" : "text-ink-faint")}>
        {seite === "long" ? "Long" : seite === "short" ? "Short" : "—"}
      </span>

      <span className="text-right text-[11px] text-ink-muted">{k.zeitrahmen ?? ""}</span>

      <span className="tabular hidden text-right text-[12px] text-ink-soft sm:block">
        {linie !== null ? linie.toFixed(nachkomma) : ""}
      </span>

      <span className={cx("tabular hidden text-right text-[12px] sm:block",
        wartet ? "text-warn" : "text-ink-muted")}>
        {k.hit ? "getroffen" : k.distanz !== null ? `${Math.round(k.distanz)} P` : ""}
      </span>
    </>
  );

  const klassen = cx(RASTER,
    "items-center border-t border-line/40 py-1.5 text-sm first:border-t-0");

  if (!k.hit) return <div className={klassen}>{inhalt}</div>;

  return (
    <button type="button" onClick={onOeffnen} title={`${k.paar} — Treffer ansehen`}
      className={cx(klassen, "w-full text-left transition hover:bg-sand/50 active:scale-[0.997]",
        wartet && "bg-warn-tint/30")}>
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
