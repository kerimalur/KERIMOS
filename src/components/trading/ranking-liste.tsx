"use client";

import { useState } from "react";
import type { RankingCurrency } from "@/lib/supabase/trading";
import { faktorText } from "@/lib/trading/faktor-namen";
import { Modal, ModalKopf } from "@/components/trading/modal";
import { Badge, Empty, cx } from "@/components/ui";

/**
 * Rangliste und Paar-Ideen — anklickbar.
 *
 * Der Q-Score allein beantwortet die Frage nicht, die man sich beim Anschauen
 * sofort stellt: warum steht diese Währung oben? „AUD Q5" ist ein Ergebnis
 * ohne Begründung, und ein Filter, dessen Begründung man nicht sehen kann,
 * wird entweder blind geglaubt oder ignoriert — beides schlecht.
 *
 * Das Modell rechnet die Beiträge ohnehin aus und legt sie in
 * `ml_weekly_rankings.top_features` ab. Hier werden sie nur sichtbar gemacht:
 * ein Klick auf eine Zeile, drei Faktoren, Vorzeichen und Gewicht.
 */

const Q_TON: Record<number, "good" | "warn" | "bad" | "neutral"> = {
  5: "good", 4: "neutral", 3: "neutral", 2: "neutral", 1: "bad",
};

const Q_TEXT: Record<number, string> = {
  5: "stark", 4: "leicht stark", 3: "neutral", 2: "leicht schwach", 1: "schwach",
};

/** Score-Balken: 0 in der Mitte, negativ nach links, positiv nach rechts. */
function ScoreBalken({ score, max }: { score: number; max: number }) {
  const spanne = max > 0 ? max : 1;
  const anteil = Math.min(100, (Math.abs(score) / spanne) * 100);
  const positiv = score >= 0;
  return (
    <div className="flex h-[7px] w-full items-stretch overflow-hidden rounded-full bg-sand">
      <div className="flex w-1/2 justify-end">
        {!positiv && <div className="h-full rounded-l-full bg-bad" style={{ width: `${anteil}%` }} />}
      </div>
      <div className="flex w-1/2 justify-start">
        {positiv && <div className="h-full rounded-r-full bg-good" style={{ width: `${anteil}%` }} />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Rangliste */

export function Rangliste({ waehrungen }: { waehrungen: RankingCurrency[] }) {
  const [offen, setOffen] = useState<RankingCurrency[] | null>(null);
  const max = Math.max(...waehrungen.map((c) => Math.abs(c.score)), 0.01);

  return (
    <>
      <div>
        {waehrungen.map((c, i) => (
          <button key={c.ccy} type="button" onClick={() => setOffen([c])}
            title={`${c.ccy} — woran das liegt`}
            className="flex w-full items-center gap-4 border-t border-line/70 py-3 text-left
                       transition first:border-t-0 hover:bg-sand/40">
            <span className="tabular w-6 shrink-0 text-xs text-ink-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="w-12 shrink-0 font-display text-base font-bold text-ink">{c.ccy}</span>
            <div className="min-w-0 flex-1"><ScoreBalken score={c.score} max={max} /></div>
            <span className="tabular w-16 shrink-0 text-right text-sm text-ink-soft">
              {c.score >= 0 ? "+" : ""}{c.score.toFixed(2)}
            </span>
            <span className="w-28 shrink-0 text-right">
              <Badge tone={Q_TON[c.strength_quintile] ?? "neutral"}
                title={`Stärke-Quintil ${c.strength_quintile} von 5`}>
                Q{c.strength_quintile} · {Q_TEXT[c.strength_quintile] ?? "—"}
              </Badge>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">
        Klick auf eine Zeile zeigt, welche Faktoren den Score getragen haben.
      </p>

      <FaktorDialog waehrungen={offen} schliessen={() => setOffen(null)} />
    </>
  );
}

/* ------------------------------------------------------------- Paar-Ideen */

export interface PaarIdee {
  pair: string;
  seite: "LONG" | "SHORT";
  grund: string;
  /** Live-Zustand aus dem Screener, falls vorhanden. */
  status: string | null;
}

export function PaarIdeenListe({
  ideen, waehrungen,
}: { ideen: PaarIdee[]; waehrungen: RankingCurrency[] }) {
  const [offen, setOffen] = useState<RankingCurrency[] | null>(null);
  const nachCcy = new Map(waehrungen.map((c) => [c.ccy, c]));

  if (ideen.length === 0) {
    return (
      <Empty>
        Diese Woche steht keine Währung im obersten oder untersten Fünftel.
        Das Ranking gibt damit für kein Paar eine Richtung vor — das ist ein
        gültiges Ergebnis, kein fehlender Wert.
      </Empty>
    );
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {ideen.map((i) => (
          <button key={i.pair} type="button"
            title={`${i.pair} — woran das liegt`}
            onClick={() => setOffen(
              [i.pair.slice(0, 3), i.pair.slice(3, 6)]
                .map((c) => nachCcy.get(c))
                .filter((c): c is RankingCurrency => !!c),
            )}
            className="flex items-center gap-3 rounded-xl bg-sand/60 px-3 py-2.5 text-left
                       transition hover:bg-sand active:scale-[0.99]">
            <span className="font-display text-sm font-bold text-ink">{i.pair}</span>
            <Badge tone={i.seite === "LONG" ? "good" : "bad"}>{i.seite}</Badge>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{i.grund}</span>
            {i.status === "HIT" && <Badge tone="accent">GVA-Hit</Badge>}
            {i.status === "PREPARE" && <Badge tone="warn">nah</Badge>}
          </button>
        ))}
      </div>

      <FaktorDialog waehrungen={offen} schliessen={() => setOffen(null)} />
    </>
  );
}

/* ---------------------------------------------------------------- Dialog */

function FaktorDialog({
  waehrungen, schliessen,
}: { waehrungen: RankingCurrency[] | null; schliessen: () => void }) {
  // Nichts gewählt: gar nichts rendern. Ein Modal mit `offen={false}` täte es
  // auch, aber dann steht ein leerer Dialog samt Portal dauerhaft im Baum.
  if (!waehrungen || waehrungen.length === 0) return null;

  const titel = waehrungen.map((c) => c.ccy).join(" gegen ");

  return (
    <Modal offen schliessen={schliessen} breite="max-w-xl">
      <ModalKopf schliessen={schliessen}>
        <span className="font-display text-lg font-bold text-ink">{titel}</span>
        <span className="text-xs text-ink-faint">woraus der Q-Score entsteht</span>
      </ModalKopf>

      <div className="space-y-5 px-5 py-5">
        {waehrungen.map((c) => <FaktorBlock key={c.ccy} c={c} />)}

        <p className="border-t border-line/60 pt-4 text-[11px] leading-relaxed text-ink-faint">
          Die Beiträge kommen vom Modell selbst (`top_features`), nicht aus einer
          nachträglichen Erklärung: positiv heisst, der Faktor hat den Score nach
          oben gezogen. Gezeigt werden die drei stärksten — der Rest ist im Score
          enthalten, aber zu klein, um die Richtung zu erklären.
        </p>
      </div>
    </Modal>
  );
}

function FaktorBlock({ c }: { c: RankingCurrency }) {
  const max = Math.max(...c.topFeatures.map((f) => Math.abs(f.value)), 0.0001);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="font-display text-base font-bold text-ink">{c.ccy}</span>
        <Badge tone={Q_TON[c.strength_quintile] ?? "neutral"}>
          Q{c.strength_quintile} · {Q_TEXT[c.strength_quintile] ?? "—"}
        </Badge>
        <span className="tabular text-sm text-ink-soft">
          Score {c.score >= 0 ? "+" : ""}{c.score.toFixed(2)}
        </span>
      </div>

      {c.topFeatures.length === 0 ? (
        <p className="rounded-xl border border-line/60 px-3 py-2.5 text-xs text-ink-muted">
          Für diese Woche hat das Modell keine Faktor-Beiträge geschrieben. Die
          Spalte <code>top_features</code> füllt der Wochen-Job in{" "}
          <code>ml_engine/run_weekly.py</code>; ältere Zeilen haben sie nicht.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {c.topFeatures.map((f) => {
            const t = faktorText(f.feature);
            const anteil = Math.min(100, (Math.abs(f.value) / max) * 100);
            const positiv = f.value >= 0;
            return (
              <li key={f.feature} className="rounded-xl border border-line/60 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink-soft">{t.label}</span>
                  <span className={cx("tabular text-sm font-medium",
                    positiv ? "text-good-bright" : "text-bad-bright")}>
                    {positiv ? "+" : ""}{f.value.toFixed(3)}
                  </span>
                </div>
                <div className="mt-1.5 flex h-[6px] items-stretch overflow-hidden rounded-full bg-sand">
                  <div className="flex w-1/2 justify-end">
                    {!positiv && <div className="h-full rounded-l-full bg-bad" style={{ width: `${anteil}%` }} />}
                  </div>
                  <div className="flex w-1/2 justify-start">
                    {positiv && <div className="h-full rounded-r-full bg-good" style={{ width: `${anteil}%` }} />}
                  </div>
                </div>
                {t.erklaerung && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{t.erklaerung}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
