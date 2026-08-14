import Link from "next/link";
import {
  fetchTrades, computeJournalStats, signiertesR, SETUPS, tradingUserId, type Trade,
} from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { JournalHinweis } from "@/components/journal-hinweis";
import { Card, CardTitle, Stat, Badge, Empty, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Wochenrückblick — hat sich das Pensum gelohnt, und wo?
 *
 * Umgezogen aus dem GVA-Screener (`/journal/rueckblick`), siehe TRADING-UMBAU.md.
 *
 * Die Seite misst zwei Dinge gegeneinander: das **Pensum** (laut Roadmap 24
 * Backtest-Trades pro Woche, 3 Tage à 8) und das **Ergebnis**. Beide allein
 * sind irreführend — eine gute Woche mit vier Trades sagt nichts, und 24
 * Trades mit −6 R sind kein Fortschritt, sondern eine teure Gewohnheit.
 */

/** Montag der Woche, in der `datum` liegt. */
function wochenStart(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  const versatz = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - versatz);
  return d.toISOString().slice(0, 10);
}

function wochenLabel(start: string): string {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(a);
  b.setUTCDate(b.getUTCDate() + 6);
  const f = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`;
  return `${f(a)} – ${f(b)}`;
}

/** Pensum laut CLAUDE.md: 3 Tage pro Woche à 8 Trades. */
const WOCHEN_ZIEL = 24;

export default async function RueckblickSeite({
  searchParams,
}: {
  searchParams: Promise<{ art?: string }>;
}) {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const sp = await searchParams;
  const art = sp.art === "live" ? "live" : sp.art === "alle" ? undefined : "backtest";
  const alle = await fetchTrades(art ? { sessionType: art } : {});

  const proWoche = new Map<string, Trade[]>();
  for (const t of alle) {
    if (!t.date) continue;
    const w = wochenStart(t.date);
    const liste = proWoche.get(w) ?? [];
    liste.push(t);
    proWoche.set(w, liste);
  }

  const wochen = [...proWoche.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 16)
    .map(([start, liste]) => ({ start, liste, stats: computeJournalStats(liste) }));

  const laufend = wochenStart(new Date().toISOString().slice(0, 10));
  const dieseWoche = wochen.find((w) => w.start === laufend);
  const erledigt = dieseWoche?.stats.n ?? 0;

  const chip = (wert: string, label: string) => {
    const aktiv = (sp.art ?? "backtest") === wert;
    return (
      <Link href={`/trading/journal/rueckblick?art=${wert}`}
        className={aktiv
          ? "rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-ink-on shadow-glow-accent"
          : "rounded-xl bg-sand px-3 py-1.5 text-sm text-ink-muted transition hover:text-ink-soft"}>
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {chip("backtest", "Backtest")}
        {chip("live", "Live")}
        {chip("alle", "beides")}
      </div>

      <Card area="trading">
        <CardTitle>Diese Woche</CardTitle>
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Pensum" value={`${erledigt} / ${WOCHEN_ZIEL}`}
            tone={erledigt >= WOCHEN_ZIEL ? "good" : erledigt === 0 ? "bad" : "warn"}
            sub="3 Tage à 8 Trades" />
          <Stat label="Winrate"
            value={dieseWoche?.stats.winrate === null || !dieseWoche
              ? "—" : `${dieseWoche.stats.winrate.toFixed(0)} %`}
            tone={dieseWoche?.stats.winrate != null && dieseWoche.stats.winrate >= 50
              ? "good" : "neutral"} />
          <Stat label="Ergebnis"
            value={dieseWoche
              ? `${dieseWoche.stats.gesamtR >= 0 ? "+" : ""}${dieseWoche.stats.gesamtR.toFixed(1)} R`
              : "—"}
            tone={dieseWoche && dieseWoche.stats.gesamtR > 0 ? "good"
              : dieseWoche && dieseWoche.stats.gesamtR < 0 ? "bad" : "neutral"} />
          <Stat label="Noch offen"
            value={Math.max(0, WOCHEN_ZIEL - erledigt)}
            sub={erledigt >= WOCHEN_ZIEL ? "Pensum erfüllt" : "bis Sonntag"} />
        </div>
        <div className="mt-4">
          <Bar pct={(erledigt / WOCHEN_ZIEL) * 100}
            color={erledigt >= WOCHEN_ZIEL ? "#5FC2A6" : "#E7A96B"} />
        </div>
      </Card>

      <Card>
        <CardTitle>Wochen im Verlauf</CardTitle>
        {wochen.length === 0 ? (
          <Empty>Noch keine Woche mit Trades.</Empty>
        ) : (
          <div>
            {wochen.map((w) => {
              const paare = [...new Set(w.liste.map((t) => t.pair))];
              const beste = [...w.liste].sort((a, b) => signiertesR(b) - signiertesR(a))[0];
              const schlechteste = [...w.liste].sort((a, b) => signiertesR(a) - signiertesR(b))[0];

              return (
                <div key={w.start}
                  className="border-t border-line/70 py-3.5 first:border-t-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="w-[110px] shrink-0 text-sm font-medium text-ink">
                      {wochenLabel(w.start)}
                    </span>
                    <span className="tabular w-14 shrink-0 text-xs text-ink-muted">
                      {w.stats.n} / {WOCHEN_ZIEL}
                    </span>
                    <div className="w-24 shrink-0">
                      <Bar pct={(w.stats.n / WOCHEN_ZIEL) * 100}
                        color={w.stats.n >= WOCHEN_ZIEL ? "#5FC2A6" : "#E7A96B"} />
                    </div>
                    <span className="tabular w-12 shrink-0 text-xs text-ink-muted">
                      {w.stats.winrate === null ? "—" : `${w.stats.winrate.toFixed(0)} %`}
                    </span>
                    <span className={`tabular ml-auto text-sm font-medium ${
                      w.stats.gesamtR > 0 ? "text-good-bright"
                        : w.stats.gesamtR < 0 ? "text-bad-bright" : "text-ink-muted"
                    }`}>
                      {w.stats.gesamtR >= 0 ? "+" : ""}{w.stats.gesamtR.toFixed(1)} R
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[110px]">
                    {paare.slice(0, 6).map((p) => (
                      <Badge key={p} tone="neutral">{p}</Badge>
                    ))}
                    {paare.length > 6 && (
                      <span className="text-xs text-ink-faint">+{paare.length - 6}</span>
                    )}
                    {beste && signiertesR(beste) > 0 && (
                      <span className="text-xs text-ink-faint">
                        beste {beste.pair} +{signiertesR(beste).toFixed(1)} R
                      </span>
                    )}
                    {schlechteste && signiertesR(schlechteste) < 0 && (
                      <span className="text-xs text-ink-faint">
                        · schlechteste {schlechteste.pair} {signiertesR(schlechteste).toFixed(1)} R
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Setups im Vergleich (alle Wochen)</CardTitle>
        {alle.length === 0 ? (
          <Empty>Noch nichts erfasst.</Empty>
        ) : (
          <div className="space-y-2">
            {SETUPS.map((setup) => {
              const mit = alle.filter((t) => t.setups[setup.key]);
              const st = computeJournalStats(mit);
              const wr = st.winrate ?? 0;
              return (
                <div key={setup.key} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-sm text-ink-soft">{setup.label}</span>
                  <span className="tabular w-10 shrink-0 text-right text-xs text-ink-muted">
                    {st.n}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <Bar pct={wr} color={wr >= 50 ? "#5FC2A6" : "#E28B72"} />
                  </div>
                  <span className="tabular w-12 shrink-0 text-right text-xs text-ink-muted">
                    {st.winrate === null ? "—" : `${wr.toFixed(0)} %`}
                  </span>
                  <span className={`tabular w-16 shrink-0 text-right text-sm font-medium ${
                    st.gesamtR > 0 ? "text-good-bright"
                      : st.gesamtR < 0 ? "text-bad-bright" : "text-ink-muted"
                  }`}>
                    {st.gesamtR >= 0 ? "+" : ""}{st.gesamtR.toFixed(1)} R
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-ink-faint">
          Ein Trade kann mehrere Setups tragen — die Zeilen addieren sich deshalb
          nicht auf die Gesamtzahl. Gesucht ist nicht die Summe, sondern welches
          Setup allein für sich trägt.
        </p>
      </Card>
    </div>
  );
}
