import Link from "next/link";
import {
  fetchRankingMitWoche, fetchScreener, rankingPairBias, tradingConfigured,
  G8, type RankingCurrency, type ScreenerPair,
} from "@/lib/supabase/trading";
import { Rangliste, PaarIdeenListe, type PaarIdee } from "@/components/trading/ranking-liste";
import { Card, CardTitle, Stat, Empty } from "@/components/ui";

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
 *
 * Zeilen und Paar-Ideen sind anklickbar — dahinter stehen die Faktor-Beiträge
 * des Modells. Ohne sie wäre der Score eine Zahl, die man glauben oder
 * ignorieren kann, aber nicht prüfen.
 */

/**
 * Was das Ranking für die 28 Paare bedeutet — aber nur dort, wo es etwas
 * bedeutet. Paare ohne Extremwährung tauchen gar nicht erst auf.
 */
function baueIdeen(ranking: RankingCurrency[], pairs: ScreenerPair[]): PaarIdee[] {
  const qOf = new Map(ranking.map((r) => [r.ccy, r.strength_quintile]));
  const statusOf = new Map(
    pairs.map((p) => [p.pair.replace(/[^A-Za-z]/g, "").toUpperCase(), p]),
  );

  const ideen: PaarIdee[] = [];

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
        status: statusOf.get(base + quote)?.status ?? null,
      });
    }
  }

  // Erst die Paare, bei denen beide Seiten extrem sind (zwei Gründe), dann der Rest.
  return ideen.sort((a, b) => b.grund.length - a.grund.length || a.pair.localeCompare(b.pair));
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
            <Rangliste waehrungen={sortiert} />
          </Card>

          <Card>
            <CardTitle>Was das für Paare heisst</CardTitle>
            <PaarIdeenListe ideen={baueIdeen(currencies, screener?.data ?? [])}
              waehrungen={currencies} />
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
