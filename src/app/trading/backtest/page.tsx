import Link from "next/link";
import {
  fetchBacktestCategories, fetchNativeBacktestTrades, fetchBacktestSessions,
} from "@/lib/supabase/backtest";
import { tradingConfigured } from "@/lib/supabase/trading";
import {
  computeNativeBacktestStats, computeBreakdown, computeInsights, computeEquityKurve,
  RESULT_LABEL, BREAKDOWN_DIMENSIONS,
  type BreakdownDimension, type BreakdownRow,
} from "@/lib/backtest-types";
import {
  addBacktestTrade, deleteBacktestTrade,
  startBacktestSession, closeBacktestSession, reaktiviereBacktestSession,
} from "@/lib/backtest-actions";
import { BacktestResultField } from "@/components/backtest-result-field";
import { BacktestBreakdown } from "@/components/backtest-breakdown";
import { BacktestInsights } from "@/components/backtest-insights";
import { BacktestEquity } from "@/components/backtest-equity";
import { Card, CardTitle, Stat, Badge, Empty, Input, Select, Label, Button, cx } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { heuteISO } from "@/lib/time";

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
  const [categories, allTrades, sessions] = await Promise.all([
    fetchBacktestCategories(false),
    fetchNativeBacktestTrades(),
    fetchBacktestSessions(),
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

  const gvaTyp = categories.find((c) => c.key === "gva_typ") ?? null;
  const confluence = categories.find((c) => c.key === "confluence") ?? null;
  const anmerkung = categories.find((c) => c.key === "anmerkung") ?? null;
  const skipGrund = categories.find((c) => c.key === "skip_grund") ?? null;

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
        <AuswertungsAnsicht session={currentSession} trades={trades} stats={stats} />
      ) : (
        <EintragenAnsicht
          session={currentSession} trades={trades}
          gvaTyp={gvaTyp} confluence={confluence} anmerkung={anmerkung} skipGrund={skipGrund}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Eintragen */

type Kategorie = Awaited<ReturnType<typeof fetchBacktestCategories>>[number];
type Trade = Awaited<ReturnType<typeof fetchNativeBacktestTrades>>[number];
type Session = Awaited<ReturnType<typeof fetchBacktestSessions>>[number];

/**
 * Reiner Erfassungs-Modus: Formular und die Liste der schon eingetragenen
 * Trades, sonst nichts. Bewusst ohne Kennzahlen - wer gerade 20 Setups
 * durchspielt, soll nicht nach jedem Trade auf eine wackelnde Winrate
 * schauen und sich davon beeinflussen lassen.
 */
function EintragenAnsicht({
  session, trades, gvaTyp, confluence, anmerkung, skipGrund,
}: {
  session: Session;
  trades: Trade[];
  gvaTyp: Kategorie | null;
  confluence: Kategorie | null;
  anmerkung: Kategorie | null;
  skipGrund: Kategorie | null;
}) {
  return (
    <>
      <Card>
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Neuer Trade · {session.pair}</CardTitle>
          <Link href={`/trading/backtest?session=${session.id}&ansicht=auswerten`}
            className="text-xs text-accent-soft hover:underline">
            Auswertung ansehen ↗
          </Link>
        </div>

        <form action={addBacktestTrade} className="space-y-4">
          <input type="hidden" name="session_id" value={session.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="occurred_on">Datum</Label>
              <Input id="occurred_on" type="date" name="occurred_on" defaultValue={heuteISO()} required />
            </div>
            <div>
              <Label htmlFor="direction">Richtung</Label>
              <Select id="direction" name="direction" required defaultValue="">
                <option value="" disabled>— wählen —</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </Select>
            </div>
          </div>

          {gvaTyp && (
            <div>
              <Label htmlFor="gva_typ_select">GVA-Typ</Label>
              <Select id="gva_typ_select" name="gva_typ" defaultValue="">
                <option value="">— keine Angabe —</option>
                {gvaTyp.tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </Select>
            </div>
          )}

          <BacktestResultField skipGrund={skipGrund} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rr_geplant">RR geplant</Label>
              <Input id="rr_geplant" name="rr_geplant" type="number" step="0.01" placeholder="z. B. 3.00" />
            </div>
            <div>
              <Label htmlFor="r_multiple">R erreicht</Label>
              <Input id="r_multiple" name="r_multiple" type="number" step="0.01" placeholder="z. B. 2.15" />
            </div>
          </div>

          <TagFeld kategorie={confluence} name="confluence" label="Confluence (mehrfach möglich)" />
          <TagFeld kategorie={anmerkung} name="anmerkung" label="Anmerkung (mehrfach möglich)" />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tradingview_link">TradingView-Link (optional)</Label>
              <Input id="tradingview_link" name="tradingview_link" placeholder="https://..." />
            </div>
            <div>
              <Label htmlFor="screenshot_url">Screenshot-URL (optional)</Label>
              <Input id="screenshot_url" name="screenshot_url" placeholder="https://..." />
            </div>
          </div>
          <div>
            <Label htmlFor="notiz">Notiz (frei)</Label>
            <Input id="notiz" name="notiz" placeholder="Freitext" />
          </div>

          <Button type="submit">Trade speichern</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Eingetragen ({trades.length})</CardTitle>
        {trades.length === 0 ? (
          <Empty>Noch keine Trades in dieser Session.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {trades.map((t) => <TradeZeile key={t.id} t={t} />)}
          </ul>
        )}
      </Card>
    </>
  );
}

function TagFeld({
  kategorie, name, label,
}: { kategorie: Kategorie | null; name: string; label: string }) {
  if (!kategorie) return null;
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {kategorie.tags.map((t) => (
          <label key={t.id}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line
              bg-sand px-2.5 py-1 text-xs text-ink-soft transition
              has-[:checked]:border-accent/50 has-[:checked]:bg-accent-tint has-[:checked]:text-accent-soft">
            <input type="checkbox" name={name} value={t.id} className="accent-accent" />
            {t.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function TradeZeile({ t }: { t: Trade }) {
  const tone = t.result === "skip" ? "neutral"
    : t.r_multiple && t.r_multiple > 0 ? "good"
      : t.r_multiple && t.r_multiple < 0 ? "bad" : "neutral";

  return (
    <li className="rounded-lg bg-sand/60 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-xs text-ink-muted">{dateLabel(t.occurred_on)}</span>
        <Badge tone={t.direction === "long" ? "good" : "bad"}>
          {t.direction === "long" ? "Long" : "Short"}
        </Badge>
        <Badge tone={tone}>{RESULT_LABEL[t.result]}</Badge>
        {t.r_multiple !== null && (
          <span className="tabular text-xs text-ink-soft">
            {t.r_multiple > 0 ? "+" : ""}{t.r_multiple.toFixed(2)} R
          </span>
        )}
        <form action={deleteBacktestTrade} className="ml-auto">
          <input type="hidden" name="id" value={t.id} />
          <button className="text-xs text-ink-faint transition hover:text-bad">löschen</button>
        </form>
      </div>
      {t.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {t.tags.map((tg) => (
            <span key={tg.tagId} className="rounded bg-card px-1.5 py-0.5 text-[11px] text-ink-muted">
              {tg.label}
            </span>
          ))}
        </div>
      )}
      {t.notiz && <p className="mt-1.5 text-xs text-ink-muted">{t.notiz}</p>}
    </li>
  );
}

/* ----------------------------------------------------------------- Auswerten */

/**
 * Analyse-Modus: Kennzahlen, R-Kurve, Aufschlüsselungen und die daraus
 * abgeleiteten Hinweise. Kein Eingabefeld - hier wird gelesen, nicht erfasst.
 */
function AuswertungsAnsicht({
  session, trades, stats,
}: {
  session: Session;
  trades: Trade[];
  stats: ReturnType<typeof computeNativeBacktestStats>;
}) {
  const breakdownData = Object.fromEntries(
    BREAKDOWN_DIMENSIONS.map((d) => [d, computeBreakdown(trades, d)]),
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
        <BacktestBreakdown data={breakdownData} />
      </Card>

      <Card>
        <CardTitle>Alle Trades ({trades.length})</CardTitle>
        {trades.length === 0 ? (
          <Empty>Keine Trades in dieser Session.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {trades.map((t) => <TradeZeile key={t.id} t={t} />)}
          </ul>
        )}
      </Card>
    </>
  );
}
