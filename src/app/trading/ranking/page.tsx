import Link from "next/link";
import {
  fetchRankingMitWoche, fetchScreener, rankingPairBias, tradingConfigured,
  G8, type RankingCurrency, type ScreenerPair,
} from "@/lib/supabase/trading";
import { Card, CardTitle, Stat, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Währungs-Ranking — der fundamentale Teil der Entscheidung.
 *
 * Umgezogen aus dem GVA-Screener (`/ml/ranking`), siehe TRADING-UMBAU.md.
 *
 * Die Zahl, auf die es ankommt, ist das **Stärke-Quintil** (Q1–Q5): wo der
 * Wochen-Score einer Währung innerhalb ihrer eigenen 156-Wochen-Verteilung
 * steht. Q5 = stärkstes Fünftel, Q1 = schwächstes. Das ist ausdrücklich
 * KEIN Konfidenzmass — es sagt nicht "das Modell ist sich sicher", sondern
 * "diese Währung ist im Vergleich zu ihrer eigenen Geschichte gerade stark".
 *
 * Richtung geben nur die Extreme Q5 und Q1. Q2–Q4 sind neutral. Das ist
 * bewusst streng: ein Ranking, das für jedes Paar eine Meinung hat, hat für
 * kein Paar eine.
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
        {!positiv && (
          <div className="h-full rounded-l-full bg-bad" style={{ width: `${anteil}%` }} />
        )}
      </div>
      <div className="flex w-1/2 justify-start">
        {positiv && (
          <div className="h-full rounded-r-full bg-good" style={{ width: `${anteil}%` }} />
        )}
      </div>
    </div>
  );
}

function WaehrungsZeile({
  c, platz, max,
}: { c: RankingCurrency; platz: number; max: number }) {
  const q = c.strength_quintile;
  return (
    <div className="flex items-center gap-4 border-t border-line/70 py-3 first:border-t-0">
      <span className="tabular w-6 shrink-0 text-xs text-ink-faint">
        {String(platz).padStart(2, "0")}
      </span>
      <span className="w-12 shrink-0 font-display text-base font-bold text-ink">{c.ccy}</span>
      <div className="min-w-0 flex-1">
        <ScoreBalken score={c.score} max={max} />
      </div>
      <span className="tabular w-16 shrink-0 text-right text-sm text-ink-soft">
        {c.score >= 0 ? "+" : ""}{c.score.toFixed(2)}
      </span>
      <span className="w-28 shrink-0 text-right">
        <Badge tone={Q_TON[q] ?? "neutral"} title={`Stärke-Quintil ${q} von 5`}>
          Q{q} · {Q_TEXT[q] ?? "—"}
        </Badge>
      </span>
    </div>
  );
}

/**
 * Was das Ranking für die 28 Paare bedeutet — aber nur dort, wo es etwas
 * bedeutet. Paare ohne Extremwährung tauchen gar nicht erst auf.
 */
function PaarIdeen({
  ranking, pairs,
}: { ranking: RankingCurrency[]; pairs: ScreenerPair[] }) {
  const qOf = new Map(ranking.map((r) => [r.ccy, r.strength_quintile]));
  const statusOf = new Map(
    pairs.map((p) => [p.pair.replace(/[^A-Za-z]/g, "").toUpperCase(), p]),
  );

  const ideen: {
    pair: string; seite: "LONG" | "SHORT"; grund: string; live: ScreenerPair | null;
  }[] = [];

  for (let i = 0; i < G8.length; i++) {
    for (let j = 0; j < G8.length; j++) {
      if (i === j) continue;
      const base = G8[i], quote = G8[j];
      const bq = qOf.get(base), qq = qOf.get(quote);
      if (bq === undefined || qq === undefined) continue;
      // Nur eine Richtung je Paar betrachten, sonst steht jede Idee zweimal da.
      if (!statusOf.has(base + quote)) continue;

      const seite = rankingPairBias(bq, qq);
      if (seite === "NEUTRAL") continue;

      const teile: string[] = [];
      if (bq === 5 || bq === 1) teile.push(`${base} Q${bq}`);
      if (qq === 5 || qq === 1) teile.push(`${quote} Q${qq}`);

      ideen.push({
        pair: base + quote,
        seite,
        grund: teile.join(" · "),
        live: statusOf.get(base + quote) ?? null,
      });
    }
  }

  // Erst die Paare, bei denen beide Seiten extrem sind (zwei Gründe), dann der Rest.
  ideen.sort((a, b) => b.grund.length - a.grund.length || a.pair.localeCompare(b.pair));

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
    <div className="grid gap-2 sm:grid-cols-2">
      {ideen.map((i) => (
        <div key={i.pair}
          className="flex items-center gap-3 rounded-xl bg-sand/60 px-3 py-2.5">
          <span className="font-display text-sm font-bold text-ink">{i.pair}</span>
          <Badge tone={i.seite === "LONG" ? "good" : "bad"}>{i.seite}</Badge>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{i.grund}</span>
          {i.live?.status === "HIT" && <Badge tone="accent">GVA-Hit</Badge>}
          {i.live?.status === "PREPARE" && <Badge tone="warn">nah</Badge>}
        </div>
      ))}
    </div>
  );
}

export default async function RankingSeite() {
  if (!tradingConfigured()) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card>
          <CardTitle>Währungs-Ranking</CardTitle>
          <Empty>
            Die Trading-Datenbank ist nicht verbunden. Es fehlen die
            Umgebungsvariablen <code>TRADING_SUPABASE_URL</code> und{" "}
            <code>TRADING_SUPABASE_SERVICE_ROLE_KEY</code>.
          </Empty>
        </Card>
      </div>
    );
  }

  const [{ weekStart, currencies }, screener] = await Promise.all([
    fetchRankingMitWoche(),
    fetchScreener(),
  ]);

  const sortiert = [...currencies].sort((a, b) => b.score - a.score);
  const max = Math.max(...sortiert.map((c) => Math.abs(c.score)), 0.01);
  const stark = sortiert.filter((c) => c.strength_quintile === 5);
  const schwach = sortiert.filter((c) => c.strength_quintile === 1);

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Währungs-Ranking</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Fundamentale Wochenlage der acht Hauptwährungen — die Gegenprobe zur GVA-Linie.
          </p>
        </div>
        <Link href="/trading" className="text-xs text-accent-soft transition hover:underline">
          ← Trading-Übersicht
        </Link>
      </div>

      {sortiert.length === 0 ? (
        <Card>
          <Empty>
            Noch kein Ranking in der Datenbank. Die wöchentliche GitHub-Action
            „ML Weekly Ranking" schreibt es sonntags nach{" "}
            <code>ml_weekly_rankings</code>.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card area="trading">
              <Stat
                label="Woche"
                value={weekStart
                  ? new Date(`${weekStart}T12:00:00`).toLocaleDateString("de-CH",
                      { day: "2-digit", month: "short" })
                  : "—"}
                sub="Beginn der Ranking-Woche"
              />
            </Card>
            <Card>
              <Stat
                label="Stark (Q5)"
                value={stark.length ? stark.map((c) => c.ccy).join(" · ") : "keine"}
                tone={stark.length ? "good" : "neutral"}
                sub="oberstes Fünftel der eigenen Historie"
              />
            </Card>
            <Card>
              <Stat
                label="Schwach (Q1)"
                value={schwach.length ? schwach.map((c) => c.ccy).join(" · ") : "keine"}
                tone={schwach.length ? "bad" : "neutral"}
                sub="unterstes Fünftel der eigenen Historie"
              />
            </Card>
          </div>

          <Card>
            <CardTitle>Rangliste</CardTitle>
            <div>
              {sortiert.map((c, i) => (
                <WaehrungsZeile key={c.ccy} c={c} platz={i + 1} max={max} />
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Was das für Paare heisst</CardTitle>
            <PaarIdeen ranking={currencies} pairs={screener?.data ?? []} />
          </Card>

          <Card flat>
            <CardTitle>Wie das Quintil zu lesen ist</CardTitle>
            <div className="space-y-2 text-sm text-ink-muted">
              <p>
                Der Score ist der demeante Korb-Score der ML-Engine. Er ist für
                sich genommen schwer einzuordnen — 0.31 sagt nichts, solange man
                nicht weiss, ob das für diese Währung viel oder wenig ist.
              </p>
              <p>
                Genau das leistet das Quintil: Es setzt den Score in seine eigene
                Verteilung über 156 Wochen. <strong className="text-ink-soft">Q5</strong>{" "}
                heisst, die Währung steht so stark da wie in höchstens jeder fünften
                Woche der letzten drei Jahre.
              </p>
              <p>
                Richtung gibt nur Q5 und Q1. Sind beide Seiten eines Paares gleich
                extrem (beide Q5 oder beide Q1), hebt sich der relative Vorteil auf —
                das Paar gilt als neutral.
              </p>
              <p className="text-ink-faint">
                Das Ranking ist eine Gegenprobe, kein Einstiegssignal. Der Einstieg
                kommt aus der GVA-Linie; das Ranking sagt nur, ob der Wind von
                vorne oder von hinten kommt.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
