"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { signalStatusSetzen, signalUebernehmen } from "@/lib/journal-actions";
import type { HitDetail } from "@/lib/trading/hit-detail";
import { GvaChart } from "@/components/trading/gva-chart";
import { cx } from "@/components/ui";

/**
 * Das Cockpit — 28 Kacheln, und sonst nichts.
 *
 * Der Aufbau folgt bewusst der Heatmap und nicht einer Liste: die Kacheln
 * stehen immer an derselben Stelle, egal was gerade los ist. Eine Liste, die
 * nach Dringlichkeit sortiert, ist beim ersten Blick schneller und beim
 * hundertsten langsamer — man muss jedes Mal neu lesen, wo etwas steht. Hier
 * lernt man die Position einmal und sieht danach am Muster, was Sache ist.
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
  /** "new" = wartet auf Entscheidung, "watchlist" = schon in Beobachtung. */
  status: string;
  seite: "long" | "short";
}

export interface Kachel {
  paar: string;
  /** Richtung der Linie, die für dieses Paar gerade zählt. */
  seite: "long" | "short" | null;
  zeitrahmen: "3D" | "W" | null;
  hit: KachelHit | null;
}

const TF_TEXT: Record<string, string> = { "3D": "3D", W: "W" };

export function HitRaster({ kacheln }: { kacheln: Kachel[] }) {
  const [offen, setOffen] = useState<Kachel | null>(null);

  return (
    <>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {kacheln.map((k) => (
          <KachelFeld key={k.paar} k={k} onOeffnen={() => setOffen(k)} />
        ))}
      </div>
      {offen?.hit && (
        <HitDialog kachel={offen} hit={offen.hit} schliessen={() => setOffen(null)} />
      )}
    </>
  );
}

function KachelFeld({ k, onOeffnen }: { k: Kachel; onOeffnen: () => void }) {
  const wartet = k.hit?.status === "new";
  const beobachtet = k.hit?.status === "watchlist";
  const seite = k.hit?.seite ?? k.seite;

  const grund =
    seite === "long" ? "bg-good-tint text-good-bright"
      : seite === "short" ? "bg-bad-tint text-bad-bright"
        : "bg-sand/40 text-ink-faint";

  const ring =
    wartet ? "ring-2 ring-warn ring-offset-2 ring-offset-paper"
      : beobachtet ? "ring-1 ring-accent-deep"
        : "";

  const inhalt = (
    <>
      <span className="font-display text-[11px] font-bold leading-none">
        {k.paar.slice(0, 3)}
      </span>
      <span className="font-display text-[11px] font-bold leading-none opacity-70">
        {k.paar.slice(3, 6)}
      </span>
      <span className="mt-1 text-[10px] leading-none opacity-60">
        {k.zeitrahmen ? TF_TEXT[k.zeitrahmen] : "\u00a0"}
      </span>
    </>
  );

  const klassen = cx(
    "flex aspect-square flex-col items-center justify-center rounded-xl text-center",
    grund, ring,
  );

  if (!k.hit) return <div className={klassen} title={k.paar}>{inhalt}</div>;

  return (
    <button type="button" onClick={onOeffnen}
      title={`${k.paar} — Hit ansehen`}
      className={cx(klassen, "transition duration-150 ease-tactile hover:brightness-125 active:scale-95")}>
      {inhalt}
    </button>
  );
}

/* ------------------------------------------------------------------ Dialog */

function HitDialog({
  kachel, hit, schliessen,
}: { kachel: Kachel; hit: KachelHit; schliessen: () => void }) {
  const [detail, setDetail] = useState<HitDetail | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const q = new URLSearchParams({
      paar: kachel.paar, seite: hit.seite, level: String(hit.level),
    });
    if (hit.formiert) q.set("formiert", hit.formiert);
    try {
      const res = await fetch(`/api/trading/hit-detail?${q}`);
      const json = await res.json();
      if (!res.ok) { setFehler(json?.fehler ?? "Konnte die Lage nicht laden."); return; }
      setDetail(json as HitDetail);
    } catch {
      setFehler("Konnte die Lage nicht laden.");
    }
  }, [kachel.paar, hit.seite, hit.level, hit.formiert]);

  useEffect(() => { void laden(); }, [laden]);

  // Escape schliesst. Ohne das ist ein Vollbild-Overlay auf dem Desktop eine
  // Sackgasse, wenn man den Knopf nicht sieht.
  useEffect(() => {
    const auf = (e: KeyboardEvent) => { if (e.key === "Escape") schliessen(); };
    window.addEventListener("keydown", auf);
    return () => window.removeEventListener("keydown", auf);
  }, [schliessen]);

  const [laeuft, starte] = useTransition();

  /**
   * Beide Entscheidungen laufen über `useTransition` und nicht über
   * `<form action={…}>`: Ein Formular, das in seinem eigenen `onSubmit` den
   * Dialog schliesst, reisst sich mitten in der Übertragung selbst aus dem
   * Baum — die Server-Aktion wird dann je nach Timing gar nicht ausgeführt.
   * So wird erst gespeichert und dann geschlossen.
   */
  const entscheiden = (was: "beobachten" | "verwerfen") => {
    const fd = new FormData();
    fd.set("id", hit.signalId);
    if (was === "beobachten") {
      fd.set("pair", kachel.paar);
      fd.set("lineType", hit.seite);
      fd.set("lineLevel", String(hit.level));
    } else {
      fd.set("status", "dismissed");
    }
    starte(async () => {
      if (was === "beobachten") await signalUebernehmen(fd);
      else await signalStatusSetzen(fd);
      schliessen();
    });
  };

  const lang = hit.seite === "long";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={schliessen}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-line bg-paper p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-lg font-bold text-ink">{kachel.paar}</span>
          <span className={cx("rounded-lg px-2 py-0.5 text-[11px] font-medium",
            lang ? "bg-good-tint text-good-bright" : "bg-bad-tint text-bad-bright")}>
            {lang ? "Long" : "Short"}
          </span>
          {kachel.zeitrahmen && (
            <span className="rounded-lg bg-sand px-2 py-0.5 text-[11px] text-ink-muted">
              {TF_TEXT[kachel.zeitrahmen]}
            </span>
          )}
          <span className="tabular text-sm text-ink-soft">{hit.level}</span>
          <button type="button" onClick={schliessen}
            className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-muted hover:text-ink">
            schliessen
          </button>
        </div>

        {/* -------------------------------------------------------- Chart */}
        <div className="mt-4 rounded-xl border border-line/60 bg-sand/30 p-3">
          {fehler ? (
            <p className="py-8 text-center text-sm text-ink-muted">{fehler}</p>
          ) : !detail ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              Chart und Lage werden geholt …
            </p>
          ) : detail.chart ? (
            <>
              <GvaChart bild={detail.chart} />
              <p className="mt-1 text-[11px] text-ink-faint">
                {detail.chart.zeitrahmen}-Chart um den {fmtDatum(detail.chart.formiertAm)},
                als die Linie entstand. Der Kasten markiert die bildende Kerze;
                bewusst nicht bis heute gezeichnet — sonst stünde die Antwort
                schon im Bild.
              </p>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">
              {hit.formiert
                ? "Für diesen Zeitraum liefert das Kursarchiv keine Kerzen."
                : "Zu diesem Signal ist kein Bildungsdatum gespeichert — "
                  + "Altbestand aus der Zeit vor der Spalte."}
            </p>
          )}
        </div>

        {/* -------------------------------------------------- Confluences */}
        {detail && (
          <div className="mt-4 space-y-2">
            <Zeile titel="Ranking" ton={tonVon(detail.ranking.urteil)}
              wert={detail.ranking.urteil === "unbekannt" ? "—"
                : detail.ranking.urteil === "bestaetigt" ? "dafür"
                  : detail.ranking.urteil === "dagegen" ? "dagegen" : "neutral"}
              satz={detail.rankingSatz} />
            <Zeile titel="Commercials / Retail"
              ton={tonAusSatz(detail.cotSatz)}
              wert={detail.cotBasis && detail.cotKurs
                ? `${detail.cotBasis.ccy} ${pfeil(detail.cotBasis.divergenz)} · `
                  + `${detail.cotKurs.ccy} ${pfeil(detail.cotKurs.divergenz)}`
                : "—"}
              satz={detail.cotSatz} />
            <Zeile titel="Saisonalität"
              ton={!detail.saison?.belegt ? "neutral"
                : (detail.saison.richtung > 0) === lang ? "good" : "bad"}
              wert={detail.saison
                ? `${prozent(detail.saison.quote.quote)} · ${detail.saison.jahre} J.`
                : "—"}
              satz={detail.saisonSatz} />
          </div>
        )}

        {/* ---------------------------------------------------- Entscheidung */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {hit.status === "new" ? (
            <>
              <button type="button" disabled={laeuft}
                onClick={() => entscheiden("beobachten")}
                className="rounded-xl bg-accent px-3.5 py-1.5 text-sm font-medium text-ink-on
                           shadow-glow-accent transition active:scale-95 disabled:opacity-50">
                In Beobachtung
              </button>
              <button type="button" disabled={laeuft}
                onClick={() => entscheiden("verwerfen")}
                className="rounded-xl border border-line bg-sand px-3.5 py-1.5 text-sm
                           text-ink-muted transition hover:text-ink active:scale-95 disabled:opacity-50">
                Verwerfen
              </button>
              <span className="text-xs text-ink-faint">
                {laeuft ? "wird gespeichert …" : "Verworfen ist endgültig."}
              </span>
            </>
          ) : (
            <span className="text-sm text-ink-muted">
              Steht schon in der Beobachtung — hier gibt es nichts mehr zu entscheiden.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Teile */

function Zeile({
  titel, wert, satz, ton,
}: {
  titel: string; wert: string; satz: string;
  ton: "good" | "bad" | "neutral";
}) {
  const farbe = ton === "good" ? "text-good-bright"
    : ton === "bad" ? "text-bad-bright" : "text-ink-soft";
  return (
    <div className="rounded-xl border border-line/60 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{titel}</span>
        <span className={cx("tabular text-sm font-medium", farbe)}>{wert}</span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{satz}</p>
    </div>
  );
}

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
