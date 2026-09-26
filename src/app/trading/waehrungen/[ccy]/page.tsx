import Link from "next/link";
import { notFound } from "next/navigation";
import { G8, tradingConfigured } from "@/lib/supabase/trading";
import { ladeMakro } from "@/lib/makro/laden";
import { ladeVerlauf } from "@/lib/makro/verlauf";
import { ROHSTOFF_BEZUG, ZYKLUS_LABEL } from "@/lib/makro/bewertung";
import { Verlauf } from "@/components/makro/verlauf";
import { ScoreBalken, urteilWort } from "@/components/makro/teile";
import { Badge, Card, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const NAME: Record<string, string> = {
  USD: "US-Dollar", EUR: "Euro", GBP: "Britisches Pfund", JPY: "Japanischer Yen",
  AUD: "Australischer Dollar", NZD: "Neuseeland-Dollar", CAD: "Kanadischer Dollar", CHF: "Schweizer Franken",
};

/**
 * Eine Währung für sich, mit Verlauf (26.09.2026).
 *
 * Die Übersicht (/trading/waehrungen) zeigt den Stand und ist der Ort zum
 * Pflegen. Diese Seite zeigt, wie es dazu kam: jede Kennzahl als Verlauf,
 * mit wählbarem Zeitraum — wie Trading Economics, nur alles auf einer Seite.
 */
export default async function WaehrungVerlauf({ params }: { params: Promise<{ ccy: string }> }) {
  const { ccy: roh } = await params;
  const ccy = roh.toUpperCase();
  if (!(G8 as readonly string[]).includes(ccy)) notFound();

  const [indikatoren, makro] = await Promise.all([
    ladeVerlauf(ccy),
    tradingConfigured() ? ladeMakro().catch(() => null) : Promise.resolve(null),
  ]);
  const zeile = makro?.zeilen.find((z) => z.ccy === ccy);
  const zyklus = makro?.zyklen[ccy] ?? null;
  const veraltet = indikatoren.filter((i) => i.status === "veraltet").length;
  const fehlt = indikatoren.filter((i) => i.status === "fehlt").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {G8.map((c) => (
          <Link key={c} href={`/trading/waehrungen/${c}`}
            className={cx("rounded-xl px-3 py-1.5 text-sm transition duration-150",
              c === ccy ? "bg-accent font-medium text-ink-on shadow-glow-accent" : "bg-sand text-ink-muted hover:text-ink")}>
            {c}
          </Link>
        ))}
        <Link href={`/trading/waehrungen?w=${ccy}`} className="ml-auto text-xs text-accent-soft hover:underline">
          Zahlen pflegen →
        </Link>
      </div>

      <Card area="trading">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-3xl font-bold text-ink">{ccy}</span>
          <span className="text-sm text-ink-muted">{NAME[ccy]}</span>
          {zeile && (
            <Badge tone={zeile.gesamt === null ? "neutral" : zeile.gesamt > 0.15 ? "good" : zeile.gesamt < -0.15 ? "bad" : "neutral"}>
              {urteilWort(zeile.gesamt)}
            </Badge>
          )}
          {zyklus && <Badge tone="accent">{ZYKLUS_LABEL[zyklus]}</Badge>}
          {zeile && <span className="ml-auto"><ScoreBalken score={zeile.gesamt} breit={160} /></span>}
        </div>
        <p className="mt-3 text-sm text-ink-soft">{ROHSTOFF_BEZUG[ccy]}</p>
        {(veraltet > 0 || fehlt > 0) && (
          <p className="mt-2 text-xs text-ink-muted">
            {veraltet > 0 && <span className="text-accent">{veraltet} veraltet</span>}
            {veraltet > 0 && fehlt > 0 && " · "}
            {fehlt > 0 && <span className="text-bad-bright">{fehlt} ohne Daten</span>}
            {" "}— markiert und verlinkt in der jeweiligen Karte.
          </p>
        )}
      </Card>

      <Verlauf ccy={ccy} indikatoren={indikatoren} />
    </div>
  );
}
