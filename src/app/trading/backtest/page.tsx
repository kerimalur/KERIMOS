import Link from "next/link";
import {
  fetchBacktestCategories, fetchNativeBacktestTrades, fetchBacktestSessions,
} from "@/lib/supabase/backtest";
import { tradingConfigured } from "@/lib/supabase/trading";
import {
  computeNativeBacktestStats, computeBreakdown, RESULT_LABEL,
  BREAKDOWN_DIMENSIONS, type BreakdownDimension, type BreakdownRow,
} from "@/lib/backtest-types";
import {
  addBacktestTrade, deleteBacktestTrade, addBacktestTag,
  renameBacktestTag, archiveBacktestTag, reaktiviereBacktestTag,
  startBacktestSession, closeBacktestSession, reaktiviereBacktestSession,
} from "@/lib/backtest-actions";
import { BacktestResultField } from "@/components/backtest-result-field";
import { BacktestBreakdown } from "@/components/backtest-breakdown";
import { Card, CardTitle, Stat, Badge, Empty, Input, Select, Label, Button } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { heuteISO } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function BacktestPage() {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Backtest-Journal</CardTitle>
        <p className="text-sm text-ink-muted">Trading-Datenbank nicht verbunden.</p>
      </Card>
    );
  }

  const [categories, trades, sessions] = await Promise.all([
    fetchBacktestCategories(false),
    fetchNativeBacktestTrades(),
    fetchBacktestSessions(),
  ]);
  const categoriesAlle = await fetchBacktestCategories(true); // inkl. archivierte, für die Verwaltung

  const stats = computeNativeBacktestStats(trades);
  const breakdownData = Object.fromEntries(
    BREAKDOWN_DIMENSIONS.map((d) => [d, computeBreakdown(trades, d)]),
  ) as Record<BreakdownDimension, BreakdownRow[]>;

  const gvaTyp = categories.find((c) => c.key === "gva_typ") ?? null;
  const confluence = categories.find((c) => c.key === "confluence") ?? null;
  const anmerkung = categories.find((c) => c.key === "anmerkung") ?? null;
  const skipGrund = categories.find((c) => c.key === "skip_grund") ?? null;

  const aktiveSessions = sessions.filter((s) => s.status === "aktiv");
  const abgeschlosseneSessions = sessions.filter((s) => s.status === "abgeschlossen");
  const tradesProSession = new Map<string, typeof trades>();
  for (const t of trades) {
    if (!t.session_id) continue;
    const liste = tradesProSession.get(t.session_id) ?? [];
    liste.push(t);
    tradesProSession.set(t.session_id, liste);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Backtest-Journal</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Ersetzt das Google Sheet - Trades direkt hier erfassen, Kategorien
          unten selbst pflegen.{" "}
          <Link href="/trading" className="text-accent-soft hover:underline">
            Zurück zu Trading ↗
          </Link>
        </p>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Trades gewertet" value={stats.gewertet} sub={`${stats.skips} Skips`} />
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
          <Stat label="Trades total" value={stats.total} />
        </div>
      </Card>

      <Card>
        <CardTitle>Auswertung</CardTitle>
        <BacktestBreakdown data={breakdownData} />
      </Card>

      <Card>
        <CardTitle>Sessions</CardTitle>
        <p className="mb-4 text-xs text-ink-muted">
          Eine Session bindet ein Pair fest, damit du es nicht bei jedem
          Trade neu eintippen musst. Abschliessen = auswerten und pausieren,
          jederzeit wieder aktivierbar, um weiterzumachen.
        </p>

        {sessions.length === 0 ? (
          <Empty>Noch keine Session gestartet.</Empty>
        ) : (
          <ul className="mb-4 space-y-1.5">
            {[...aktiveSessions, ...abgeschlosseneSessions].map((s) => {
              const sTrades = tradesProSession.get(s.id) ?? [];
              const sStats = computeNativeBacktestStats(sTrades);
              return (
                <li key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-sand/60 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{s.pair}</span>
                  <Badge tone={s.status === "aktiv" ? "good" : "neutral"}>
                    {s.status === "aktiv" ? "aktiv" : "abgeschlossen"}
                  </Badge>
                  <span className="tabular text-xs text-ink-soft">
                    {sStats.gewertet} gewertet
                    {sStats.skips > 0 && ` · ${sStats.skips} Skip`}
                    {sStats.winrate !== null && ` · ${sStats.winrate.toFixed(0)} % WR`}
                    {` · ${sStats.gesamtR > 0 ? "+" : ""}${sStats.gesamtR.toFixed(2)} R`}
                  </span>
                  <span className="ml-auto">
                    {s.status === "aktiv" ? (
                      <form action={closeBacktestSession}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs text-ink-faint transition hover:text-accent-soft">
                          abschliessen
                        </button>
                      </form>
                    ) : (
                      <form action={reaktiviereBacktestSession}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs text-accent-soft hover:underline">
                          weiterführen
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

      <Card>
        <CardTitle>Neuer Trade</CardTitle>
        {aktiveSessions.length === 0 ? (
          <Empty>Erst eine Session starten, dann lassen sich hier Trades erfassen.</Empty>
        ) : (
        <form action={addBacktestTrade} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="occurred_on">Datum</Label>
              <Input id="occurred_on" type="date" name="occurred_on" defaultValue={heuteISO()} required />
            </div>
            <div>
              <Label htmlFor="session_id">Session</Label>
              <Select id="session_id" name="session_id" required defaultValue="">
                <option value="" disabled>— wählen —</option>
                {aktiveSessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.pair}</option>
                ))}
              </Select>
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

          {confluence && (
            <div>
              <Label>Confluence (mehrfach möglich)</Label>
              <div className="flex flex-wrap gap-2">
                {confluence.tags.map((t) => (
                  <label key={t.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line
                      bg-sand px-2.5 py-1 text-xs text-ink-soft transition
                      has-[:checked]:border-accent/50 has-[:checked]:bg-accent-tint has-[:checked]:text-accent-soft">
                    <input type="checkbox" name="confluence" value={t.id} className="accent-accent" />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {anmerkung && (
            <div>
              <Label>Anmerkung (mehrfach möglich)</Label>
              <div className="flex flex-wrap gap-2">
                {anmerkung.tags.map((t) => (
                  <label key={t.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line
                      bg-sand px-2.5 py-1 text-xs text-ink-soft transition
                      has-[:checked]:border-accent/50 has-[:checked]:bg-accent-tint has-[:checked]:text-accent-soft">
                    <input type="checkbox" name="anmerkung" value={t.id} className="accent-accent" />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          )}

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
        )}
      </Card>

      <Card>
        <CardTitle>Trades ({trades.length})</CardTitle>
        {trades.length === 0 ? (
          <Empty>Noch keine Trades erfasst.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {trades.map((t) => (
              <li key={t.id}
                className="rounded-lg bg-sand/60 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular text-xs text-ink-muted">{dateLabel(t.occurred_on)}</span>
                  <span className="font-medium text-ink">{t.pair}</span>
                  <Badge tone={t.direction === "long" ? "good" : "bad"}>
                    {t.direction === "long" ? "Long" : "Short"}
                  </Badge>
                  <Badge tone={t.result === "skip" ? "neutral" : t.r_multiple && t.r_multiple > 0 ? "good" : t.r_multiple && t.r_multiple < 0 ? "bad" : "neutral"}>
                    {RESULT_LABEL[t.result]}
                  </Badge>
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
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Kategorien verwalten</CardTitle>
        <p className="mb-4 text-xs text-ink-muted">
          Tags lassen sich hier hinzufügen, umbenennen und archivieren - ohne
          Code-Änderung. Archivierte Tags verschwinden nur aus dem Formular
          oben, bestehende Trades behalten sie.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {categoriesAlle.map((cat) => {
            const aktive = cat.tags.filter((t) => !t.archived);
            const archiviert = cat.tags.filter((t) => t.archived);
            return (
              <div key={cat.id}>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {cat.label}
                </div>
                <ul className="mb-2 space-y-1.5">
                  {aktive.map((t) => (
                    <li key={t.id} className="flex items-center gap-1.5">
                      <form action={renameBacktestTag} className="flex flex-1 items-center gap-1.5">
                        <input type="hidden" name="id" value={t.id} />
                        <Input name="label" defaultValue={t.label} className="h-8 py-1 text-xs" />
                        <button type="submit" className="text-xs text-ink-faint transition hover:text-accent-soft">
                          speichern
                        </button>
                      </form>
                      <form action={archiveBacktestTag}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-ink-faint transition hover:text-bad">
                          archivieren
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={addBacktestTag} className="flex items-center gap-1.5">
                  <input type="hidden" name="category_id" value={cat.id} />
                  <Input name="label" placeholder="Neuer Tag" className="h-8 flex-1 py-1 text-xs" />
                  <Button type="submit" variant="ghost" className="h-8 px-2.5 py-1 text-xs">+</Button>
                </form>
                {archiviert.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-ink-faint">
                      {archiviert.length} archiviert
                    </summary>
                    <ul className="mt-1.5 space-y-1">
                      {archiviert.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-1.5 text-xs text-ink-faint">
                          <span>{t.label}</span>
                          <form action={reaktiviereBacktestTag}>
                            <input type="hidden" name="id" value={t.id} />
                            <button className="text-accent-soft hover:underline">reaktivieren</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
