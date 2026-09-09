import Link from "next/link";
import { ladeGewohnheitenMitRaster, GEWOHNHEITEN_SQL } from "@/lib/gewohnheiten";
import { Eintragen } from "@/components/gewohnheiten-karte";
import { GewohnheitenRaster } from "@/components/gewohnheiten-raster";
import { Card, CardTitle, Empty, Stat } from "@/components/ui";
import { heuteISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Gewohnheiten — eintragen, nachtragen, nachsehen.
 *
 * Die Seite beantwortet eine Frage je Gewohnheit: wie oft. Es gibt bewusst
 * keine Auswertung darüber hinaus — keine Korrelationen, keine Tageszeit,
 * keine Bewertung der Serie. Der Gym-Bereich hatte all das und es hat nie eine
 * Entscheidung verändert; was blieb, war der Erfassungsaufwand.
 *
 * Der tägliche Weg führt gar nicht hierher: eingetragen wird auf der
 * Startseite und im Gym-Bereich. Hier steht der Verlauf, Monat für Monat,
 * beliebig weit zurück.
 *
 * Angelegt und geändert wird seit dem 09.09.2026 unter
 * `/einstellungen/gewohnheiten`. Die Formulare standen vorher aufklappbar in
 * jeder Karte und waren im Weg: zwischen Zahlen und Raster gehört nichts,
 * was man dreimal im Jahr benutzt.
 */
export default async function GewohnheitenPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const { monat } = await searchParams;
  const { gewohnheiten, tabelleFehlt } = await ladeGewohnheitenMitRaster(monat);
  const heute = heuteISO();

  return (
    <div className="py-6">
      <div className="mb-5">
        <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
          ← Startseite
        </Link>
        <h1 className="font-display mt-1 text-2xl font-bold leading-tight text-ink">
          Gewohnheiten
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Was getan wurde, und wie oft. Im Raster lässt sich ein vergangener Tag
          nachtragen — der Montag, der am Mittwoch auffällt, soll nicht für
          immer fehlen. Mit ‹ und › blätterst du durch die Monate.
          Anlegen und Ändern steht unter{" "}
          <Link href="/einstellungen/gewohnheiten"
            className="text-accent-soft hover:underline">
            Einstellungen
          </Link>.
        </p>
      </div>

      {tabelleFehlt ? (
        <Card>
          <CardTitle>Tabellen fehlen noch</CardTitle>
          <p className="text-sm text-ink-muted">
            Führe <code className="rounded bg-sand px-1 py-0.5 text-xs">
              supabase/migrations/19_habits.sql
            </code> und danach <code className="rounded bg-sand px-1 py-0.5 text-xs">
              20_habits_varianten.sql
            </code> im SQL-Editor aus, dann läuft die Seite. Beides zusammen
            ergibt den Stand unten — zum Kopieren:
          </p>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-sand p-4 text-xs
                          leading-relaxed text-ink-soft">
            {GEWOHNHEITEN_SQL}
          </pre>
        </Card>
      ) : (
        <div className="space-y-5">
          {gewohnheiten.length === 0 ? (
            <Empty>
              Noch keine Gewohnheit. Unter Einstellungen legst du die erste
              an — Gym ist der naheliegende Anfang.
            </Empty>
          ) : (
            gewohnheiten.map((h) => (
              <Card key={h.id}>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-ink">
                    {h.icon && <span className="mr-2">{h.icon}</span>}
                    {h.name}
                  </h2>
                  <span className="text-xs text-ink-faint">
                    {h.bereich === "gym" ? "im Gym-Bereich" : "auf der Startseite"}
                    {h.varianten.length > 0 && ` · ${h.varianten.join(", ")}`}
                  </span>
                </div>

                <div className="mb-5">
                  <Eintragen h={h} heute={heute} />
                </div>

                <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Diese Woche"
                      value={h.zielProWoche > 0
                        ? `${h.dieseWoche} / ${h.zielProWoche}`
                        : String(h.dieseWoche)}
                      sub={h.wocheNachVariante.length > 0
                        ? h.wocheNachVariante
                            .map((v) => `${v.anzahl}× ${v.variante}`).join(" · ")
                        : undefined}
                      tone={h.zielProWoche > 0 && h.dieseWoche >= h.zielProWoche
                        ? "good" : "neutral"} />
                    <Stat label="Letzte 30 Tage" value={String(h.dreissigTage)} />
                    <Stat label="Am Stück" value={String(h.streak)}
                      sub={h.streak === 1 ? "Tag" : "Tage"} />
                    <Stat label="Insgesamt" value={String(h.gesamt)}
                      sub="Einheiten" />
                  </div>

                  <div className="sm:w-64">
                    <GewohnheitenRaster h={h} />
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
