import { Badge } from "@/components/ui";
import {
  checkFundamental, pairTf, tfLabel,
  type ScreenerPair, type RankingCurrency,
} from "@/lib/supabase/trading";

/**
 * Die kleinen Marken, die auf mehreren Trading-Seiten vorkommen.
 *
 * Vorher standen sie dreimal fast gleich in `trading/page.tsx`,
 * `cockpit/page.tsx` und `radar/page.tsx`. Beim Umbau der Bereiche wären
 * daraus fünf Kopien geworden — deshalb einmal hier.
 */

export const SIDE_TONE: Record<string, "good" | "bad"> = { LONG: "good", SHORT: "bad" };

/** Timeframe der GVA: 3D-Chart oder Wochenchart. */
export function TfBadge({ p }: { p: ScreenerPair }) {
  const tf = pairTf(p);
  if (!tf) return null;
  return <Badge tone={tf === "W" ? "warn" : "neutral"}>{tfLabel(tf)}</Badge>;
}

/**
 * Passt die GVA-Richtung zum Wochen-Ranking? Q5/Q1-Regel, identisch zum
 * Screener. „unbekannt" wird nicht angezeigt — kein Badge ist ehrlicher als
 * ein Badge, das nur bedeutet „keine Daten".
 */
export function FundamentalBadge({
  pair, side, ranking,
}: {
  pair: string;
  side: "LONG" | "SHORT" | null;
  ranking: RankingCurrency[];
}) {
  const f = checkFundamental(pair, side, ranking);
  if (f.urteil === "unbekannt") return null;

  const text =
    f.urteil === "bestaetigt" ? "fundamental bestätigt"
      : f.urteil === "dagegen" ? "gegen Fundamentals"
        : "fundamental neutral";
  const tone = f.urteil === "bestaetigt" ? "good" : f.urteil === "dagegen" ? "bad" : "neutral";

  return (
    <Badge tone={tone} title={f.grund || `${f.baseCode} Q${f.baseQ} · ${f.quoteCode} Q${f.quoteQ}`}>
      {text}
      {f.grund && <span className="ml-1 opacity-70">({f.grund})</span>}
    </Badge>
  );
}

export function fmtUpdated(unix: number | null): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleTimeString("de-CH", {
    hour: "2-digit", minute: "2-digit",
  });
}
