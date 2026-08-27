import Link from "next/link";
import {
  fetchTrades, fetchStrategien, computeJournalStats, signiertesR,
  SETUPS, PAARE, tradingUserId,
  type Trade, type TradeFilter,
} from "@/lib/trading/journal";
import { tradingConfigured, fetchWatchlistPaar } from "@/lib/supabase/trading";
import { tradeLoeschen } from "@/lib/journal-actions";
import { JournalHinweis } from "@/components/journal-hinweis";
import { TradeForm } from "@/components/trade-form";
import { duplikatText, PIP_TOLERANZ } from "@/lib/trading/duplikat";
import { Card, CardTitle, Stat, Badge, Empty } from "@/components/ui";

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

const KONFLUENZEN = [
  "Fundamental", "Technisch", "Saisonal", "COT", "Intermarket",
  "SMC", "Liquidität", "Imbalance",
] as const;

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

function TradeZeile({ t }: { t: Trade }) {
  const r = signiertesR(t);
  const setups = SETUPS.filter((s) => t.setups[s.key]);

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

        <Link href={`/trading/journal/trades?bearbeiten=${t.id}`}
          title="Trade bearbeiten — Stop, R, Notizen nachtragen"
          className="rounded-lg px-1.5 text-xs text-ink-faint transition hover:text-accent-soft">
          bearbeiten
        </Link>

        <form action={tradeLoeschen}>
          <input type="hidden" name="id" value={t.id} />
          <button type="submit"
            title="Trade löschen"
            className="rounded-lg px-1.5 text-xs text-ink-faint transition hover:text-bad-bright">
            ✕
          </button>
        </form>
      </div>

      {(setups.length > 0 || t.confluences.length > 0 || t.notes) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[72px]">
          {setups.map((s) => <Badge key={s.key} tone="accent">{s.label}</Badge>)}
          {t.confluences.map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}
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
  // Fest auf live: das Journal ist das Live-Journal.
  const filter: TradeFilter = { sessionType: "live" };
  if (sp.paar) filter.pair = sp.paar;
  if (sp.ergebnis === "win" || sp.ergebnis === "loss" || sp.ergebnis === "breakeven") {
    filter.result = sp.ergebnis;
  }

  const [trades, strategien, beobachtung] = await Promise.all([
    fetchTrades(filter),
    fetchStrategien(),
    // `?neu=<id>` kommt vom Knopf „Trade eintragen" auf der Übersicht.
    sp.neu ? fetchWatchlistPaar(sp.neu) : null,
  ]);

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
  const s = computeJournalStats(trades);

  // Paar-Filter nur aus dem, was auch wirklich gehandelt wurde — eine Liste
  // mit 32 Einträgen, von denen 26 leer sind, hilft niemandem.
  const alleTrades = filter.pair || filter.result
    ? await fetchTrades({ sessionType: "live" }) : trades;
  const gehandelt = [...new Set(alleTrades.map((t) => t.pair))].sort();

  const zuBearbeiten = sp.bearbeiten
    ? (trades.find((t) => t.id === sp.bearbeiten)
      ?? alleTrades.find((t) => t.id === sp.bearbeiten) ?? null)
    : null;

  /*
   * Bearbeiten schlägt Neuanlegen: wer auf „bearbeiten" drückt, will nicht
   * plötzlich ein leeres Formular. Bis zum 27.08.2026 gab es hier gar keinen
   * Weg — die Liste bot nur Löschen an. Damit liess sich ein von der Brücke
   * eingetragener Trade nicht korrigieren, und genau das brauchte Kerim: Stop
   * und R nachtragen, wenn die Brücke sie nicht messen konnte.
   */
  const bearbeitung = zuBearbeiten ? {
    id: zuBearbeiten.id,
    pair: zuBearbeiten.pair,
    direction: zuBearbeiten.direction,
    date: zuBearbeiten.date,
    result: zuBearbeiten.result ?? "win",
    rMultiple: zuBearbeiten.rMultiple,
    sessionType: zuBearbeiten.sessionType,
    type: zuBearbeiten.type,
    notes: zuBearbeiten.notes,
    entryPrice: zuBearbeiten.entryPrice,
    stopLoss: zuBearbeiten.stopLoss,
    takeProfit: zuBearbeiten.takeProfit,
    setups: {
      dreiTagesGva: zuBearbeiten.setups.dreiTagesGva,
      weeklyGva: zuBearbeiten.setups.weeklyGva,
      dailyBos: zuBearbeiten.setups.dailyBos,
      valueArea: zuBearbeiten.setups.valueArea,
      marketStructure: zuBearbeiten.setups.marketStructure,
    },
  } : undefined;

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

  const vorgabe = ausAdresse ?? bearbeitung ?? (beobachtung ? {
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

  const offene = trades.filter((t) => t.status === "open");
  const geschlossene = trades.filter((t) => t.status !== "open");

  const q = (aenderung: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const zusammen = { paar: sp.paar, ergebnis: sp.ergebnis, ...aenderung };
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
        konfluenzen={KONFLUENZEN}
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
            {offene.map((t) => <TradeZeile key={t.id} t={t} />)}
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
            {sp.paar || sp.ergebnis
              ? "Kein Trade passt zu diesem Filter."
              : "Noch kein abgeschlossener Trade. Das Formular oben ist der "
                + "Anfang — oder die MT5-Brücke trägt ihn selbst ein."}
          </Empty>
        ) : (
          <div>
            {geschlossene.map((t) => <TradeZeile key={t.id} t={t} />)}
          </div>
        )}
      </Card>
    </div>
  );
}
