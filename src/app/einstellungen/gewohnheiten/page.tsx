import Link from "next/link";
import { ladeGewohnheiten, GEWOHNHEITEN_SQL } from "@/lib/gewohnheiten";
import {
  gewohnheitAnlegen, gewohnheitAendern, gewohnheitArchivieren,
} from "@/lib/gewohnheiten-actions";
import { GewohnheitenFelder } from "@/components/gewohnheiten-felder";
import { Button, Card, CardTitle, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Gewohnheiten einrichten — anlegen, ändern, archivieren.
 *
 * Stand bis zum 09.09.2026 unter `/gewohnheiten` in einem aufklappbaren
 * „Ändern" je Karte. Dort war es im Weg: die Seite zeigt den Verlauf, und
 * zwischen Zahlen und Raster stand ein Formular, das man dreimal im Jahr
 * benutzt. Jetzt bleibt der Verlauf Verlauf, und die Einrichtung steht bei
 * allem anderen, was man einmal einrichtet.
 */
export default async function GewohnheitenEinstellungen() {
  const { gewohnheiten, tabelleFehlt } = await ladeGewohnheiten();

  if (tabelleFehlt) {
    return (
      <Card>
        <CardTitle>Tabellen fehlen noch</CardTitle>
        <p className="text-sm text-ink-muted">
          Führe <code className="rounded bg-sand px-1 py-0.5 text-xs">
            supabase/migrations/19_habits.sql
          </code> und danach <code className="rounded bg-sand px-1 py-0.5 text-xs">
            20_habits_varianten.sql
          </code> im SQL-Editor aus. Beides zusammen ergibt den Stand unten —
          zum Kopieren:
        </p>
        <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-sand p-4 text-xs
                        leading-relaxed text-ink-soft">
          {GEWOHNHEITEN_SQL}
        </pre>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Deine Gewohnheiten</CardTitle>
          <Link href="/gewohnheiten" className="text-xs text-accent-soft hover:underline">
            Verlauf ansehen ↗
          </Link>
        </div>

        {gewohnheiten.length === 0 ? (
          <Empty>
            Noch keine Gewohnheit. Leg unten die erste an — Gym ist der
            naheliegende Anfang.
          </Empty>
        ) : (
          <ul className="space-y-4">
            {gewohnheiten.map((h) => (
              <li key={h.id} className="border-t border-line/50 pt-4 first:border-0 first:pt-0">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display text-base font-bold text-ink">
                    {h.icon && <span className="mr-2">{h.icon}</span>}
                    {h.name}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {h.gesamt} {h.gesamt === 1 ? "Eintrag" : "Einträge"}
                  </span>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <form action={gewohnheitAendern}
                    className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={h.id} />
                    <GewohnheitenFelder h={h} suffix={h.id} />
                    <Button type="submit" variant="ghost">Speichern</Button>
                  </form>

                  <form action={gewohnheitArchivieren}>
                    <input type="hidden" name="id" value={h.id} />
                    <Button type="submit" variant="danger">Archivieren</Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        {gewohnheiten.length > 0 && (
          <p className="mt-4 text-[11px] text-ink-faint">
            Archivieren blendet eine Gewohnheit aus, löscht aber keinen
            einzigen eingetragenen Tag.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>Neue Gewohnheit</CardTitle>
        <form action={gewohnheitAnlegen} className="flex flex-wrap items-end gap-3">
          <GewohnheitenFelder h={null} suffix="neu" />
          <Button type="submit">Anlegen</Button>
        </form>
        <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-ink-faint">
          <strong className="text-ink-muted">Mit Datum</strong> heisst: beim
          Eintragen fragt ein Dialog erst nach dem Tag — für alles, was man
          nachträgt statt im Moment abzuhaken, etwa ein Training. Ohne Datum
          genügt ein Druck und der Tag ist heute.{" "}
          <strong className="text-ink-muted">Varianten</strong> unterteilen
          eine Gewohnheit (beim Gym: Push, Pull, Ausdauer). Sie erscheinen im
          selben Dialog, und mehrere an einem Tag sind erlaubt.{" "}
          <strong className="text-ink-muted">Steht bei</strong> entscheidet, ob
          sie auf der Startseite oder im Gym-Bereich auftaucht.
        </p>
      </Card>
    </>
  );
}
