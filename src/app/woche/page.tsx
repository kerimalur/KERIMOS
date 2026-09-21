import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { WochenzielListe } from "@/components/wochenziel-liste";
import { TrainingKarte } from "@/components/woche/training-karte";
import { EssenKarte } from "@/components/woche/essen-karte";
import { GewichtKarte } from "@/components/woche/gewicht-karte";
import { VorhabenKarte } from "@/components/woche/vorhaben-karte";
import { ladeWoche } from "@/lib/woche";
import { istIsoDatum } from "@/lib/woche-typen";
import { addDays, heuteISO, weekLabel, weekStart as toWeekStart } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Woche — der Organizer (seit 21.09.2026).
 *
 * Ersetzt Gym und Zeit. Was Kerim ohnehin automatisch macht — trainieren,
 * nach Plan essen, wiegen — wird hier nur noch angetippt, damit sichtbar
 * bleibt, ob die Woche läuft. Dazu die Wochenziele und die Liste der
 * Vorhaben für freie Zeit.
 *
 * Was hier bewusst NICHT passiert: Dauer erfassen, Sätze loggen, Tage
 * bewerten. Aufgaben stehen auf dem Board im Zimmer und in Google Tasks,
 * der Rückblick wird von Hand geschrieben.
 */
export default async function WochePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; fehler?: string }>;
}) {
  const sp = await searchParams;
  const heute = heuteISO();
  const aktuelle = toWeekStart(heute);
  const gewaehlt = sp.w && istIsoDatum(sp.w) ? toWeekStart(sp.w) : aktuelle;
  // Nicht in die Zukunft blättern — dort gibt es nichts einzutragen.
  const weekStart = gewaehlt > aktuelle ? aktuelle : gewaehlt;
  const d = await ladeWoche(weekStart);

  const vorher = addDays(weekStart, -7);
  const nachher = addDays(weekStart, 7);
  const istAktuell = weekStart === aktuelle;

  return (
    <div className="py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
            ← Startseite
          </Link>
          <h1 className="font-display mt-1 text-2xl font-bold leading-tight text-ink">Woche</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/woche?w=${vorher}`}
            className="rounded-lg border border-line bg-sand px-2.5 py-1 text-ink-soft
                       transition hover:text-ink">
            ←
          </Link>
          <span className="tabular min-w-32 text-center text-ink-soft">
            {istAktuell ? "Diese Woche" : weekLabel(weekStart)}
          </span>
          {!istAktuell ? (
            <Link href={nachher >= aktuelle ? "/woche" : `/woche?w=${nachher}`}
              className="rounded-lg border border-line bg-sand px-2.5 py-1 text-ink-soft
                         transition hover:text-ink">
              →
            </Link>
          ) : (
            <span className="rounded-lg border border-line/40 px-2.5 py-1 text-ink-faint">→</span>
          )}
        </div>
      </div>

      {sp.fehler && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn-tint px-4 py-2.5
                        text-sm text-ink-soft">
          {sp.fehler}
        </div>
      )}

      {d.tabelleFehlt && (
        <div className="mb-4 rounded-xl border border-bad/40 bg-bad-tint px-4 py-2.5
                        text-sm text-ink-soft">
          Die Tabellen für diesen Bereich fehlen noch. Einmal
          <code className="mx-1">supabase/migrations/25_woche.sql</code>
          im SQL-Editor des Kompass-Projekts ausführen.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <TrainingKarte d={d} />

        <Card>
          <CardTitle>Wochenziele</CardTitle>
          <WochenzielListe ziele={d.ziele} weekStart={weekStart} mitFormular />
        </Card>

        <EssenKarte d={d} />
        <GewichtKarte d={d} />

        <div className="lg:col-span-2">
          <VorhabenKarte vorhaben={d.vorhaben} />
        </div>
      </div>
    </div>
  );
}
