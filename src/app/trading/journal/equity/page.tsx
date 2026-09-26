import Link from "next/link";
import {
  fetchTrades, ladeKontoKette, computeJournalStats, equityKurve, signiertesR,
  tradingUserId,
} from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { JournalHinweis } from "@/components/journal-hinweis";
import { EquityChart } from "@/components/equity-chart";
import { Card, CardTitle, Stat, Empty, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Equity — die Kurve und was sie über die Verteilung verrät.
 *
 * Umgezogen aus dem GVA-Screener (`/journal/equity`), siehe TRADING-UMBAU.md.
 *
 * Unter der Kurve steht die R-Verteilung. Sie beantwortet die Frage, die eine
 * Winrate allein nicht beantwortet: Kommt der Gewinn aus vielen kleinen
 * Treffern oder aus zwei Ausreissern? Eine Strategie, die ohne ihre beiden
 * besten Trades unter Null liegt, ist keine Strategie.
 */

/** Ein Balken je R-Bereich. Grenzen bewusst grob — es geht um die Form. */
const KLASSEN = [
  { label: "≤ −2 R", test: (r: number) => r <= -2 },
  { label: "−2 bis −1", test: (r: number) => r > -2 && r <= -1 },
  { label: "−1 bis 0", test: (r: number) => r > -1 && r < 0 },
  { label: "0 (BE)", test: (r: number) => r === 0 },
  { label: "0 bis 1", test: (r: number) => r > 0 && r <= 1 },
  { label: "1 bis 2", test: (r: number) => r > 1 && r <= 2 },
  { label: "2 bis 3", test: (r: number) => r > 2 && r <= 3 },
  { label: "> 3 R", test: (r: number) => r > 3 },
];

export default async function EquitySeite({
  searchParams,
}: {
  searchParams: Promise<{ art?: string }>;
}) {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const sp = await searchParams;
  const art = sp.art === "live" ? "live" : sp.art === "alle" ? undefined : "backtest";

  /*
   * Live-Trades kommen aus der Kontokette, damit R aus Gewinn und Risiko
   * gerechnet ist und nicht aus einem alten gespeicherten Wert. Backtest
   * hat keine Kontoführung — dort zählt das eingetragene R.
   */
  const [kette, backtest] = await Promise.all([
    art === "backtest" ? null : ladeKontoKette(),
    art === "live" ? [] : fetchTrades({ sessionType: "backtest" }),
  ]);
  const trades = art === "live" ? (kette?.live ?? [])
    : art === "backtest" ? backtest
      : [...(kette?.live ?? []), ...backtest];
  const punkte = equityKurve(trades);
  const s = computeJournalStats(trades);

  const rWerte = trades
    .filter((t) => t.result)
    .map(signiertesR);
  const verteilung = KLASSEN.map((k) => ({
    label: k.label,
    n: rWerte.filter(k.test).length,
  }));
  const maxN = Math.max(...verteilung.map((v) => v.n), 1);

  // Wie viel vom Ergebnis hängt an den zwei besten Trades?
  const sortiert = [...rWerte].sort((a, b) => b - a);
  const ohneTopZwei = sortiert.slice(2).reduce((a, b) => a + b, 0);

  const chip = (wert: string, label: string) => {
    const aktiv = (sp.art ?? "backtest") === wert;
    return (
      <Link href={`/trading/journal/equity?art=${wert}`}
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

      <Card area={s.gesamtR > 0 ? "trading" : undefined}>
        <div className="mb-4 grid gap-4 sm:grid-cols-4">
          <Stat label="Gesamt"
            value={`${s.gesamtR >= 0 ? "+" : ""}${s.gesamtR.toFixed(1)} R`}
            tone={s.gesamtR > 0 ? "good" : s.gesamtR < 0 ? "bad" : "neutral"}
            sub={`${s.n} Trades`} />
          <Stat label="Max. Drawdown" value={`${s.maxDrawdownR.toFixed(1)} R`}
            tone={s.maxDrawdownR > 8 ? "bad" : "neutral"}
            sub="grösster Rückgang der Kurve" />
          <Stat label="Erwartungswert"
            value={s.expectancy === null ? "—" : `${s.expectancy >= 0 ? "+" : ""}${s.expectancy.toFixed(2)} R`}
            tone={s.expectancy !== null && s.expectancy > 0 ? "good" : "neutral"} />
          <Stat label="Profit Factor"
            value={s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)}
            tone={s.profitFactor !== null && s.profitFactor >= 1.5 ? "good" : "neutral"} />
        </div>
        <EquityChart punkte={punkte} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>R-Verteilung</CardTitle>
          {rWerte.length === 0 ? (
            <Empty>Noch keine abgeschlossenen Trades.</Empty>
          ) : (
            <div className="space-y-2">
              {verteilung.map((v) => (
                <div key={v.label} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-ink-muted">{v.label}</span>
                  <div className="min-w-0 flex-1">
                    <Bar pct={(v.n / maxN) * 100}
                      color={v.label.startsWith("−") || v.label.startsWith("≤") ? "#E28B72" : "#5FC2A6"} />
                  </div>
                  <span className="tabular w-8 shrink-0 text-right text-xs text-ink-soft">
                    {v.n}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Hängt alles an wenigen Trades?</CardTitle>
          {rWerte.length < 5 ? (
            <Empty>Ab etwa fünf Trades lohnt sich diese Frage.</Empty>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Stat label="Mit allen Trades"
                  value={`${s.gesamtR >= 0 ? "+" : ""}${s.gesamtR.toFixed(1)} R`}
                  tone={s.gesamtR > 0 ? "good" : "bad"} />
                <Stat label="Ohne die zwei besten"
                  value={`${ohneTopZwei >= 0 ? "+" : ""}${ohneTopZwei.toFixed(1)} R`}
                  tone={ohneTopZwei > 0 ? "good" : "bad"}
                  sub={`grösste: ${sortiert.slice(0, 2).map((r) => `+${r.toFixed(1)}`).join(", ")} R`} />
              </div>
              <p className="text-sm text-ink-muted">
                {ohneTopZwei > 0
                  ? "Auch ohne die beiden Ausreisser bleibt die Kurve über Null. Das spricht dafür, dass der Vorteil in der Methode liegt und nicht im Glück."
                  : "Ohne die beiden besten Trades liegt das Ergebnis unter Null. Das heisst nicht, dass die Strategie nichts taugt — aber die Stichprobe ist noch zu klein, um daraus etwas zu schliessen. Weiter erfassen."}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
