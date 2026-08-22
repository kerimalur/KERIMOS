import Link from "next/link";
import { ladeRueckblick, ladeErledigt } from "@/lib/supabase/tagesrueckblick-db";
import { hakeAb } from "@/lib/heute-actions";
import { zuPunkten } from "@/lib/heute-punkte";
import { Card, CardTitle, cx } from "@/components/ui";
import { heuteISO, addDays } from "@/lib/time";

/**
 * Was du dir gestern Abend für heute vorgenommen hast — zum Abhaken.
 *
 * Der Morgen-Anstoss schickt das einmal per Telegram. Eine Nachricht um sieben
 * Uhr ist um zehn weggescrollt — deshalb steht dieselbe Zeile hier den ganzen
 * Tag. Das ist der ganze Zweck: ein Vorsatz, den man abends aufschreibt und
 * tagsüber nicht mehr sieht, ist ein Datenbankeintrag und keine Absicht.
 *
 * Gelesen wird das Feld „Was ist morgen das Wichtigste?" von GESTERN. Hat
 * Kerim heute schon einen Rückblick geschrieben, gilt trotzdem der von
 * gestern — der von heute meint ja bereits morgen.
 *
 * Keine Ersatzmeldung, wenn nichts dasteht: die Karte blendet sich aus. Eine
 * Kachel „du hast gestern nichts eingetragen" wäre eine Ermahnung für einen
 * müden Abend, und davon wird der Rückblick nicht zuverlässiger.
 */

export async function HeuteWichtig() {
  const heute = heuteISO();
  const gestern = addDays(heute, -1);
  const [{ rueckblick }, erledigt] = await Promise.all([
    ladeRueckblick(gestern), ladeErledigt(gestern),
  ]);

  const punkte = zuPunkten(rueckblick?.morgen ?? "");
  const offen = rueckblick?.liegengeblieben.trim() ?? "";
  if (punkte.length === 0 && !offen) return null;

  const fertig = punkte.filter((p) => erledigt.includes(p)).length;

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Heute das Wichtigste</CardTitle>
        <span className="ml-auto flex items-baseline gap-3">
          {punkte.length > 0 && (
            <span className="tabular text-xs text-ink-faint">
              {fertig}/{punkte.length}
            </span>
          )}
          <Link href="/rueckblick/heute" className="text-xs text-accent-soft hover:underline">
            Rückblick ↗
          </Link>
        </span>
      </div>

      {punkte.length > 0 && (
        <ul className="space-y-1">
          {punkte.map((p) => {
            const ab = erledigt.includes(p);
            return (
              <li key={p}>
                {/* Ein Formular je Zeile statt einem grossen: so schickt der
                    Klick genau eine Zeile, und ein zweiter Klick nimmt den
                    Haken wieder weg. */}
                <form action={hakeAb}>
                  <input type="hidden" name="datum" value={gestern} />
                  <input type="hidden" name="zeile" value={p} />
                  <button type="submit"
                    className={cx(
                      "flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
                      "transition duration-150 ease-tactile hover:bg-sand/60 active:scale-[0.99]",
                      ab ? "text-ink-faint" : "text-ink")}>
                    <span aria-hidden
                      className={cx(
                        "mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border text-[11px]",
                        ab ? "border-good/50 bg-good-tint text-good-bright"
                          : "border-line-strong text-transparent")}>
                      ✓
                    </span>
                    <span className={ab ? "line-through decoration-ink-faint" : undefined}>
                      {p}
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {offen && (
        <p className={cx("whitespace-pre-line text-xs leading-relaxed text-ink-muted",
          punkte.length > 0 ? "mt-2 border-t border-line/50 pt-2" : "")}>
          <span className="text-ink-faint">Gestern liegengeblieben: </span>{offen}
        </p>
      )}
    </Card>
  );
}
