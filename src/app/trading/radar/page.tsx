import Link from "next/link";
import {
  fetchScreener, fetchRanking, checkFundamental, sortiereNachDringlichkeit,
  zaehleStatus, pairTf, tfLabel,
  type ScreenerPair, type RankingCurrency,
} from "@/lib/supabase/trading";
import { Card, CardTitle, Stat, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Visuelles Radar — alle 28 Paare in einer Liste, nach Dringlichkeit sortiert.
 *
 * Umgezogen aus dem GVA-Screener (`/scanner/radar`), siehe TRADING-UMBAU.md.
 *
 * Der Unterschied zur Heatmap: hier zählt die Reihenfolge, nicht die Fläche.
 * Was getroffen ist, steht oben; was nah dran ist, folgt; der Rest ist da,
 * damit man sieht, dass er da ist. Wer scrollt, hat den relevanten Teil schon
 * hinter sich.
 */

const STATUS_TON = { HIT: "good", PREPARE: "warn", NEUTRAL: "neutral" } as const;
const STATUS_TEXT = { HIT: "getroffen", PREPARE: "nah dran", NEUTRAL: "ruhig" } as const;

function Zeile({ p, ranking }: { p: ScreenerPair; ranking: RankingCurrency[] }) {
  const tf = pairTf(p);
  const f = checkFundamental(p.pair, p.near, ranking);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line/70 py-3 first:border-t-0">
      <span className="w-[86px] shrink-0 font-display text-sm font-bold text-ink">
        {p.pair}
      </span>

      <Badge tone={STATUS_TON[p.status]}>{STATUS_TEXT[p.status]}</Badge>

      {p.near && (
        <Badge tone={p.near === "LONG" ? "good" : "bad"}>{p.near}</Badge>
      )}

      {tf && <Badge tone={tf === "W" ? "warn" : "neutral"}>{tfLabel(tf)}</Badge>}

      {p.distance !== null && p.status !== "HIT" && (
        <span className="tabular text-xs text-ink-muted">
          {Math.round(p.distance)} Pips
        </span>
      )}

      <span className="tabular ml-auto text-xs text-ink-soft">
        {p.price !== null ? p.price.toFixed(p.pair.toUpperCase().includes("JPY") ? 3 : 5) : "—"}
      </span>

      {p.stale && (
        <Badge tone="neutral" title="Preis vom Tagesschluss, nicht live">
          nicht live
        </Badge>
      )}

      {f.urteil !== "unbekannt" && (
        <Badge
          tone={f.urteil === "bestaetigt" ? "good" : f.urteil === "dagegen" ? "bad" : "neutral"}
          title={f.grund || undefined}
        >
          {f.urteil === "bestaetigt" ? "fundamental dafür"
            : f.urteil === "dagegen" ? "fundamental dagegen" : "fundamental neutral"}
        </Badge>
      )}
    </div>
  );
}

export default async function RadarSeite() {
  const [screener, ranking] = await Promise.all([fetchScreener(), fetchRanking()]);

  if (!screener) {
    return (
      <div className="mx-auto max-w-4xl py-10">
        <Card>
          <CardTitle>Visuelles Radar</CardTitle>
          <Empty>
            Der Screener antwortet gerade nicht. Das Backend liegt auf Render und
            schläft nach längerer Pause ein — beim nächsten Aufruf in einer Minute
            ist es meist wieder da.
          </Empty>
        </Card>
      </div>
    );
  }

  const pairs = sortiereNachDringlichkeit(screener.data ?? []);
  const z = zaehleStatus(pairs);
  const aktualisiert = screener.updated
    ? new Date(screener.updated * 1000).toLocaleTimeString("de-CH",
        { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })
    : "—";

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Visuelles Radar</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Alle 28 Paare, das Dringendste zuerst. Stand {aktualisiert} Uhr
            {screener.live ? "" : " · Preise nicht live"}.
          </p>
        </div>
        <Link href="/trading" className="text-xs text-accent-soft transition hover:underline">
          ← Trading-Übersicht
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card area={z.hit > 0 ? "trading" : undefined}>
          <Stat label="Getroffen" value={z.hit} tone={z.hit > 0 ? "good" : "neutral"}
            sub="Linie berührt" />
        </Card>
        <Card>
          <Stat label="Nah dran" value={z.prepare} tone={z.prepare > 0 ? "warn" : "neutral"}
            sub="innerhalb 100 Pips" />
        </Card>
        <Card>
          <Stat label="Ruhig" value={z.neutral}
            sub={z.stale > 0 ? `${z.stale} davon ohne Live-Preis` : "alle Preise live"} />
        </Card>
      </div>

      <Card>
        <CardTitle>Alle Paare</CardTitle>
        {pairs.length === 0 ? (
          <Empty>Der Screener hat noch keine Zonen berechnet.</Empty>
        ) : (
          <div>
            {pairs.map((p) => <Zeile key={p.pair} p={p} ranking={ranking} />)}
          </div>
        )}
      </Card>

      {!screener.zones_complete_run && (
        <Card flat>
          <p className="text-sm text-ink-muted">
            Der letzte Zonen-Durchlauf war unvollständig — einzelne Paare können
            veraltete Linien zeigen. Das legt sich mit dem nächsten Durchlauf von
            selbst.
          </p>
        </Card>
      )}
    </div>
  );
}
