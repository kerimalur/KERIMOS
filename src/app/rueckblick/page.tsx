import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Faelliges } from "@/components/faelliges";
import { WochenzielListe } from "@/components/wochenziel-liste";
import { saveWeeklyReview, deleteWeeklyReview } from "@/lib/actions";
import { rueckblickSpeichern, rueckblickLoeschen } from "@/lib/tagesrueckblick-actions";
import { ladeRueckblick, ladeTageMitRueckblick, RUECKBLICK_SQL } from "@/lib/supabase/tagesrueckblick-db";
import { FRAGEN, LEER, MAX_ZEICHEN, beantwortet, hatInhalt, serie } from "@/lib/tagesrueckblick";
import { ladeWochenziele, WOCHENZIELE_SQL } from "@/lib/wochenziele";
import { Button, Card, CardTitle, Label, Stat, Badge, Empty, cx, inputClass } from "@/components/ui";
import {
  weekStart as toWeekStart, addDays, weekLabel, heuteISO, dayName,
} from "@/lib/time";
import { createGymClient, gymConfigured } from "@/lib/supabase/gym";
import { createTradingClient } from "@/lib/supabase/trading";
import type { WeeklyReview } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Rückblick — Tag und Woche auf einer Seite.
 *
 * Vorher waren es zwei: `/rueckblick/heute` für die drei Abendfragen und
 * `/rueckblick` für die Woche. Getrennt sinnvoll, in der Praxis nicht — man
 * öffnet sonntags beides hintereinander, und unter der Woche fand niemand die
 * Unterseite. Jetzt steht der Tag oben (weil täglich), die Woche darunter.
 *
 * **Die Zeiterfassung ist raus.** `v_daily_time`, `v_weekly_buckets` und der
 * Runway hingen hier; erfasst wird seit dem Zuschnitt vom 21.08. nichts mehr,
 * also standen dort dauerhaft Nullen. Eine Kennzahl, die immer null ist, ist
 * keine Kennzahl — sie bringt einem nur bei, die Karte zu überblättern.
 *
 * Was bleibt und was neu ist: Trainingstage und Backtest-Trades kommen aus den
 * Fachdatenbanken und zählen sich selbst. Dazu die **Wochenziele** — die zwei,
 * drei Dinge, die diese Woche zählen. Die stehen die ganze Woche auf der
 * Startseite, gesetzt werden sie hier.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function RueckblickPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const heute = heuteISO();
  const laufende = toWeekStart(heute);

  // Standard ist die eben vergangene Woche — sonntags schaut man zurück.
  const week = ISO.test(sp.w ?? "") ? toWeekStart(sp.w!) : addDays(laufende, -7);
  const weekEnd = addDays(week, 6);
  const tag = sp.t && ISO.test(sp.t) && sp.t <= heute ? sp.t : heute;

  const supabase = await createClient();

  const [
    { data: existing }, { data: history },
    { rueckblick, tabelleFehlt }, tage, zielListe,
  ] = await Promise.all([
    supabase.from("weekly_reviews").select("*").eq("week_start", week).maybeSingle(),
    supabase.from("weekly_reviews").select("*")
      .order("week_start", { ascending: false }).limit(12),
    ladeRueckblick(tag),
    ladeTageMitRueckblick(addDays(heute, -90)),
    // Ziele immer für die LAUFENDE Woche, auch wenn man einen alten Rückblick
    // liest: Ziele setzt man nach vorne, nicht rückwirkend.
    ladeWochenziele(laufende),
  ]);

  // Trainingstage und Backtest-Trades liegen in eigenen Datenbanken.
  const trainingstage = await (async () => {
    if (!gymConfigured()) return null;
    const gym = createGymClient();
    const { data } = await gym!.from("v_exercise_progress")
      .select("day").gte("day", week).lte("day", weekEnd);
    return new Set((data ?? []).map((r) => String(r.day))).size;
  })();

  const backtestNeu = await (async () => {
    const trading = createTradingClient();
    if (!trading) return null;
    const { data } = await trading.from("backtest_sessions").select("trades");
    const alle = (data ?? []).flatMap(
      (s) => (s.trades ?? []) as { date?: string; result?: string }[],
    );
    return alle.filter(
      (t) => t.date && t.date >= week && t.date <= weekEnd && t.result,
    ).length;
  })();

  const review = (existing ?? null) as WeeklyReview | null;
  const past = (history ?? []) as WeeklyReview[];

  const werte = rueckblick ?? { datum: tag, ...LEER };
  const n = beantwortet(werte);
  const strecke = serie(tage, heute);
  const istHeute = tag === heute;

  // Vorbefüllung nur beim ersten Schreiben, nie beim Bearbeiten: Startpunkt
  // zum Anpassen, kein fertiger Text.
  let wellVorschlag = "";
  if (!review) {
    const gut: string[] = [];
    if (trainingstage !== null && trainingstage > 0) gut.push(`${trainingstage} Trainingstage`);
    if (backtestNeu) gut.push(`${backtestNeu} Backtest-Trades dokumentiert`);
    wellVorschlag = gut.join(" · ");
  }

  const zieleErledigt = zielListe.ziele.filter((z) => z.erledigtAm).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Rückblick</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Oben der Tag, unten die Woche. Nicht um es zu dokumentieren, sondern
          um zu merken, was daraus geworden ist.
        </p>
      </div>

      {/* Was fällig ist, steht VOR dem Rückblick: ein Rückblick, der nur
          zurückschaut, lässt genau das liegen, was gerade kippt. */}
      <Faelliges />

      {/* ------------------------------------------------------------- Tag */}
      <Card id="heute">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">{istHeute ? "Heute" : dayName(tag)}</CardTitle>
          <span className="tabular text-sm text-ink-muted">{tag}</span>
          {n > 0 && <Badge tone={n === 3 ? "good" : "neutral"}>{n} von 3</Badge>}
          {strecke > 1 && <Badge tone="good">{strecke} Tage am Stück</Badge>}
        </div>

        <form action={rueckblickSpeichern} className="space-y-4">
          <input type="hidden" name="datum" value={tag} />

          {FRAGEN.map((frage) => (
            <div key={frage.feld}>
              <label htmlFor={frage.feld} className="mb-1 block text-sm font-medium text-ink">
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
            <Button type="submit">Tag speichern</Button>
            {hatInhalt(werte) && (
              <Button type="submit" variant="ghost" formAction={rueckblickLoeschen}>
                Löschen
              </Button>
            )}
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line/70 pt-4">
          {Array.from({ length: 14 }, (_, i) => addDays(heute, -13 + i)).map((t) => {
            const gesetzt = tage.includes(t);
            const aktiv = t === tag;
            return (
              <Link key={t} href={`/rueckblick?t=${t}&w=${week}#heute`} title={t}
                className={cx("flex h-9 w-9 items-center justify-center rounded-lg text-xs transition",
                  aktiv ? "bg-accent font-medium text-ink-on"
                    : gesetzt ? "bg-good-tint text-good-bright"
                      : "bg-sand text-ink-faint hover:text-ink-muted")}>
                {t.slice(8, 10)}
              </Link>
            );
          })}
        </div>
      </Card>

      {/* --------------------------------------------------------- Ziele */}
      <Card area="zeit">
        <div className="mb-4 flex flex-wrap items-baseline gap-2">
          <CardTitle className="mb-0">Ziele diese Woche</CardTitle>
          <span className="text-[11px] text-ink-faint">
            {weekLabel(laufende)}
            {zielListe.ziele.length > 0 && ` · ${zieleErledigt} von ${zielListe.ziele.length}`}
          </span>
        </div>
        <WochenzielListe ziele={zielListe.ziele} weekStart={laufende} mitFormular />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Diese Ziele stehen die ganze Woche auf der Startseite und lassen sich
          dort abhaken. Zwei oder drei reichen — was auf einer Liste von zehn
          steht, ist kein Ziel mehr, sondern eine Aufgabe.
        </p>
      </Card>

      {/* -------------------------------------------------------- Woche */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="mb-0">Wochenrückblick</CardTitle>
          <div className="flex items-center gap-2">
            <Link href={`/rueckblick?w=${addDays(week, -7)}`}
              className="rounded-lg border border-line px-3 py-1 text-sm text-ink-soft transition hover:border-line-strong">
              ←
            </Link>
            <span className="min-w-32 text-center text-sm text-ink">{weekLabel(week)}</span>
            <Link href={`/rueckblick?w=${addDays(week, 7)}`}
              className={cx("rounded-lg border border-line px-3 py-1 text-sm transition",
                week >= laufende ? "pointer-events-none text-ink-faint opacity-40"
                  : "text-ink-soft hover:border-line-strong")}>
              →
            </Link>
          </div>
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <Stat label="Trainingstage" value={trainingstage ?? "—"}
            tone={trainingstage !== null && trainingstage >= 4 ? "good" : "neutral"}
            sub="Kraft und Ausdauer zusammen" />
          <Stat label="Backtest-Trades" value={backtestNeu ?? "—"}
            tone={backtestNeu !== null && backtestNeu >= 24 ? "good" : "neutral"}
            sub="dokumentiert in dieser Woche" />
        </div>

        <form action={saveWeeklyReview} className="space-y-4">
          <input type="hidden" name="week_start" value={week} />

          <div>
            <Label htmlFor="went_well">Was lief gut?</Label>
            <textarea id="went_well" name="went_well" rows={2}
              defaultValue={review?.went_well ?? wellVorschlag}
              className={`${inputClass} resize-y`}
              placeholder="Konkret — nicht „war ok“" />
          </div>
          <div>
            <Label htmlFor="went_poorly">Was nicht?</Label>
            <textarea id="went_poorly" name="went_poorly" rows={2}
              defaultValue={review?.went_poorly ?? ""}
              className={`${inputClass} resize-y`} />
          </div>
          <div>
            <Label htmlFor="next_week_focus">Worauf kommt es nächste Woche an?</Label>
            <textarea id="next_week_focus" name="next_week_focus" rows={2}
              defaultValue={review?.next_week_focus ?? ""}
              className={`${inputClass} resize-y`}
              placeholder="Eine Sache, nicht fünf" />
          </div>
          <Button type="submit">{review ? "Aktualisieren" : "Festhalten"}</Button>
        </form>
      </Card>

      <Card flat>
        <CardTitle>Verlauf</CardTitle>
        {past.length === 0 ? (
          <Empty>Noch kein Rückblick festgehalten.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {past.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/rueckblick?w=${r.week_start}`}
                    className="text-sm font-medium text-ink transition hover:text-accent-soft">
                    {weekLabel(r.week_start)}
                  </Link>
                  <form action={deleteWeeklyReview} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-ink-faint transition hover:text-bad">✕</button>
                  </form>
                </div>
                {r.next_week_focus && (
                  <p className="mt-1 text-sm text-ink-soft">→ {r.next_week_focus}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(tabelleFehlt || zielListe.tabelleFehlt) && (
        <Card>
          <CardTitle>Ein Schritt fehlt noch</CardTitle>
          <p className="text-sm text-ink-soft">
            Einmal im Supabase-SQL-Editor der KerimOS-Datenbank ausführen — bis
            dahin lässt sich {tabelleFehlt && "der Tagesrückblick"}
            {tabelleFehlt && zielListe.tabelleFehlt && " und "}
            {zielListe.tabelleFehlt && "die Wochenziele"} nicht speichern:
          </p>
          <pre className="mt-2.5 overflow-x-auto rounded-xl bg-sand/70 p-3 text-[11.5px] leading-relaxed text-ink-soft">
            <code>{[
              tabelleFehlt ? RUECKBLICK_SQL : null,
              zielListe.tabelleFehlt ? WOCHENZIELE_SQL : null,
            ].filter(Boolean).join("\n\n")}</code>
          </pre>
        </Card>
      )}
    </div>
  );
}
