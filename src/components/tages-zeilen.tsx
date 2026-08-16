import Link from "next/link";
import { ladeRueckblicke } from "@/lib/supabase/tagesrueckblick-db";
import { hatInhalt } from "@/lib/tagesrueckblick";
import { addDays, dayNameShort } from "@/lib/time";
import { Card, CardTitle, Empty } from "@/components/ui";

/**
 * Die Tagesrückblicke dieser Woche, gesammelt.
 *
 * Der Wochenrückblick fragt „wie war die Woche" — und die ehrlichste Antwort
 * darauf steht schon da: sieben Mal drei Zeilen, jeweils am Abend
 * geschrieben, als die Erinnerung noch frisch war. Sonntags aus dem
 * Gedächtnis zu rekonstruieren, was am Dienstag war, liefert nur die
 * Geschichte, die man sich inzwischen zurechtgelegt hat.
 */
export async function TagesZeilen({ woche }: { woche: string }) {
  const bis = addDays(woche, 6);
  const eintraege = (await ladeRueckblicke(woche, bis)).filter(hatInhalt);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Die Tage dieser Woche</CardTitle>
        <span className="text-xs text-ink-muted">{eintraege.length} von 7 festgehalten</span>
      </div>

      {eintraege.length === 0 ? (
        <Empty>
          Für diese Woche steht kein Tagesrückblick.{" "}
          <Link href="/rueckblick/heute" className="text-accent-soft hover:underline">
            Heute anfangen
          </Link>{" "}
          — drei Zeilen am Abend, und der Wochenrückblick schreibt sich fast von selbst.
        </Empty>
      ) : (
        <ul className="space-y-2.5">
          {eintraege.map((e) => (
            <li key={e.datum} className="rounded-xl bg-sand/50 px-3 py-2.5">
              <Link href={`/rueckblick/heute?t=${e.datum}`}
                className="mb-1 flex items-baseline gap-2 text-xs">
                <span className="font-medium text-ink">{dayNameShort(e.datum)}</span>
                <span className="tabular text-ink-faint">{e.datum.slice(8, 10)}.{e.datum.slice(5, 7)}.</span>
              </Link>
              <div className="space-y-0.5 text-xs leading-relaxed">
                {e.erreicht && (
                  <p className="text-ink-soft">
                    <span className="text-good-bright">✓</span> {e.erreicht}
                  </p>
                )}
                {e.liegengeblieben && (
                  <p className="text-ink-muted">
                    <span className="text-accent">○</span> {e.liegengeblieben}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
