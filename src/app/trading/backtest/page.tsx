import Link from "next/link";
import { Suspense } from "react";
import {
  fetchBacktestCategories, fetchNativeBacktestTrades, fetchBacktestSessions,
  fetchChecklist,
} from "@/lib/supabase/backtest";
import { tradingConfigured } from "@/lib/supabase/trading";
import {
  computeNativeBacktestStats, computeBreakdown, computeInsights, computeEquityKurve,
  BREAKDOWN_DIMENSIONS,
  type BreakdownDimension, type BreakdownRow, type ChecklistPunkt,
} from "@/lib/backtest-types";
import {
  startBacktestSession, closeBacktestSession, reaktiviereBacktestSession,
} from "@/lib/backtest-actions";
import { BacktestBreakdown } from "@/components/backtest-breakdown";
import { BacktestInsights } from "@/components/backtest-insights";
import { BacktestEquity } from "@/components/backtest-equity";
import { BacktestCheckliste } from "@/components/backtest-checkliste";
import { BacktestTradeForm } from "@/components/backtest-trade-form";
import { BacktestTradeListe } from "@/components/backtest-trade-liste";
import { Card, CardTitle, Stat, Badge, Empty, Input, Button, cx } from "@/components/ui";
import { BacktestFundamental } from "@/components/backtest-fundamental";
import { baueBacktestFundamental, KREUZ_LABEL } from "@/lib/confluence/backtest-bilanz";

export const dynamic = "force-dynamic";

function Zahnrad() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Backtest-Journal</CardTitle>
        <p className="text-sm text-ink-muted">Trading-Datenbank nicht verbunden.</p>
      </Card>
    );
  }

  const sp = await searchParams;
  const [categories, allTrades, sessions, checkliste] = await Promise.all([
    fetchBacktestCategories(false),
    fetchNativeBacktestTrades(),
    fetchBacktestSessions(),
    fetchChecklist(false),
  ]);

  const aktiveSessions = sessions.filter((s) => s.status === "aktiv");
  const abgeschlosseneSessions = sessions.filter((s) => s.status === "abgeschlossen");

  // Ansicht und Session kommen aus der URL, damit die Buttons an der Session
  // direkt hierher verlinken können - "weiterführen" öffnet das Eintragen,
  // "auswerten" die Analyse. Beides schliesst sich bewusst aus: beim
  // Eintragen soll keine Statistik ablenken, in der Auswertung kein Formular.
  const ansicht: "eintragen" | "auswerten" =
    sp.ansicht === "auswerten" ? "auswerten" : "eintragen";

  // In der Auswertung darf auch eine abgeschlossene Session gewählt sein,
  // beim Eintragen nur eine offene - in eine abgeschlossene Session trägt
  // man definitionsgemäss nichts mehr ein.
  const waehlbar = ansicht === "auswerten" ? sessions : aktiveSessions;
  const currentSession =
    waehlbar.find((s) => s.id === sp.session) ?? waehlbar[0] ?? null;

  const trades = currentSession
    ? allTrades.filter((t) => t.session_id === currentSession.id)
    : [];
  const stats = computeNativeBacktestStats(trades);

  const kategorien = {
    gvaTyp: categories.find((c) => c.key === "gva_typ") ?? null,
    confluence: categories.find((c) => c.key === "confluence") ?? null,
    anmerkung: categories.find((c) => c.key === "anmerkung") ?? null,
    skipGrund: categories.find((c) => c.key === "skip_grund") ?? null,
  };

  const tradesProSession = new Map<string, typeof allTrades>();
  for (const t of allTrades) {
    if (!t.session_id) continue;
    const liste = tradesProSession.get(t.session_id) ?? [];
    liste.push(t);
    tradesProSession.set(t.session_id, liste);
  }

  const sessionLink = (id: string, zu: "eintragen" | "auswerten") =>
    `/trading/backtest?session=${id}&ansicht=${zu}`;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Backtest-Journal</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Pro Session ein Pair.{" "}
            <Link href="/trading/backtest/auswertung" className="text-accent-soft hover:underline">
              Gesamtauswertung über alle Pairs ↗
            </Link>
          </p>
        </div>
        <Link href="/trading/backtest/kategorien" title="Kategorien verwalten"
          className="rounded-lg p-1.5 text-ink-faint transition hover:bg-sand hover:text-ink-soft">
          <Zahnrad />
        </Link>
      </div>

      <Card>
        <CardTitle>Sessions</CardTitle>
        <p className="mb-4 text-xs text-ink-muted">
          Eine Session bindet ein Pair fest. „Weiterführen" öffnet das
          Eintragen, „Auswerten" die Analyse - beides getrennt, damit beim
          Erfassen keine Statistik dazwischenfunkt.
        </p>

        {sessions.length === 0 ? (
          <Empty>Noch keine Session gestartet.</Empty>
        ) : (
          <ul className="mb-4 space-y-1.5">
            {[...aktiveSessions, ...abgeschlosseneSessions].map((s) => {
              const sStats = computeNativeBacktestStats(tradesProSession.get(s.id) ?? []);
              const istAktuell = s.id === currentSession?.id;
              return (
                <li key={s.id}
                  className={cx("flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm",
                    istAktuell ? "border border-accent/50 bg-accent-tint" : "bg-sand/60")}>
                  <span className="font-medium text-ink">{s.pair}</span>
                  <Badge tone={s.status === "aktiv" ? "good" : "neutral"}>
                    {s.status === "aktiv" ? "offen" : "abgeschlossen"}
                  </Badge>
                  <span className="tabular text-xs text-ink-soft">
                    {sStats.total} Trades
                    {sStats.winrate !== null && ` · ${sStats.winrate.toFixed(0)} % WR`}
                    {` · ${sStats.gesamtR > 0 ? "+" : ""}${sStats.gesamtR.toFixed(2)} R`}
                  </span>

                  <span className="ml-auto flex items-center gap-2.5">
                    {s.status === "aktiv" ? (
                      <Link href={sessionLink(s.id, "eintragen")}
                        className={cx("text-xs transition",
                          istAktuell && ansicht === "eintragen"
                            ? "font-medium text-accent-soft"
                            : "text-ink-faint hover:text-accent-soft")}>
                        weiterführen
                      </Link>
                    ) : (
                      <form action={reaktiviereBacktestSession}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs text-ink-faint transition hover:text-accent-soft">
                          wieder öffnen
                        </button>
                      </form>
                    )}
                    <Link href={sessionLink(s.id, "auswerten")}
                      className={cx("text-xs transition",
                        istAktuell && ansicht === "auswerten"
                          ? "font-medium text-accent-soft"
                          : "text-ink-faint hover:text-accent-soft")}>
                      auswerten
                    </Link>
                    {s.status === "aktiv" && (
                      <form action={closeBacktestSession}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs text-ink-faint transition hover:text-bad">
                          abschliessen
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <form action={startBacktestSession} className="flex flex-wrap items-end gap-2">
          <Input name="pair" placeholder="Neues Pair, z. B. EURUSD" required
            className="w-48 uppercase" aria-label="Pair" />
          <Button type="submit" variant="ghost">Session starten</Button>
        </form>
      </Card>

      {!currentSession ? (
        <Card>
          <Empty>Erst eine Session starten, dann geht es hier weiter.</Empty>
        </Card>
      ) : ansicht === "auswerten" ? (
        <AuswertungsAnsicht session={currentSession} trades={trades} stats={stats}
          kategorien={kategorien} />
      ) : (
        <EintragenAnsicht session={currentSession} trades={trades}
          kategorien={kategorien} checkliste={checkliste} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Eintragen */

type Kategorie = Awaited<ReturnType<typeof fetchBacktestCategories>>[number];
type Trade = Awaited<ReturnType<typeof fetchNativeBacktestTrades>>[number];
type Session = Awaited<ReturnType<typeof fetchBacktestSessions>>[number];

/**
 * Reiner Erfassungs-Modus: Checkliste, Formular und die schon eingetragenen
 * Trades, sonst nichts. Bewusst ohne Kennzahlen - wer gerade 20 Setups
 * durchspielt, soll nicht nach jedem Trade auf eine wackelnde Winrate
 * schauen und sich davon beeinflussen lassen.
 */
function EintragenAnsicht({
  session, trades, kategorien, checkliste,
}: {
  session: Session;
  trades: Trade[];
  kategorien: {
    gvaTyp: Kategorie | null; confluence: Kategorie | null;
    anmerkung: Kategorie | null; skipGrund: Kategorie | null;
  };
  checkliste: ChecklistPunkt[];
}) {
  return (
    <>
      <BacktestCheckliste punkte={checkliste} />

      <Card>
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Neuer Trade · {session.pair}</CardTitle>
          <Link href={`/trading/backtest?session=${session.id}&ansicht=auswerten`}
            className="text-xs text-accent-soft hover:underline">
            Auswertung ansehen ↗
          </Link>
        </div>
        <BacktestTradeForm sessionId={session.id} kategorien={kategorien} />
      </Card>

      <Card>
        <CardTitle>Eingetragen ({trades.length})</CardTitle>
        <BacktestTradeListe trades={trades} kategorien={kategorien} />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------- Fundamental */

/**
 * Die Backtest-Trades gegen die Fundamentallage ihres jeweiligen Handelstages.
 *
 * Eigene async-Komponente, damit sie hinter ihrer eigenen Suspense-Grenze
 * lädt. Läuft still leer, wenn die Trading-Datenbank nicht verbunden ist —
 * das Backtest-Journal selbst hängt nicht daran.
 */
async function FundamentalBlock({ trades }: { trades: Trade[] }) {
  if (!tradingConfigured()) return null;
  const bild = await baueBacktestFundamental(trades);
  return <BacktestFundamental bild={bild} ergebnisLabel={KREUZ_LABEL} />;
}

/* ----------------------------------------------------------------- Auswerten */

/**
 * Analyse-Modus: Kennzahlen, R-Kurve, Aufschlüsselungen und die daraus
 * abgeleiteten Hinweise. Kein Eingabefeld - hier wird gelesen, nicht erfasst.
 */
function AuswertungsAnsicht({
  session, trades, stats, kategorien,
}: {
  session: Session;
  trades: Trade[];
  stats: ReturnType<typeof computeNativeBacktestStats>;
  kategorien: {
    gvaTyp: Kategorie | null; confluence: Kategorie | null;
    anmerkung: Kategorie | null; skipGrund: Kategorie | null;
  };
}) {
  const breakdownData = Object.fromEntries(
    BREAKDOWN_DIMENSIONS.map((d) => [d, computeBreakdown(trades, d)]),
  ) as Record<BreakdownDimension, BreakdownRow[]>;
  // Dieselben Gruppen, aber nur über die Stopouts - beantwortet die Frage,
  // was in den Verlust-Trades immer wieder auftaucht.
  const slBreakdown = Object.fromEntries(
    BREAKDOWN_DIMENSIONS.map((d) => [d, computeBreakdown(trades, d, true)]),
  ) as Record<BreakdownDimension, BreakdownRow[]>;
  const insights = computeInsights(trades, stats);
  const equity = computeEquityKurve(trades);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">
          Auswertung <span className="font-medium text-ink">{session.pair}</span>
          {session.status === "abgeschlossen" && " · abgeschlossen"}
        </span>
        {session.status === "aktiv" && (
          <Link href={`/trading/backtest?session=${session.id}&ansicht=eintragen`}
            className="text-xs text-accent-soft hover:underline">
            ← Zurück zum Eintragen
          </Link>
        )}
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Trades" value={stats.total} sub={`${stats.skips} davon Skip`} />
          <Stat label="Gewertet" value={stats.gewertet} />
          <Stat label="Winrate"
            value={stats.winrate === null ? "—" : `${stats.winrate.toFixed(0)} %`} />
          <Stat label="Profit Factor"
            tone={stats.profitFactor !== null && stats.profitFactor >= 1.5 ? "good" : "neutral"}
            value={stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)} />
          <Stat label="Expectancy"
            tone={stats.expectancy !== null && stats.expectancy > 0 ? "good" : "neutral"}
            value={stats.expectancy === null ? "—" : `${stats.expectancy.toFixed(2)} R`}
            sub="Ø pro Trade" />
          <Stat label="Gesamt R"
            tone={stats.gesamtR > 0 ? "good" : stats.gesamtR < 0 ? "bad" : "neutral"}
            value={`${stats.gesamtR > 0 ? "+" : ""}${stats.gesamtR.toFixed(2)}`} />
        </div>
      </Card>

      <Card>
        <CardTitle>R-Kurve</CardTitle>
        <BacktestEquity punkte={equity} />
      </Card>

      <Card>
        <CardTitle>Was die Zahlen sagen</CardTitle>
        <BacktestInsights insights={insights} />
      </Card>

      <Card>
        <CardTitle>Aufschlüsselung</CardTitle>
        <BacktestBreakdown data={breakdownData} slData={slBreakdown} />
      </Card>

      {/* Eigener Suspense-Rahmen: die Fundamentaldaten kommen aus einer
          zweiten Datenbank und brauchen für mehrere Jahre spürbar Zeit. Ohne
          die Grenze hier würde die ganze Auswertung darauf warten, obwohl
          Kennzahlen, R-Kurve und Aufschlüsselung längst da sind. */}
      <Suspense fallback={
        <Card>
          <CardTitle>Fundamentale Lage</CardTitle>
          <div className="py-6 text-center text-sm text-ink-muted">
            Zinsen, Inflation, COT und Marktdaten für {trades.length} Handelstage …
          </div>
        </Card>
      }>
        <FundamentalBlock trades={trades} />
      </Suspense>

      <Card>
        <CardTitle>Alle Trades ({trades.length})</CardTitle>
        <BacktestTradeListe trades={trades} kategorien={kategorien} />
      </Card>
    </>
  );
}
