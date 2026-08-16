import {
  fetchScreener, fetchRanking, baueHeatmap, zaehleStatus, G8,
  type HeatmapZelle,
} from "@/lib/supabase/trading";
import { BereichTabs, COCKPIT_REITER } from "@/components/trading/bereich-tabs";
import { Card, CardTitle, Stat, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Heatmap 28 — dasselbe Bild wie das Radar, nur räumlich statt sortiert.
 *
 * Umgezogen aus dem GVA-Screener (`/scanner/heatmap`), siehe TRADING-UMBAU.md.
 *
 * Zeile = Basiswährung, Spalte = Kurswährung. Wer eine Währung im Blick hat
 * („was ist gerade mit dem Franken los?"), liest eine Zeile und eine Spalte
 * und hat alle sieben Paare auf einmal. Das kann eine sortierte Liste nicht.
 *
 * Jedes Paar steht genau EINMAL im Raster, in seiner gehandelten Notation
 * (EURUSD in Zeile EUR / Spalte USD). Vorher füllte die Gegenzelle dieselben
 * Daten ein zweites Mal — das Raster zeigte 56 Kacheln für 28 Paare, und beim
 * Zählen kam man nie auf die richtige Zahl. Die leere Hälfte ist der Preis
 * dafür, und er ist es wert: die sieben Paare einer Währung findet man
 * weiterhin, indem man ihre Zeile UND ihre Spalte liest.
 */

function zellenFarbe(z: HeatmapZelle): string {
  if (!z.daten) return "bg-sand/30 text-ink-faint";
  if (z.daten.status === "HIT") return "bg-good-tint text-good-bright";
  if (z.daten.status === "PREPARE") return "bg-warn-tint text-accent";
  return "bg-sand/60 text-ink-muted";
}

function Zelle({ z }: { z: HeatmapZelle }) {
  // Diagonale und Gegenzelle: beide bleiben leer. Die Gegenzelle bekommt einen
  // Hauch Kontur, damit das Raster als Raster lesbar bleibt.
  if (!z.pair) {
    return <div className="aspect-square rounded-lg bg-transparent" />;
  }
  if (z.gespiegelt) {
    return (
      <div title={`${z.quote}${z.base} steht in der Gegenzelle`}
        className="aspect-square rounded-lg border border-line/40 bg-transparent" />
    );
  }

  const d = z.daten;
  const titel = d
    ? `${d.pair} · ${d.status}${d.near ? ` ${d.near}` : ""}` +
      `${d.distance !== null ? ` · ${Math.round(d.distance)} Pips` : ""}` +
      `${z.rankingSeite && z.rankingSeite !== "NEUTRAL" ? ` · Ranking ${z.rankingSeite}` : ""}`
    : `${z.base}${z.quote} — keine Screener-Daten`;

  return (
    <div
      title={titel}
      className={`flex aspect-square flex-col items-center justify-center rounded-lg px-1 text-center ${zellenFarbe(z)}`}
    >
      <span className="text-[10px] font-medium leading-none opacity-70">
        {z.base}
        <span className="opacity-50">/</span>
        {z.quote}
      </span>
      {d?.status === "HIT" ? (
        <span className="mt-1 text-[11px] font-bold leading-none">HIT</span>
      ) : d?.distance !== null && d?.distance !== undefined ? (
        <span className="tabular mt-1 text-[11px] font-bold leading-none">
          {Math.round(d.distance)}
        </span>
      ) : (
        <span className="mt-1 text-[11px] leading-none opacity-40">—</span>
      )}
      {z.rankingSeite === "LONG" && (
        <span className="mt-0.5 text-[9px] leading-none text-good-bright">▲</span>
      )}
      {z.rankingSeite === "SHORT" && (
        <span className="mt-0.5 text-[9px] leading-none text-bad-bright">▼</span>
      )}
    </div>
  );
}

export default async function HeatmapSeite() {
  const [screener, ranking] = await Promise.all([fetchScreener(), fetchRanking()]);

  if (!screener) {
    return (
      <div className="mx-auto max-w-4xl py-10">
        <Card>
          <CardTitle>Heatmap 28</CardTitle>
          <Empty>
            Der Screener antwortet gerade nicht. Das Backend liegt auf Render und
            schläft nach längerer Pause ein — beim nächsten Aufruf in einer Minute
            ist es meist wieder da.
          </Empty>
        </Card>
      </div>
    );
  }

  const pairs = screener.data ?? [];
  const raster = baueHeatmap(pairs, ranking);
  const z = zaehleStatus(pairs);

  const gezeigt = raster.flat().filter((z) => z.pair && !z.gespiegelt).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Heatmap 28</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Zeile = Basiswährung, Spalte = Kurswährung. Die Zahl ist der Abstand
            zur nächsten GVA-Linie in Pips. Jedes Paar steht einmal — die leeren
            Kacheln sind die Gegenrichtung.
          </p>
        </div>
      </div>

      <BereichTabs reiter={COCKPIT_REITER} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card area={z.hit > 0 ? "trading" : undefined}>
          <Stat label="Getroffen" value={z.hit} tone={z.hit > 0 ? "good" : "neutral"} />
        </Card>
        <Card>
          <Stat label="Nah dran" value={z.prepare} tone={z.prepare > 0 ? "warn" : "neutral"} />
        </Card>
        <Card>
          <Stat label="Ruhig" value={z.neutral} />
        </Card>
      </div>

      <Card>
        <CardTitle>Raster</CardTitle>
        {pairs.length === 0 ? (
          <Empty>Der Screener hat noch keine Zonen berechnet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              {/* Kopfzeile: Kurswährungen */}
              <div className="grid grid-cols-9 gap-1.5">
                <div />
                {G8.map((q) => (
                  <div key={q}
                    className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                    {q}
                  </div>
                ))}
              </div>
              {raster.map((zeile, i) => (
                <div key={G8[i]} className="mt-1.5 grid grid-cols-9 gap-1.5">
                  <div className="flex items-center justify-end pr-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                    {G8[i]}
                  </div>
                  {zeile.map((zelle, j) => (
                    <Zelle key={`${G8[i]}-${G8[j]}`} z={zelle} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card flat>
        <CardTitle>Legende</CardTitle>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-good-tint" /> getroffen
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-warn-tint" /> nah dran (≤ 100 Pips)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-sand/60" /> ruhig
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-good-bright">▲</span> Ranking sagt Long
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-bad-bright">▼</span> Ranking sagt Short
          </span>
          <Badge tone="neutral">Zahl = Pips bis zur Linie</Badge>
          <Badge tone="neutral">{gezeigt} Paare, jedes einmal</Badge>
        </div>
      </Card>
    </div>
  );
}
