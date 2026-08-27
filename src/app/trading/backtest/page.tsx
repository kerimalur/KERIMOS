import Link from "next/link";
import { Suspense } from "react";
import {
  fetchBacktestCategories, fetchNativeBacktestTrades, fetchBacktestSessions,
  fetchChecklist,
} from "@/lib/supabase/backtest";
import { tradingConfigured } from "@/lib/supabase/trading";
import {
  computeNativeBacktestStats, computeBreakdown, computeInsights, computeEquityKurve,
  rVerteilung, drawdownKurve, maxDrawdown, serien, R_FAKTOR_STANDARD,
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
import { BacktestZeitstrahl } from "@/components/backtest-zeitstrahl";
import { BacktestVerluste } from "@/components/backtest-verluste";
import { RVerteilung, DrawdownFlaeche } from "@/components/backtest-bilder";
import { BacktestExport } from "@/components/backtest-export";
import { baueBacktestFundamental, KREUZ_LABEL } from "@/lib/confluence/backtest-bilanz";
import { baueZeitstrahl } from "@/lib/confluence/zeitstrahl";
import { dimensionenAus, DIM_ALLE, DIM_LABEL, type DimKey } from "@/lib/confluence/auswertung";
import { FENSTER, type Fenster } from "@/lib/confluence/saison";
import { SYNTH } from "@/lib/confluence/cot-synth";

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
          kategorien={kategorien} sp={sp} />
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
async function FundamentalBlock({ trades, dims, saisonFenster }: {
  trades: Trade[]; dims: DimKey[]; saisonFenster: Fenster;
}) {
  if (!tradingConfigured()) return null;
  const bild = await baueBacktestFundamental(trades, { dims, saisonFenster });
  return <BacktestFundamental bild={bild} ergebnisLabel={KREUZ_LABEL} />;
}

/**
 * Dieselbe Lage, nur als Verlauf statt als Tabelle.
 *
 * Bekommt bewusst ALLE Trades der Session, auch wenn oben ein Jahr gewählt
 * ist: eine Linie, die am 1. Januar anfängt, hat keinen Verlauf. Das gewählte
 * Jahr bestimmt stattdessen den Ausschnitt, in dem der Zeitstrahl aufgeht.
 */
async function ZeitstrahlBlock({ trades, saisonFenster, fokusJahr }: {
  trades: Trade[]; saisonFenster: Fenster; fokusJahr: string | null;
}) {
  if (!tradingConfigured()) return null;
  const bild = await baueZeitstrahl(trades, { saisonFenster });
  // key am Jahr: der Ausschnitt steckt im Zustand der Client-Komponente, und
  // ohne Neuaufbau bliebe er beim Umschalten des Jahres stehen.
  return (
    <BacktestZeitstrahl key={fokusJahr ?? "alle"} bild={bild} trades={trades}
      fokusJahr={fokusJahr} />
  );
}

/* ------------------------------------------------------------ Abschnitte */

const TEILE = [
  { key: "zahlen", label: "Zahlen & Kurven" },
  { key: "fundamental", label: "Fundamental" },
  { key: "verluste", label: "Verluste" },
  { key: "trades", label: "Alle Trades" },
  { key: "export", label: "Export" },
] as const;

type TeilKey = (typeof TEILE)[number]["key"];

/* ----------------------------------------------------------------- Auswerten */

/**
 * Analyse-Modus: Kennzahlen, R-Kurve, Aufschlüsselungen und die daraus
 * abgeleiteten Hinweise. Kein Eingabefeld - hier wird gelesen, nicht erfasst.
 */
function AuswertungsAnsicht({
  session, trades: alleTrades, kategorien, sp,
}: {
  session: Session;
  trades: Trade[];
  stats: ReturnType<typeof computeNativeBacktestStats>;
  kategorien: {
    gvaTyp: Kategorie | null; confluence: Kategorie | null;
    anmerkung: Kategorie | null; skipGrund: Kategorie | null;
  };
  sp: Record<string, string | undefined>;
}) {
  const teil: TeilKey = (TEILE.find((t) => t.key === sp.teil)?.key ?? "zahlen");
  const dims = dimensionenAus(sp.dim ?? null);
  const saisonFenster: Fenster =
    FENSTER.find((f) => String(f) === sp.saisonjahre) ?? 20;
  // Die Tabellensicht ist zu, bis jemand sie aufmacht — sonst steht das Bild
  // wieder unter drei Bildschirmen Zahlen.
  const zeigeZahlen = sp.zahlen === "1";

  // Jahresfilter: gilt für ALLE Abschnitte, damit man nicht in einem Teil ein
  // Jahr wählt und im nächsten unbemerkt wieder alle sieht.
  const jahre = [...new Set(alleTrades.map((t) => t.occurred_on.slice(0, 4)))].sort();
  const jahr = jahre.includes(sp.jahr ?? "") ? sp.jahr! : null;
  const trades = jahr ? alleTrades.filter((t) => t.occurred_on.startsWith(jahr)) : alleTrades;
  const stats = computeNativeBacktestStats(trades);

  /** Adresse mit geänderten Parametern — der Rest bleibt stehen. */
  const link = (aenderung: Record<string, string | null>) => {
    const p = new URLSearchParams({ session: session.id, ansicht: "auswerten" });
    for (const [k, v] of Object.entries({
      teil, jahr, dim: sp.dim ?? null, saisonjahre: sp.saisonjahre ?? null,
      zahlen: sp.zahlen ?? null, ...aenderung,
    })) {
      if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
    }
    return `/trading/backtest?${p.toString()}`;
  };

  const dimUm = (k: DimKey) => {
    const neu = dims.includes(k) ? dims.filter((d) => d !== k) : [...dims, k];
    // Leere Auswahl wird als leerer String übergeben, damit sie NICHT als
    // "nichts gewählt, nimm den Standard" durchgeht.
    return link({ dim: neu.length > 0 ? neu.join(",") : "-", teil: "fundamental" });
  };

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
  const dd = drawdownKurve(trades);
  const tiefe = maxDrawdown(dd);
  const serie = serien(trades);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">
          Auswertung <span className="font-medium text-ink">{session.pair}</span>
          {session.status === "abgeschlossen" && " · abgeschlossen"}
          {jahr && <span className="text-ink-faint"> · nur {jahr}</span>}
        </span>
        {session.status === "aktiv" && (
          <Link href={`/trading/backtest?session=${session.id}&ansicht=eintragen`}
            className="text-xs text-accent-soft hover:underline">
            ← Zurück zum Eintragen
          </Link>
        )}
      </div>

      {/* Abschnitte statt eine lange Rolle: was man gerade nicht ansieht,
          soll auch nicht scrollen. */}
      <nav className="flex flex-wrap gap-1.5">
        {TEILE.map((t) => (
          <Link key={t.key} href={link({ teil: t.key })}
            className={cx(
              "rounded-xl px-3.5 py-1.5 text-sm transition duration-150 ease-tactile active:scale-95",
              teil === t.key
                ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                : "border border-line bg-sand text-ink-muted hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {jahre.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-faint">Zeitraum</span>
          <Link href={link({ jahr: null })}
            className={cx("rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
              jahr === null ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
            alle
          </Link>
          {jahre.map((j) => (
            <Link key={j} href={link({ jahr: j })}
              className={cx("num rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
                jahr === j ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
              {j}
            </Link>
          ))}
        </div>
      )}

      {trades.length === 0 ? (
        <Card><Empty>Für {jahr} gibt es in dieser Session keine Trades.</Empty></Card>
      ) : teil === "zahlen" ? (
        <>
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
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Stat label="Grösster Rückschlag" tone={tiefe.tiefe > 0 ? "bad" : "neutral"}
                value={`−${tiefe.tiefe.toFixed(2)} R`}
                sub={tiefe.datum ? `Tiefpunkt ${tiefe.datum}` : "kein Rückschlag"} />
              <Stat label="Längste Gewinnserie" value={serie.laengsteGewinne} sub="in Folge" />
              <Stat label="Längste Verlustserie" value={serie.laengsteVerluste} sub="in Folge" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              <strong>Woher das R kommt:</strong> es wird aus Ergebnis und geplantem RR
              gerechnet, nicht am Chart abgelesen — Full TP ergibt {R_FAKTOR_STANDARD.full_tp} × RR,
              Teil-TP-dann-BE {R_FAKTOR_STANDARD.teil_tp_be} × RR, ein Stop kostet immer genau 1 R.
              Das hat zwei Folgen, die man beim Lesen kennen muss.
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
              Erstens sind <strong>Trefferquote und Ø R nicht unabhängig</strong>: beide kommen aus
              denselben Ergebnis-Zählungen. Ein Unterschied im Ø R ist keine zweite Bestätigung,
              sondern dieselbe Zahl von der anderen Seite. Zweitens ist ein Stop mit genau −1 R{" "}
              <strong>systematisch zu günstig</strong> — Spread, Slippage und Kurslücken kosten
              in Wirklichkeit mehr, und zwar immer in dieselbe Richtung.
            </p>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardTitle>R-Kurve</CardTitle>
              <BacktestEquity punkte={equity} />
              <p className="mt-2 text-[11px] text-ink-faint">
                Wohin du gekommen bist — kumuliert über alle gewerteten Trades.
              </p>
            </Card>
            <Card>
              <CardTitle>Rückschlag</CardTitle>
              <DrawdownFlaeche punkte={dd} />
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                Abstand zum eigenen Höchststand. Eine Summe von +30 R nützt nichts,
                wenn man dafür zwischendurch zweistellig im Minus sass.
              </p>
            </Card>
          </div>

          <Card>
            <CardTitle>Wie die Summe zustande kam</CardTitle>
            <RVerteilung balken={rVerteilung(trades)} />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Zwei Backtests mit identischer Endsumme können völlig verschieden aussehen —
              einer aus vielen kleinen Gewinnen, einer aus drei Ausreissern. Nur das Zweite
              ist zerbrechlich, und nur hier sieht man es.
            </p>
          </Card>

          <Card>
            <CardTitle>Was die Zahlen sagen</CardTitle>
            <BacktestInsights insights={insights} />
          </Card>
        </>
      ) : teil === "fundamental" ? (
        <>
          <Card>
            <CardTitle>Saisonalität — über wie viele Jahre?</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              {FENSTER.map((f) => (
                <Link key={f} href={link({ saisonjahre: String(f) })}
                  className={cx("num rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
                    saisonFenster === f ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
                  {f} J
                </Link>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Drei Spuren, mehr nicht: Commercials gegen Retail, Saisonalität und der
              Confluence-Score. Jede für sich, jede mit ihrem eigenen Befund darunter.
              Die Kurse fürs Saison-Fenster reichen rund 20 Jahre zurück; deshalb gibt es
              hier kein 25-Jahre-Fenster.
            </p>
          </Card>

          <Suspense key={`zeit-${saisonFenster}`} fallback={
            <Card>
              <CardTitle>Zeitstrahl</CardTitle>
              <div className="py-10 text-center text-sm text-ink-muted">
                COT über {SYNTH.wochen} Wochen, Kurse und Zinsen für {alleTrades.length} Trades …
              </div>
            </Card>
          }>
            <ZeitstrahlBlock trades={alleTrades} saisonFenster={saisonFenster}
              fokusJahr={jahr} />
          </Suspense>

          <Card>
            <CardTitle>Die Zahlen dazu</CardTitle>
            <Link href={link({ zahlen: zeigeZahlen ? null : "1" })}
              className="float-right ml-4 text-xs text-accent-soft hover:underline">
              {zeigeZahlen ? "ausblenden" : "einblenden"}
            </Link>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Kreuztabellen, Faktor-Bilanz und Intervalle — dieselbe Rechnung, nur
              ausgeschrieben. Standardmässig zu: das Bild oben stellt die Frage,
              und wer sie schon beantwortet hat, braucht die Tabellen nicht.
            </p>
          </Card>

          {zeigeZahlen && (
            <>
              <Card>
                <CardTitle>Was soll ausgewertet werden?</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  {DIM_ALLE.map((k) => (
                    <Link key={k} href={dimUm(k)}
                      className={cx(
                        "rounded-xl border px-3 py-1.5 text-xs transition duration-150 ease-tactile active:scale-95",
                        dims.includes(k)
                          ? "border-accent/60 bg-accent-tint text-ink"
                          : "border-line bg-sand text-ink-muted hover:text-ink")}>
                      {dims.includes(k) ? "✓ " : ""}{DIM_LABEL[k]}
                    </Link>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                  Veto und Confluence-Score sind bewusst aus. Wer alles gleichzeitig einschaltet,
                  findet garantiert irgendwo einen Ausschlag — vier Dimensionen über vier
                  Ergebnisklassen sind sechzehn Zahlen, und ein paar davon sind immer auffällig.
                </p>
              </Card>

              <Suspense key={`${dims.join()}-${saisonFenster}-${jahr}`} fallback={
                <Card>
                  <CardTitle>Fundamentale Auswertung</CardTitle>
                  <div className="py-6 text-center text-sm text-ink-muted">
                    Zinsen, COT, Kurse für {trades.length} Handelstage …
                  </div>
                </Card>
              }>
                <FundamentalBlock trades={trades} dims={dims} saisonFenster={saisonFenster} />
              </Suspense>
            </>
          )}
        </>
      ) : teil === "verluste" ? (
        <>
          <Card>
            <CardTitle>Was nicht durchgelaufen ist</CardTitle>
            <BacktestVerluste trades={trades} />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Charts nebeneinander statt Zeilen untereinander: Muster im Bild —
              immer derselbe Punkt der Bewegung, immer dieselbe Kerzenform — sieht
              keine Statistik. Klick vergrössert, die Pfeiltasten blättern weiter.
            </p>
          </Card>

          <Card>
            <CardTitle>Woran die Verluste hingen</CardTitle>
            <BacktestBreakdown data={slBreakdown} slData={slBreakdown} />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Dieselben Gruppen wie in der Aufschlüsselung, aber nur über die Stopouts.
              Die Frage lautet nicht „welche Gruppe hat viele SL" — grosse Gruppen haben
              immer viele — sondern <strong>welche hat anteilig mehr</strong>, als ihre Grösse
              erwarten liesse.
            </p>
          </Card>
        </>
      ) : teil === "export" ? (
        <Card>
          <CardTitle>Trades nach TradingView</CardTitle>
          <BacktestExport paar={session.pair}
            trades={trades.map((t) => ({
              datum: t.occurred_on.slice(0, 10),
              paar: t.pair,
              richtung: (t.direction === "short" ? -1 : 1) as -1 | 1,
              ergebnis: t.result,
              r: t.r_multiple ?? 0,
            }))} />
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle>Aufschlüsselung</CardTitle>
            <BacktestBreakdown data={breakdownData} slData={slBreakdown} />
          </Card>
          <Card>
            <CardTitle>Alle Trades ({trades.length})</CardTitle>
            <BacktestTradeListe trades={trades} kategorien={kategorien} />
          </Card>
        </>
      )}
    </>
  );
}
