import Link from "next/link";
import {
  ladeKontoKette, computeJournalStats, signiertesR, tradingUserId,
  type Trade, type KontoTyp,
} from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { JournalHinweis } from "@/components/journal-hinweis";
import { Card, CardTitle, Stat, Badge, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Journal-Übersicht — wo steht das Konto, und was läuft gerade.
 *
 * Auf Kerims Ansage vom 21.08.2026 radikal zusammengestrichen. Vorher standen
 * hier vier Auswertungstabellen (nach Setup, Paar, Session, Richtung) und ein
 * Backtest-Block. Beides gehört nicht hierher:
 *
 * - **Auswertung** ist eine eigene Frage und steht im Backtest. Auf der
 *   Übersicht lenkt sie von der einen Zahl ab, die zählt: wo steht das Konto.
 * - **Backtest-Trades** haben in einem Live-Journal nichts verloren. Ein
 *   durchgespielter Trade hat kein Geld bewegt; ihn hier mitzuzählen macht
 *   jede Kontozahl falsch.
 *
 * Geblieben ist: welches Konto, was steht drauf, was läuft offen, was war
 * zuletzt. Mehr braucht ein Journal-Einstieg nicht.
 */

const KONTO_LABEL: Record<KontoTyp, string> = {
  ek: "Eigenkapital",
  funded: "Fremdkapital",
};

const geld = (v: number, waehrung: string) =>
  `${v >= 0 ? "" : "−"}${Math.abs(v).toLocaleString("de-CH", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} ${waehrung}`;

function OffeneTrades({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return <Empty>Nichts offen. Kein Geld im Markt.</Empty>;
  }
  return (
    <div className="space-y-1.5">
      {trades.map((t) => (
        <div key={t.id}
          className="flex flex-wrap items-center gap-2.5 rounded-xl bg-warn-tint px-3 py-2">
          <span className="text-sm font-medium text-ink">{t.pair}</span>
          <Badge tone={t.direction === "long" ? "good" : "bad"}>
            {t.direction === "long" ? "Long" : "Short"}
          </Badge>
          {t.entryPrice !== null && (
            <span className="tabular text-xs text-ink-muted">@ {t.entryPrice}</span>
          )}
          {t.lotSize !== null && (
            <span className="tabular text-xs text-ink-faint">{t.lotSize} Lot</span>
          )}
          <span className="tabular ml-auto text-xs text-ink-faint">
            seit {t.date.slice(8, 10)}.{t.date.slice(5, 7)}.
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function JournalUebersicht({ searchParams }: {
  searchParams: Promise<{ konto?: string }>;
}) {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const sp = await searchParams;
  // Eine Quelle für alle Zahlen: die Kontokette rechnet Stand, Betrag,
  // Risiko und R chronologisch durch (lib/trading/konto-verlauf.ts).
  const { verlauf, live } = await ladeKontoKette();

  const typen: KontoTyp[] = ["ek", "funded"];
  const gewaehlt: KontoTyp = typen.find((x) => x === sp.konto) ?? "ek";

  const meine = live.filter((t) => t.type === gewaehlt);
  const offen = meine.filter((t) => t.status === "open");
  const zu = meine.filter((t) => t.status !== "open");
  const s = computeJournalStats(zu);

  const stand = verlauf.proTyp.get(gewaehlt) ?? null;
  const waehrung = stand?.currency ?? "CHF";

  // Ergebnis in Prozent auf das eingesetzte Kapital, nicht auf den aktuellen
  // Stand: sonst schrumpft der Nenner mit jedem Verlust und die Zahl schoent.
  const eingesetzt = stand
    ? stand.start + stand.einzahlungen - stand.auszahlungen
    : 0;
  const prozent = eingesetzt > 0 && stand
    ? (stand.handelsGewinn / eingesetzt) * 100 : null;

  const letzte = meine.slice(0, 8);

  return (
    <div className="space-y-5">
      <Card area={offen.length > 0 ? "trading" : undefined}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">
            {stand?.konto?.name ?? KONTO_LABEL[gewaehlt]}
          </CardTitle>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {typen.map((t) => (
              <Link key={t} href={`/trading/journal?konto=${t}`}
                className={cx("rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
                  gewaehlt === t ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
                {KONTO_LABEL[t]}
              </Link>
            ))}
          </span>
        </div>

        {stand === null ? (
          <Empty>
            Für {KONTO_LABEL[gewaehlt]} ist kein Konto angelegt. Unter „Konten"
            eintragen — ohne Startkapital lässt sich kein Stand rechnen.
          </Empty>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Kontostand" value={geld(stand.stand, waehrung)}
                sub="Start + Ein- − Auszahlungen + Handel" />
              <Stat
                label="Ergebnis"
                value={geld(stand.handelsGewinn, waehrung)}
                tone={stand.handelsGewinn > 0 ? "good" : stand.handelsGewinn < 0 ? "bad" : "neutral"}
                sub="realisiert, nur Live"
              />
              <Stat
                label="Ergebnis %"
                value={prozent === null ? "—" : `${prozent >= 0 ? "+" : ""}${prozent.toFixed(1)} %`}
                tone={prozent !== null && prozent > 0 ? "good"
                  : prozent !== null && prozent < 0 ? "bad" : "neutral"}
                sub="auf das eingesetzte Kapital"
              />
              <Stat label="Trades" value={zu.length}
                sub={offen.length > 0 ? `${offen.length} offen` : "alle geschlossen"} />
            </div>

            {Math.abs(stand.abweichung) >= 1 && stand.konto !== null && (
              <p className="mt-4 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
                Der hinterlegte Kontostand weicht um {geld(stand.abweichung, waehrung)} ab.
                Das ist ein Hinweis, kein Fehler — meist fehlt bei einem Trade der Betrag
                oder eine Einzahlung ist nicht erfasst.
              </p>
            )}
          </>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Offen</CardTitle>
          <OffeneTrades trades={offen} />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Kommt automatisch aus MetaTrader, sobald die Brücke läuft. Ein Setup
            mit zwei Positionen steht hier als <strong>ein</strong> Trade.
          </p>
        </Card>

        <Card>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <CardTitle className="mb-0">Zuletzt</CardTitle>
            <Link href="/trading/journal/trades"
              className="text-xs text-accent-soft transition hover:underline">
              alle ansehen →
            </Link>
          </div>
          {letzte.length === 0 ? (
            <Empty>Noch nichts erfasst.</Empty>
          ) : (
            <div className="space-y-1.5">
              {letzte.map((t) => {
                const r = signiertesR(t);
                const laeuft = t.status === "open";
                return (
                  <div key={t.id}
                    className="flex items-center gap-2.5 rounded-xl bg-sand/50 px-3 py-2">
                    <span className="tabular w-20 shrink-0 text-xs text-ink-faint">
                      {t.date.slice(8, 10)}.{t.date.slice(5, 7)}.{t.date.slice(2, 4)}
                    </span>
                    <span className="w-[76px] shrink-0 text-sm font-medium text-ink">
                      {t.pair}
                    </span>
                    <Badge tone={t.direction === "long" ? "good" : "bad"}>
                      {t.direction === "long" ? "Long" : "Short"}
                    </Badge>
                    <span className={cx("tabular ml-auto text-sm font-medium",
                      laeuft ? "text-ink-faint"
                        : r > 0 ? "text-good-bright" : r < 0 ? "text-bad-bright" : "text-ink-muted")}>
                      {laeuft ? "läuft" : `${r >= 0 ? "+" : ""}${r.toFixed(1)} R`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {zu.length > 0 && (
        <Card>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <CardTitle className="mb-0">Wie es lief</CardTitle>
            <Link href="/trading/backtest"
              className="text-xs text-accent-soft transition hover:underline">
              Auswertung →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Trefferquote"
              value={s.winrate === null ? "—" : `${s.winrate.toFixed(0)} %`}
              sub={`${s.wins} W · ${s.losses} L · ${s.breakeven} BE`}
              tone={s.winrate !== null && s.winrate >= 50 ? "good" : "neutral"} />
            <Stat label="Erwartungswert"
              value={s.expectancy === null ? "—" : `${s.expectancy >= 0 ? "+" : ""}${s.expectancy.toFixed(2)} R`}
              sub="Ø pro Trade"
              tone={s.expectancy !== null && s.expectancy > 0 ? "good"
                : s.expectancy !== null && s.expectancy < 0 ? "bad" : "neutral"} />
            <Stat label="Gesamt"
              value={`${s.gesamtR >= 0 ? "+" : ""}${s.gesamtR.toFixed(1)} R`}
              tone={s.gesamtR > 0 ? "good" : s.gesamtR < 0 ? "bad" : "neutral"} />
            <Stat label="Max. Rückgang" value={`${s.maxDrawdownR.toFixed(1)} R`}
              sub="grösster Einbruch" />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
            Vier Zahlen, mehr nicht. Die Aufschlüsselung nach Setup, Paar, Session und
            Richtung steht im <strong>Backtest</strong> — dort gehört sie hin, weil sie
            eine andere Frage beantwortet als „wo steht mein Konto".
          </p>
        </Card>
      )}
    </div>
  );
}
