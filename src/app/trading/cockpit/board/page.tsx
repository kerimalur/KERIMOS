import { fetchScreener, fetchRanking, type ScreenerPair } from "@/lib/supabase/trading";
import { TfBadge, FundamentalBadge, SIDE_TONE, fmtUpdated } from "@/components/trading/badges";
import { Card, CardTitle, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * GVA-Board — der Live-Stand aller 28 Paare vom Screener.
 *
 * Stand vorher auf der Trading-Übersicht. Die Übersicht zeigt seit dem Umbau
 * ausschliesslich die selbst gepflegte Watchlist: was Kerim sich vorgenommen
 * hat, nicht was der Screener gefunden hat. Beides auf einer Seite hiess in
 * der Praxis, dass man die eigene Liste übersah.
 */
export default async function BoardSeite() {
  const [screener, ranking] = await Promise.all([fetchScreener(), fetchRanking()]);

  const pairs = (screener?.data ?? []) as ScreenerPair[];
  const hits = pairs.filter((p) => p.status === "HIT");
  const prepares = pairs
    .filter((p) => p.status === "PREPARE")
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">GVA-Board</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Live vom Screener: was getroffen ist und was in Reichweite kommt.
        </p>
      </div>

      <Card>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Alle Paare</CardTitle>
          <span className="text-xs text-ink-muted">
            {screener
              ? `Stand ${fmtUpdated(screener.updated)}${screener.live ? "" : " · Tagesschluss-Preise"}`
              : ""}
          </span>
        </div>

        {!screener ? (
          <Empty>
            Screener nicht erreichbar — das Backend auf Render schläft nach
            Inaktivität und braucht beim Aufwachen bis zu einer Minute.
            Seite gleich nochmal laden.
          </Empty>
        ) : (
          <div className="space-y-4">
            {hits.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-bad">
                  GVA gehittet
                </div>
                <ul className="space-y-1.5">
                  {hits.map((p) => (
                    <li key={p.pair}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-bad-tint px-3 py-2 text-sm">
                      <span className="font-medium text-ink">{p.pair}</span>
                      {p.near && <Badge tone={SIDE_TONE[p.near] ?? "neutral"}>{p.near}</Badge>}
                      <TfBadge p={p} />
                      <FundamentalBadge pair={p.pair} side={p.near} ranking={ranking} />
                      {p.pending && <Badge tone="warn">pending</Badge>}
                      <span className="ml-auto tabular text-xs text-ink-muted">
                        Level {p.near === "SHORT" ? p.short : p.long}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Innerhalb 100 Pips ({prepares.length})
              </div>
              {prepares.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Kein Paar in Reichweite — gerade nichts vorzubereiten.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {prepares.map((p) => (
                    <li key={p.pair}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-sand/60 px-3 py-2 text-sm">
                      <span className="font-medium text-ink">{p.pair}</span>
                      {p.near && <Badge tone={SIDE_TONE[p.near] ?? "neutral"}>{p.near}</Badge>}
                      <TfBadge p={p} />
                      <FundamentalBadge pair={p.pair} side={p.near} ranking={ranking} />
                      <span className="ml-auto tabular text-xs text-ink-soft">
                        {p.stale ? "~" : ""}{p.distance} Pips
                      </span>
                      <span className="tabular text-xs text-ink-muted">
                        {p.price} → {p.near === "SHORT" ? p.short : p.long}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-xs text-ink-faint">
              {pairs.length - hits.length - prepares.length} weitere Paare neutral.
            </p>
            <p className="text-xs text-ink-faint">
              „3D" / „Woche" = Chart, auf dem die GVA entstanden ist.
              {ranking.length > 0
                ? " Fundamentale Bewertung aus dem Währungsranking (Q5/Q1 der Champion-Woche) — Q2–Q4 gelten als neutral."
                : " Währungsranking gerade nicht verfügbar, darum keine fundamentale Bewertung."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
