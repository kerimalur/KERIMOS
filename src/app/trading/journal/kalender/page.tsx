import Link from "next/link";
import {
  fetchTrades, computeJournalStats, signiertesR, tradingUserId, type Trade,
} from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { JournalHinweis } from "@/components/journal-hinweis";
import { Card, CardTitle, Stat, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Trade-Kalender — das Ergebnis über die Zeit statt über die Liste.
 *
 * Umgezogen aus dem GVA-Screener (`/journal/kalender`), siehe TRADING-UMBAU.md.
 *
 * Was eine Liste nicht zeigt und ein Kalender sofort: **Muster im Rhythmus.**
 * Häufen sich die Verluste am Freitag? Kommen die guten Trades in Wellen, oder
 * gleichmässig? Sind die Tage mit vier Trades besser oder schlechter als die
 * mit einem? Das sind Fragen zur Disziplin, nicht zur Strategie — und sie
 * lassen sich nur räumlich beantworten.
 */

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function monatsGitter(jahr: number, monat: number): (string | null)[] {
  const ersterTag = new Date(Date.UTC(jahr, monat, 1));
  const tageImMonat = new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate();
  // Montag = 0
  const versatz = (ersterTag.getUTCDay() + 6) % 7;

  const zellen: (string | null)[] = Array(versatz).fill(null);
  for (let t = 1; t <= tageImMonat; t++) {
    zellen.push(`${jahr}-${String(monat + 1).padStart(2, "0")}-${String(t).padStart(2, "0")}`);
  }
  while (zellen.length % 7 !== 0) zellen.push(null);
  return zellen;
}

function TagesZelle({ datum, trades }: { datum: string | null; trades: Trade[] }) {
  if (!datum) return <div className="aspect-square" />;

  const tag = Number(datum.slice(8, 10));
  const r = trades.reduce((a, t) => a + signiertesR(t), 0);
  const heute = datum === new Date().toISOString().slice(0, 10);

  const grund =
    trades.length === 0 ? "bg-sand/25"
      : r > 0 ? "bg-good-tint"
        : r < 0 ? "bg-bad-tint"
          : "bg-sand/60";

  const textFarbe =
    trades.length === 0 ? "text-ink-faint"
      : r > 0 ? "text-good-bright"
        : r < 0 ? "text-bad-bright"
          : "text-ink-muted";

  const titel = trades.length === 0
    ? `${datum} — kein Trade`
    : `${datum}\n${trades.map((t) =>
        `${t.pair} ${t.direction === "long" ? "Long" : "Short"} ${signiertesR(t) >= 0 ? "+" : ""}${signiertesR(t).toFixed(1)}R`,
      ).join("\n")}`;

  return (
    <div title={titel}
      className={`flex aspect-square flex-col items-center justify-center rounded-lg ${grund} ${
        heute ? "ring-1 ring-accent/60" : ""
      }`}>
      <span className="text-[10px] leading-none text-ink-faint">{tag}</span>
      {trades.length > 0 && (
        <>
          <span className={`tabular mt-0.5 text-[11px] font-bold leading-none ${textFarbe}`}>
            {r >= 0 ? "+" : ""}{r.toFixed(1)}
          </span>
          <span className="mt-0.5 text-[9px] leading-none text-ink-faint">
            {trades.length}×
          </span>
        </>
      )}
    </div>
  );
}

export default async function KalenderSeite({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; art?: string }>;
}) {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const sp = await searchParams;
  const heute = new Date();
  const [jahr, monat] = sp.monat?.match(/^\d{4}-\d{2}$/)
    ? [Number(sp.monat.slice(0, 4)), Number(sp.monat.slice(5, 7)) - 1]
    : [heute.getFullYear(), heute.getMonth()];

  const art = sp.art === "live" ? "live" : sp.art === "alle" ? undefined : "backtest";
  const alle = await fetchTrades(art ? { sessionType: art } : {});

  const proTag = new Map<string, Trade[]>();
  for (const t of alle) {
    const liste = proTag.get(t.date) ?? [];
    liste.push(t);
    proTag.set(t.date, liste);
  }

  const gitter = monatsGitter(jahr, monat);
  const monatsPraefix = `${jahr}-${String(monat + 1).padStart(2, "0")}`;
  const imMonat = alle.filter((t) => t.date.startsWith(monatsPraefix));
  const s = computeJournalStats(imMonat);

  // Wochentags-Auswertung über ALLE Trades, nicht nur den Monat — bei 24
  // Trades pro Woche wäre ein Monat für diese Frage zu wenig.
  const proWochentag = WOCHENTAGE.map((label, i) => {
    const liste = alle.filter((t) => {
      const d = new Date(`${t.date}T12:00:00Z`);
      return (d.getUTCDay() + 6) % 7 === i;
    });
    return { label, stats: computeJournalStats(liste) };
  });

  const vorher = new Date(Date.UTC(jahr, monat - 1, 1));
  const nachher = new Date(Date.UTC(jahr, monat + 1, 1));
  const mLink = (d: Date) =>
    `/trading/journal/kalender?monat=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}${
      sp.art ? `&art=${sp.art}` : ""
    }`;

  const chip = (wert: string, label: string) => {
    const aktiv = (sp.art ?? "backtest") === wert;
    return (
      <Link href={`/trading/journal/kalender?monat=${monatsPraefix}&art=${wert}`}
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

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href={mLink(vorher)}
            className="rounded-lg bg-sand px-2.5 py-1 text-sm text-ink-muted transition hover:text-ink-soft">
            ←
          </Link>
          <span className="font-display text-base font-bold text-ink">
            {MONATE[monat]} {jahr}
          </span>
          <Link href={mLink(nachher)}
            className="rounded-lg bg-sand px-2.5 py-1 text-sm text-ink-muted transition hover:text-ink-soft">
            →
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WOCHENTAGE.map((w) => (
            <div key={w} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {w}
            </div>
          ))}
          {gitter.map((d, i) => (
            <TagesZelle key={i} datum={d} trades={d ? (proTag.get(d) ?? []) : []} />
          ))}
        </div>

        <div className="mt-4 grid gap-4 border-t border-line/70 pt-4 sm:grid-cols-4">
          <Stat label="Trades im Monat" value={s.n} sub={`${s.wins} W · ${s.losses} L`} />
          <Stat label="Winrate"
            value={s.winrate === null ? "—" : `${s.winrate.toFixed(0)} %`}
            tone={s.winrate !== null && s.winrate >= 50 ? "good" : "neutral"} />
          <Stat label="Ergebnis"
            value={`${s.gesamtR >= 0 ? "+" : ""}${s.gesamtR.toFixed(1)} R`}
            tone={s.gesamtR > 0 ? "good" : s.gesamtR < 0 ? "bad" : "neutral"} />
          <Stat label="Handelstage"
            value={[...proTag.keys()].filter((d) => d.startsWith(monatsPraefix)).length}
            sub="Tage mit mindestens einem Trade" />
        </div>
      </Card>

      <Card>
        <CardTitle>Nach Wochentag (alle Trades)</CardTitle>
        {alle.length === 0 ? (
          <Empty>Noch nichts erfasst.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-7">
            {proWochentag.map((w) => (
              <div key={w.label}
                className="rounded-xl bg-sand/50 px-2 py-2.5 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  {w.label}
                </div>
                <div className={`tabular mt-1 text-sm font-bold ${
                  w.stats.gesamtR > 0 ? "text-good-bright"
                    : w.stats.gesamtR < 0 ? "text-bad-bright" : "text-ink-muted"
                }`}>
                  {w.stats.n === 0 ? "—"
                    : `${w.stats.gesamtR >= 0 ? "+" : ""}${w.stats.gesamtR.toFixed(1)}`}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-faint">
                  {w.stats.n === 0 ? "kein Trade"
                    : `${w.stats.n}× · ${w.stats.winrate?.toFixed(0) ?? "—"} %`}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-ink-faint">
          Samstag und Sonntag sollten leer sein — steht dort etwas, ist entweder
          das Datum falsch erfasst oder es war ein Krypto-Trade.
        </p>
      </Card>
    </div>
  );
}
