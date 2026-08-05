import Link from "next/link";
import {
  fetchScreener, fetchTodayEvents, type ScreenerPair,
} from "@/lib/supabase/trading";
import { fetchBacktestStand, BACKTEST_ZIEL } from "@/lib/backtest-sheet";
import { Card, Badge } from "@/components/ui";

const eventTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-CH", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich",
  });

/**
 * Wochentag und Stunde in Zürcher Zeit - der Server steht in Dublin, die
 * lokale Zeit des Prozesses taugt für diese Entscheidung nicht.
 */
function zuerichJetzt(): { tag: number; stunde: number } {
  const jetzt = new Date();
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich", weekday: "short", hour: "numeric", hour12: false,
  }).formatToParts(jetzt);

  const wochentage = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const kurz = teile.find((t) => t.type === "weekday")?.value ?? "Mon";
  return {
    tag: Math.max(0, wochentage.indexOf(kurz)),
    stunde: Number(teile.find((t) => t.type === "hour")?.value ?? 12),
  };
}

/**
 * Kompakte Trading-Karte fürs Cockpit: GVA-Status (Hits + Paare in Reichweite)
 * und Backtest-Fortschritt. Server Component — Details auf /trading.
 */
export async function TradingCard() {
  // Am Wochenende ist der Devisenmarkt zu. Eine GVA-Linie hat dann keine
  // Aussage - sie zeigt einen Stand, auf den niemand reagieren kann. Statt
  // Setups steht dann der Backtest im Vordergrund, das ist die Arbeit, die
  // am Wochenende tatsächlich ansteht.
  const { tag, stunde } = zuerichJetzt();
  const samstag = tag === 6;
  const sonntag = tag === 0;
  // Sydney öffnet Sonntag 22:00 Zürcher Zeit - ab Mittag lohnt der Ausblick.
  const wochenausblick = sonntag && stunde >= 12;
  const marktZu = samstag || sonntag;

  const [screener, stand, events] = await Promise.all([
    marktZu ? Promise.resolve(null) : fetchScreener(),
    // Aus dem Google Sheet, nicht aus backtest_sessions: dort steht der
    // automatisierte Engine-Backtest, gemeint ist der manuelle.
    fetchBacktestStand(),
    marktZu ? Promise.resolve([]) : fetchTodayEvents(),
  ]);

  const pairs = (screener?.data ?? []) as ScreenerPair[];
  const hits = pairs.filter((p) => p.status === "HIT");
  const prepares = pairs
    .filter((p) => p.status === "PREPARE")
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));


  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/trading"
          className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted transition hover:text-ink-soft">
          Trading
        </Link>
        {stand && (
          <span className="tabular text-xs text-ink-muted">
            Backtest {stand.trades}/{BACKTEST_ZIEL}
            {stand.winrate !== null && ` · ${stand.winrate.toFixed(0)} % WR`}
            {stand.gesamtR !== null && ` · ${stand.gesamtR.toFixed(1)} R`}
          </span>
        )}
      </div>

      <div className="mt-3">
        {marktZu ? (
          <p className="text-sm text-ink-muted">
            {wochenausblick
              ? "Markt öffnet heute 22:00. Gute Zeit für den Wochenausblick."
              : samstag
                ? "Markt zu. Heute zählt nur der Backtest."
                : "Markt zu bis heute Abend."}
          </p>
        ) : !screener ? (
          <p className="text-sm text-ink-muted">
            GVA-Screener startet gerade — Board in einer Minute wieder da.
          </p>
        ) : hits.length === 0 && prepares.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Kein GVA-Setup in Reichweite — alle {pairs.length} Paare neutral.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {hits.map((p) => (
              <Link key={p.pair} href="/trading"
                className="flex items-center gap-1.5 rounded-lg bg-bad-tint px-2.5 py-1.5 text-sm font-medium text-ink">
                {p.pair}
                <Badge tone={p.near === "LONG" ? "good" : "bad"}>
                  HIT {p.near ?? ""}
                </Badge>
              </Link>
            ))}
            {prepares.map((p) => (
              <Link key={p.pair} href="/trading"
                className="flex items-center gap-1.5 rounded-lg bg-sand/70 px-2.5 py-1.5 text-sm text-ink-soft">
                {p.pair}
                <span className="tabular text-xs text-ink-muted">
                  {p.stale ? "~" : ""}{p.distance} Pips {p.near?.toLowerCase()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Wirtschaftskalender: die High-Impact-Termine des Tages.
          Am Wochenende gibt es keine - dann bleibt die Zeile ganz weg,
          statt "keine News" zu melden, was ohnehin klar ist. */}
      {!marktZu && (
      <div className="mt-3 border-t border-line/70 pt-2.5 text-xs">
        {events.length === 0 ? (
          <span className="text-ink-faint">Keine High-Impact-News heute.</span>
        ) : (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {events.map((e, i) => {
              const vorbei = new Date(e.event_time) < new Date();
              return (
                <span key={i}
                  className={vorbei ? "text-ink-faint line-through" : "text-ink-soft"}>
                  <span className="tabular font-medium">{eventTime(e.event_time)}</span>
                  {e.currency && <span className="ml-1 font-medium">{e.currency}</span>}
                  <span className="ml-1">{e.title}</span>
                  {vorbei && e.actual && <span className="ml-1">→ {e.actual}</span>}
                </span>
              );
            })}
          </span>
        )}
      </div>
      )}
    </Card>
  );
}
