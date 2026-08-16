import Link from "next/link";
import {
  ladeRueckblick, ladeTageMitRueckblick, RUECKBLICK_SQL,
} from "@/lib/supabase/tagesrueckblick-db";
import { rueckblickSpeichern, rueckblickLoeschen } from "@/lib/tagesrueckblick-actions";
import { FRAGEN, LEER, MAX_ZEICHEN, beantwortet, hatInhalt, serie } from "@/lib/tagesrueckblick";
import { heuteISO, addDays, dayName } from "@/lib/time";
import { Card, CardTitle, Button, Badge, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Der Tagesrückblick — drei Zeilen, jeden Abend.
 *
 * Ersetzt die minutengenaue Zeiterfassung. Die hat zwei Fragen beantworten
 * sollen: „was mache ich eigentlich?" und „wo habe ich neben der Arbeit
 * Platz?". Die erste beantwortet dieser Rückblick besser und in einem
 * Zwanzigstel der Zeit; die zweite steht in der Wochenansicht.
 *
 * Erfassen kostete jeden Tag Minuten und wurde deshalb nicht gemacht. Drei
 * Sätze am Abend kosten eine Minute — und sagen mehr über einen Tag als eine
 * lückenlose Tabelle, die niemand ausfüllt.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function TagesrueckblickPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const heute = heuteISO();
  const datum = sp.t && ISO.test(sp.t) && sp.t <= heute ? sp.t : heute;

  const [{ rueckblick, tabelleFehlt }, tage] = await Promise.all([
    ladeRueckblick(datum),
    ladeTageMitRueckblick(addDays(heute, -90)),
  ]);

  const werte = rueckblick ?? { datum, ...LEER };
  const n = beantwortet(werte);
  const strecke = serie(tage, heute);
  const istHeute = datum === heute;

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-bold text-ink">
            {istHeute ? "Heute" : dayName(datum)}
          </h1>
          <span className="tabular text-sm text-ink-muted">{datum}</span>
          {n > 0 && <Badge tone={n === 3 ? "good" : "neutral"}>{n} von 3</Badge>}
          {strecke > 1 && <Badge tone="good">{strecke} Tage am Stück</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Drei Zeilen, eine Minute. Nicht um es zu dokumentieren, sondern um zu
          merken, was aus dem Tag geworden ist.
        </p>
      </div>

      <Card>
        <form action={rueckblickSpeichern} className="space-y-4">
          <input type="hidden" name="datum" value={datum} />

          {FRAGEN.map((frage) => (
            <div key={frage.feld}>
              <label htmlFor={frage.feld}
                className="mb-1 block text-sm font-medium text-ink">
                {frage.titel}
              </label>
              <p className="mb-1.5 text-xs text-ink-faint">{frage.hinweis}</p>
              <textarea id={frage.feld} name={frage.feld} rows={2}
                maxLength={MAX_ZEICHEN}
                defaultValue={werte[frage.feld]}
                className={`${inputClass} resize-y`} />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2.5 border-t border-line/70 pt-4">
            <Button type="submit">Speichern</Button>
            {hatInhalt(werte) && (
              <Button type="submit" variant="ghost" formAction={rueckblickLoeschen}>
                Löschen
              </Button>
            )}
            <span className="ml-auto text-xs text-ink-faint">
              Höchstens {MAX_ZEICHEN} Zeichen je Feld — mehr gehört in den{" "}
              <Link href="/rueckblick" className="text-accent-soft hover:underline">
                Wochenrückblick
              </Link>.
            </span>
          </div>
        </form>
      </Card>

      <Card>
        <CardTitle>Letzte Tage</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 14 }, (_, i) => addDays(heute, -13 + i)).map((tag) => {
            const gesetzt = tage.includes(tag);
            const aktiv = tag === datum;
            return (
              <Link key={tag} href={`/rueckblick/heute?t=${tag}`}
                title={tag}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs transition ${
                  aktiv ? "bg-accent font-medium text-ink-on"
                    : gesetzt ? "bg-good-tint text-good-bright"
                      : "bg-sand text-ink-faint hover:text-ink-muted"}`}>
                {tag.slice(8, 10)}
              </Link>
            );
          })}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          Grün heisst: an dem Tag steht etwas. Eine Lücke ist kein Drama — zwei
          Wochen Lücke heissen, dass die Erinnerung um 21:00 nicht funktioniert.
        </p>
      </Card>

      {tabelleFehlt && (
        <Card>
          <CardTitle>Ein Schritt fehlt noch</CardTitle>
          <p className="text-sm text-ink-soft">
            Die Tabelle <code className="rounded bg-sand px-1">day_review</code> gibt
            es noch nicht. Einmal im Supabase-SQL-Editor der KerimOS-Datenbank
            ausführen — bis dahin lässt sich nichts speichern:
          </p>
          <pre className="mt-2.5 overflow-x-auto rounded-xl bg-sand/70 p-3 text-[11.5px] leading-relaxed text-ink-soft">
            <code>{RUECKBLICK_SQL}</code>
          </pre>
        </Card>
      )}
    </div>
  );
}
