import Link from "next/link";
import {
  ladeKontoKette, fetchStrategien, fetchKonfluenzen, computeJournalStats,
  signiertesR, rechnungFuer, SETUPS, PAARE, tradingUserId,
  type Trade, type Verlauf,
} from "@/lib/trading/journal";
import { tradingConfigured, fetchWatchlistPaar } from "@/lib/supabase/trading";
import { tradeLoeschen } from "@/lib/journal-actions";
import { JournalHinweis } from "@/components/journal-hinweis";
import { TradeForm } from "@/components/trade-form";
import { duplikatText, PIP_TOLERANZ } from "@/lib/trading/duplikat";
import { konfluenzListe } from "@/lib/trading/konfluenzen";
import { ScreenshotFeld } from "@/components/trading/screenshot-feld";
import { TradeBearbeiten } from "@/components/trading/trade-journal-dialog";
import {
  werteFragenAus, frageFuer, labelFuer, LEARNING_KEY, MIN_JE_ANTWORT,
} from "@/lib/trading/journal-fragen";
import { URTEIL_LABEL } from "@/lib/trading/lage-snapshot";
import { Card, CardTitle, Stat, Badge, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Trade-Liste mit Filter und Erfassung.
 *
 * Umgezogen aus dem GVA-Screener (`/journal`), siehe TRADING-UMBAU.md.
 *
 * Seit 21.08.2026 stehen hier NUR Live-Trades. Backtest-Trades gehören in den
 * Backtest — im Journal nebeneinander sahen sie gleich aus, kosteten aber
 * nicht dasselbe, und jede gemeinsame Kennzahl war damit eine Mischung aus
 * echtem und durchgespieltem Geld.
 *
 * Der Filter läuft über die Adresszeile (`?paar=EURUSD`) und nicht
 * über einen Zustand im Browser. Das kostet einen Server-Aufruf pro Klick und
 * bringt dafür: einen teilbaren Link, einen funktionierenden Zurück-Knopf und
 * eine Seite, die nach dem Neuladen noch dasselbe zeigt.
 */

function FilterChip({
  aktiv, href, children,
}: { aktiv: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={href}
      className={aktiv
        ? "rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-ink-on shadow-glow-accent"
        : "rounded-xl bg-sand px-3 py-1.5 text-sm text-ink-muted transition hover:text-ink-soft"}>
      {children}
    </Link>
  );
}

function TradeZeile({ t, verlauf, konfluenzen, offen, bildfehler }: {
  t: Trade;
  verlauf: Verlauf;
  konfluenzen: readonly string[];
  /** Dialog direkt offen — nach einem Bild-Upload (`?bearbeiten=<id>`). */
  offen: boolean;
  bildfehler: string | null;
}) {
  const r = signiertesR(t);
  const setups = SETUPS.filter((s) => t.setups[s.key]);
  const rechnung = rechnungFuer(verlauf, t.id);
  const lage = t.fundamentalSnapshot?.ranking.urteil;
  const learning = t.antworten[LEARNING_KEY];

  return (
    <div className="border-t border-line/70 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="tabular w-[72px] shrink-0 text-xs text-ink-faint">
          {t.date.slice(8, 10)}.{t.date.slice(5, 7)}.{t.date.slice(2, 4)}
        </span>
        <span className="w-[76px] shrink-0 font-display text-sm font-bold text-ink">
          {t.pair}
        </span>
        <Badge tone={t.direction === "long" ? "good" : "bad"}>
          {t.direction === "long" ? "Long" : "Short"}
        </Badge>
        {t.status === "open" && <Badge tone="warn">läuft</Badge>}

        <span className={`tabular ml-auto text-sm font-medium ${
          r > 0 ? "text-good-bright" : r < 0 ? "text-bad-bright" : "text-ink-muted"
        }`}>
          {r >= 0 ? "+" : ""}{r.toFixed(1)} R
        </span>

        <TradeBearbeiten
          konfluenzen={konfluenzen}
          startOffen={offen}
          bilder={<ScreenshotFeld tradeId={t.id} bilder={t.screenshots}
            fehler={offen ? bildfehler : null} />}
          trade={{
            id: t.id, pair: t.pair, direction: t.direction, date: t.date,
            status: t.status, result: t.result, rMultiple: t.rMultiple,
            riskAmount: t.riskAmount, riskPercent: t.riskPercent,
            accountBalance: t.accountBalance,
            profitAmount: t.profitAmount, profitPercent: t.profitPercent,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice, lotSize: t.lotSize, notes: t.notes,
            confluences: t.confluences, antworten: t.antworten,
            fundamentalSnapshot: t.fundamentalSnapshot,
            standVor: rechnung?.standVor ?? null,
            gewinnProzent: rechnung?.gewinnProzent ?? t.profitPercent,
            risikoProzent: rechnung?.risikoProzent ?? t.riskPercent,
            rQuelle: rechnung?.rQuelle ?? "gespeichert",
          }} />

        <form action={tradeLoeschen}>
          <input type="hidden" name="id" value={t.id} />
          <button type="submit"
            title="Trade löschen"
            className="rounded-lg px-1.5 text-xs text-ink-faint transition hover:text-bad-bright">
            ✕
          </button>
        </form>
      </div>

      {(setups.length > 0 || t.confluences.length > 0 || t.notes || lage || learning) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[72px]">
          {lage && lage !== "unbekannt" && (
            <Badge tone={lage === "bestaetigt" ? "good" : lage === "dagegen" ? "bad" : "neutral"}
              title={URTEIL_LABEL[lage]}>
              Lage {lage === "bestaetigt" ? "✓" : lage === "dagegen" ? "✗" : "–"}
            </Badge>
          )}
          {setups.map((s) => <Badge key={s.key} tone="accent">{s.label}</Badge>)}
          {t.confluences.map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}
          {learning && (
            <span className="text-xs italic text-ink-muted" title={learning}>
              „{learning.length > 70 ? learning.slice(0, 70) + "…" : learning}"
            </span>
          )}
          {t.notes && (
            <span className="text-xs text-ink-muted" title={t.notes}>
              {t.notes.length > 90 ? t.notes.slice(0, 90) + "…" : t.notes}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default async function TradesSeite({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const sp = await searchParams;

  /*
   * Immer ALLE Live-Trades laden, dann im Speicher filtern.
   *
   * Der Grund ist die Kontokette: Sie rechnet Kontostand, Risiko und R
   * chronologisch durch und braucht dafür jeden Trade. Würde die Datenbank
   * schon nach Paar filtern, fehlten der Kette die Trades dazwischen — und
   * jeder Stand danach wäre falsch.
   */
  const [{ verlauf, live: alleTrades }, strategien, eigeneKonfluenzen, beobachtung] =
    await Promise.all([
      ladeKontoKette(),
      fetchStrategien(),
      fetchKonfluenzen(),
      // `?neu=<id>` kommt vom Knopf „Trade eintragen" auf der Übersicht.
      sp.neu ? fetchWatchlistPaar(sp.neu) : null,
    ]);

  const ergebnisFilter = ["win", "loss", "breakeven"].includes(sp.ergebnis ?? "")
    ? sp.ergebnis : undefined;
  const trades = alleTrades.filter((t) =>
    (!sp.paar || t.pair === sp.paar) && (!ergebnisFilter || t.result === ergebnisFilter));

  /*
   * Aus der Beobachtungs-Zeile wird die Vorbelegung des Formulars.
   *
   * Übernommen wird nur, was dort wirklich steht: Paar, Richtung und das
   * Linien-Level als Einstieg. Ergebnis, Stop und R bleiben leer — die weiss
   * die Zeile nicht, und ein vorausgefülltes Ergebnis wäre geraten.
   *
   * `watchlistId` geht mit: nach dem Speichern verschwindet die Zeile von der
   * Übersicht, statt dort stehen zu bleiben.
   */

  // Paar-Filter nur aus dem, was auch wirklich gehandelt wurde — eine Liste
  // mit 32 Einträgen, von denen 26 leer sind, hilft niemandem.
  const gehandelt = [...new Set(alleTrades.map((t) => t.pair))].sort();

  /*
   * Zurück aus der Duplikatwarnung: die Eingaben stehen in der Adresszeile,
   * damit Kerim nicht alles neu tippen muss, nur um „trotzdem" zu drücken.
   */
  const zahl = (k: string) => {
    const v = Number(sp[k]);
    return sp[k] && Number.isFinite(v) ? v : null;
  };
  const ausAdresse = sp.doppelt ? {
    pair: sp.pair,
    direction: (sp.direction === "short" ? "short" : "long") as "long" | "short",
    date: sp.date,
    result: sp.result ?? "win",
    rMultiple: zahl("rMultiple") ?? undefined,
    riskAmount: zahl("riskAmount"),
    profitAmount: zahl("profitAmount"),
    entryPrice: zahl("entryPrice"),
    stopLoss: zahl("stopLoss"),
    takeProfit: zahl("takeProfit"),
    notes: sp.notes ?? "",
    type: (sp.type === "funded" ? "funded" : "ek") as "ek" | "funded",
    sessionType: "live" as const,
  } : undefined;

  const doppelter = sp.doppelt
    ? (alleTrades.find((t) => t.id === sp.doppelt) ?? null) : null;

  const vorgabe = ausAdresse ?? (beobachtung ? {
    pair: beobachtung.pair,
    direction: (beobachtung.side === "short" ? "short" : "long") as "long" | "short",
    sessionType: "live" as const,
    entryPrice: beobachtung.line_level,
    notes: beobachtung.note ?? "",
    // Die Beobachtung entsteht an einer GVA — das ist der Haken, der bei
    // jedem dieser Trades sitzt.
    setups: { dreiTagesGva: true },
    watchlistId: beobachtung.id,
  } : undefined);

  /*
   * Die Haken im Formular: eigene Konfluenzen, sonst die Standardwerte — und
   * dazu alles, was ein bestehender Trade trägt. Ohne den letzten Teil
   * verschwände beim Bearbeiten eines alten Trades stillschweigend ein Haken,
   * und beim Speichern wäre er weg, ohne dass jemand darauf gedrückt hat.
   */
  const konfluenzen = konfluenzListe(
    eigeneKonfluenzen, alleTrades.flatMap((t) => t.confluences));

  /*
   * Filter nach einer Antwort (`?frage=einstieg&wert=zu_frueh`). Läuft hier
   * und nicht in der Datenbank: die Antworten liegen als JSON, und bei ein
   * paar hundert Trades ist das Filtern im Speicher schneller als jede Abfrage.
   */
  const frageFilter = sp.frage && sp.wert && frageFuer(sp.frage)
    ? { key: sp.frage, wert: sp.wert } : null;
  const gezeigt = frageFilter
    ? trades.filter((t) => t.antworten[frageFilter.key] === frageFilter.wert)
    : trades;

  const s = computeJournalStats(gezeigt);

  const offene = gezeigt.filter((t) => t.status === "open");
  const geschlossene = gezeigt.filter((t) => t.status !== "open");

  // Auswertung und Learnings immer über ALLE Live-Trades, nicht über die
  // Filterauswahl — sonst zeigt die Tabelle nach einem Klick nur noch eine Zeile.
  const bloecke = werteFragenAus(alleTrades
    .filter((t) => t.status !== "open")
    .map((t) => ({ ergebnis: t.result, r: signiertesR(t), antworten: t.antworten })))
    .filter((b) => b.beantwortet > 0);
  const learnings = alleTrades
    .filter((t) => t.antworten[LEARNING_KEY])
    .slice(0, 12);

  const zeileProps = (t: Trade) => ({
    t, verlauf, konfluenzen,
    offen: sp.bearbeiten === t.id,
    bildfehler: sp.bildfehler ?? null,
  });

  const q = (aenderung: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const zusammen = {
      paar: sp.paar, ergebnis: sp.ergebnis, frage: sp.frage, wert: sp.wert, ...aenderung,
    };
    for (const [k, v] of Object.entries(zusammen)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/trading/journal/trades?${qs}` : "/trading/journal/trades";
  };

  return (
    <div className="space-y-5">
      {doppelter && (
        <Card>
          <CardTitle>Sieht aus, als gäbe es den schon</CardTitle>
          <p className="text-sm text-ink-soft">
            {duplikatText({
              id: doppelter.id, pair: doppelter.pair, direction: doppelter.direction,
              date: doppelter.date, entryPrice: doppelter.entryPrice,
              rMultiple: doppelter.rMultiple, status: doppelter.status,
            })}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            Gleiches Paar, gleiche Richtung, Datum höchstens einen Tag
            auseinander und der Einstieg innerhalb von {PIP_TOLERANZ} Pips.
            Deine Eingaben stehen unten noch — willst du ihn trotzdem anlegen,
            setz den Haken im Formular. Sonst schliess die Seite; es wurde
            nichts gespeichert.
          </p>
        </Card>
      )}

      <TradeForm
        paare={PAARE}
        doppeltId={sp.doppelt ?? null}
        strategien={strategien.map((x) => ({ id: x.id, name: x.name }))}
        konfluenzen={konfluenzen}
        vorgabe={vorgabe}
        offenStart={Boolean(vorgabe)}
      />

      <Card>
        <CardTitle>Filter</CardTitle>
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-xs text-ink-faint">Ergebnis</span>
            <FilterChip aktiv={!sp.ergebnis} href={q({ ergebnis: undefined })}>alle</FilterChip>
            <FilterChip aktiv={sp.ergebnis === "win"} href={q({ ergebnis: "win" })}>Gewinn</FilterChip>
            <FilterChip aktiv={sp.ergebnis === "loss"} href={q({ ergebnis: "loss" })}>Verlust</FilterChip>
            <FilterChip aktiv={sp.ergebnis === "breakeven"} href={q({ ergebnis: "breakeven" })}>BE</FilterChip>
          </div>
          {frageFilter && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 text-xs text-ink-faint">Antwort</span>
              <span className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-ink-on">
                {frageFuer(frageFilter.key)?.frage} {labelFuer(frageFilter.key, frageFilter.wert)}
              </span>
              <FilterChip aktiv={false} href={q({ frage: undefined, wert: undefined })}>
                ✕ aufheben
              </FilterChip>
            </div>
          )}
          {gehandelt.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 text-xs text-ink-faint">Paar</span>
              <FilterChip aktiv={!sp.paar} href={q({ paar: undefined })}>alle</FilterChip>
              {gehandelt.map((p) => (
                <FilterChip key={p} aktiv={sp.paar === p} href={q({ paar: p })}>{p}</FilterChip>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card area={s.n > 0 ? "trading" : undefined}>
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Auswahl" value={s.n} sub={`${s.wins} W · ${s.losses} L · ${s.breakeven} BE`} />
          <Stat label="Winrate"
            value={s.winrate === null ? "—" : `${s.winrate.toFixed(0)} %`}
            tone={s.winrate !== null && s.winrate >= 50 ? "good" : "neutral"} />
          <Stat label="Profit Factor"
            value={s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)}
            tone={s.profitFactor !== null && s.profitFactor >= 1.5 ? "good" : "neutral"} />
          <Stat label="Gesamt"
            value={`${s.gesamtR >= 0 ? "+" : ""}${s.gesamtR.toFixed(1)} R`}
            tone={s.gesamtR > 0 ? "good" : s.gesamtR < 0 ? "bad" : "neutral"} />
        </div>
      </Card>

      {/* Offen und geschlossen getrennt. „Live-Trade" hiess hier bis zum
          27.08.2026 jeder Trade des Live-Kontos — auch ein längst
          abgeschlossener. Kerims Einwand ist berechtigt: live ist, was noch
          läuft. Ein Trade mit Ergebnis ist geschlossen, egal auf welchem
          Konto. */}
      {offene.length > 0 && (
        <Card area="trading">
          <CardTitle>
            {offene.length} {offene.length === 1 ? "Trade läuft" : "Trades laufen"}
          </CardTitle>
          <p className="mb-2 text-xs text-ink-muted">
            Noch offen — R und Ergebnis stehen erst fest, wenn beide
            Positionen des Setups zu sind.
          </p>
          <div>
            {offene.map((t) => <TradeZeile key={t.id} {...zeileProps(t)} />)}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>
          {geschlossene.length}{" "}
          {geschlossene.length === 1 ? "geschlossener Trade" : "geschlossene Trades"}
        </CardTitle>
        {geschlossene.length === 0 ? (
          <Empty>
            {sp.paar || sp.ergebnis || frageFilter
              ? "Kein Trade passt zu diesem Filter."
              : "Noch kein abgeschlossener Trade. Das Formular oben ist der "
                + "Anfang — oder die MT5-Brücke trägt ihn selbst ein."}
          </Empty>
        ) : (
          <div>
            {geschlossene.map((t) => <TradeZeile key={t.id} {...zeileProps(t)} />)}
          </div>
        )}
      </Card>

      {/* Auswertung nach den Journal-Fragen. Jede Antwort ist ein Filter —
          ein Klick zeigt die Trades dahinter. */}
      <Card>
        <CardTitle>Auswertung nach Fragen</CardTitle>
        {bloecke.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Noch keine Antworten. Beantworte die Fragen im Bearbeiten-Dialog
            deiner Trades — ab {MIN_JE_ANTWORT} Trades je Antwort wird eine
            Winrate aussagekräftig.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {bloecke.map((b) => (
              <div key={b.key}>
                <p className="mb-1.5 text-sm font-medium text-ink-soft">
                  {b.frage}
                  <span className="ml-2 text-[11px] font-normal text-ink-faint">
                    {b.beantwortet} beantwortet
                  </span>
                </p>
                <ul className="space-y-1">
                  {b.zeilen.filter((z) => z.n > 0).map((z) => (
                    <li key={z.wert}>
                      <Link href={q({ frage: b.key, wert: z.wert })}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3
                                   rounded-lg px-2 py-1 text-xs transition hover:bg-sand/70">
                        <span className="text-ink-soft">{z.label}</span>
                        <span className="tabular text-ink-faint">{z.n}×</span>
                        <span className={cx("tabular w-12 text-right",
                          z.n < MIN_JE_ANTWORT ? "text-ink-faint"
                            : z.winrate !== null && z.winrate >= 50 ? "text-good-bright"
                              : "text-bad-bright")}>
                          {z.winrate === null ? "—" : `${z.winrate.toFixed(0)} %`}
                        </span>
                        <span className={cx("tabular w-14 text-right",
                          z.schnittR === null ? "text-ink-faint"
                            : z.schnittR > 0 ? "text-good-bright" : z.schnittR < 0
                              ? "text-bad-bright" : "text-ink-muted")}>
                          {z.schnittR === null ? "—"
                            : `${z.schnittR > 0 ? "+" : ""}${z.schnittR.toFixed(2)} R`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {bloecke.length > 0 && (
          <p className="mt-3 text-[11px] text-ink-faint">
            Winrate aus Gewinnen und Verlusten, Ø R über alle geschlossenen
            Trades mit dieser Antwort. Grau = weniger als {MIN_JE_ANTWORT} Trades,
            noch Zufall.
          </p>
        )}
      </Card>

      {learnings.length > 0 && (
        <Card>
          <CardTitle>Learnings</CardTitle>
          <ul className="space-y-2">
            {learnings.map((t) => (
              <li key={t.id} className="text-sm">
                <span className="tabular mr-2 text-xs text-ink-faint">
                  {t.date.slice(8, 10)}.{t.date.slice(5, 7)}.
                </span>
                <span className="mr-2 font-medium text-ink">{t.pair}</span>
                <span className={signiertesR(t) < 0 ? "text-bad-bright" : "text-good-bright"}>
                  {signiertesR(t) >= 0 ? "+" : ""}{signiertesR(t).toFixed(1)} R
                </span>
                <p className="mt-0.5 text-ink-soft">{t.antworten[LEARNING_KEY]}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
