import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Faelliges } from "@/components/faelliges";
import { WochenzielListe } from "@/components/wochenziel-liste";
import { AbgleichListe } from "@/components/abgleich-liste";
import { deleteWeeklyReview } from "@/lib/actions";
import {
  wochenrueckblickFesthalten, wochenrueckblickAendern,
} from "@/lib/wochenrueckblick-actions";
import { rueckblickSpeichern, rueckblickLoeschen } from "@/lib/tagesrueckblick-actions";
import {
  ladeRueckblick, ladeTageMitRueckblick, ladeErledigt, ladeGruende,
  RUECKBLICK_SQL, GRUENDE_SQL,
} from "@/lib/supabase/tagesrueckblick-db";
import {
  FRAGEN, LEER, MAX_ZEICHEN, ANZAHL_FRAGEN, beantwortet, hatInhalt, serie,
} from "@/lib/tagesrueckblick";
import { baueAbgleich, abgleichStand } from "@/lib/abgleich";
import { wochenpaar, MAX_ZIELE } from "@/lib/wochenrueckblick";
import { ladeWochenziele, WOCHENZIELE_SQL } from "@/lib/wochenziele";
import { Button, Card, CardTitle, Label, Stat, Badge, Empty, cx, inputClass } from "@/components/ui";
import { weekStart as toWeekStart, addDays, weekLabel, heuteISO, dayName } from "@/lib/time";
import { createGymClient, gymConfigured } from "@/lib/supabase/gym";
import { createTradingClient } from "@/lib/supabase/trading";
import type { WeeklyReview } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Rückblick — Tag und Woche auf einer Seite.
 *
 * **Umgebaut am 24.08.2026.** Vorher liess sich hier durch alle Wochen
 * blättern, und wer die Seite öffnete, fand das Formular bereits
 * vollgeschrieben — mit dem, was in der Woche davor eingetragen worden war.
 * Ein Rückblick, der schon Text enthält, ist keiner mehr: man liest ihn
 * durch, nickt und ändert nichts.
 *
 * Drei Regeln gelten jetzt:
 *
 *   1. Eine neue Woche ist LEER. Keine Übernahme, kein Vorschlag — auch nicht
 *      aus Trainingstagen und Backtest-Trades. Die standen vorher als fertiger
 *      Satz im Feld „Was lief gut?" und beantworteten die Frage, bevor sie
 *      gestellt war. Die Zahlen stehen weiter oben als Kennzahl, wo sie
 *      hingehören.
 *   2. Festgehalten ist abgeschlossen. Danach ist das Formular zu.
 *   3. Geändert wird nur im Verlauf — ein bewusster Griff, kein Nebeneffekt
 *      der Navigation.
 *
 * Welche Woche dran ist, entscheidet `wochenpaar()`: am Wochenende die
 * endende Woche, Montag bis Freitag die davor als Nachholfenster. Ziele
 * gelten immer für die Woche danach.
 *
 * Beim Tag gilt derselbe Gedanke eine Ebene tiefer: statt „Was habe ich
 * erreicht?" steht der Abgleich — die Zeilen von gestern Abend, einzeln
 * abgefragt.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function RueckblickPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const heute = heuteISO();
  const paar = wochenpaar(heute);
  const week = paar.rueckblick;
  const weekEnd = addDays(week, 6);

  const tag = sp.t && ISO.test(sp.t) && sp.t <= heute ? sp.t : heute;
  // Der Abgleich prüft den Vorsatz vom Vorabend des gewählten Tages.
  const vortag = addDays(tag, -1);

  const supabase = await createClient();

  const [
    { data: existing }, { data: history },
    { rueckblick, tabelleFehlt }, tage,
    zieleRueckblickwoche, zieleZielwoche,
    vortagsRueckblick, erledigt, { gruende, spalteFehlt },
  ] = await Promise.all([
    supabase.from("weekly_reviews").select("*").eq("week_start", week).maybeSingle(),
    supabase.from("weekly_reviews").select("*")
      .order("week_start", { ascending: false }).limit(12),
    ladeRueckblick(tag),
    ladeTageMitRueckblick(addDays(heute, -90)),
    // Was für die Rückblickwoche vorgenommen war — der Massstab des Rückblicks.
    ladeWochenziele(week),
    // Was für die kommende Woche steht — entsteht beim Festhalten.
    ladeWochenziele(paar.ziele),
    ladeRueckblick(vortag),
    ladeErledigt(vortag),
    ladeGruende(vortag),
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

  const punkte = baueAbgleich(vortagsRueckblick.rueckblick?.morgen ?? "", erledigt, gruende);
  const stand = abgleichStand(punkte);

  const zielErledigt = zieleRueckblickwoche.ziele.filter((z) => z.erledigtAm).length;

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
          {n > 0 && (
            <Badge tone={n === ANZAHL_FRAGEN ? "good" : "neutral"}>
              {n} von {ANZAHL_FRAGEN}
            </Badge>
          )}
          {strecke > 1 && <Badge tone="good">{strecke} Tage am Stück</Badge>}
        </div>

        {/* Der Abgleich steht VOR den Fragen. Wer zuerst aufschreibt, was
            morgen dran ist, hat die Zeilen von gestern schon überblättert —
            und genau die sind der unangenehme Teil. */}
        {punkte.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-medium text-ink">
                Das hattest du dir für {istHeute ? "heute" : dayName(tag).toLowerCase()} vorgenommen
              </h3>
              <span className="tabular text-xs text-ink-faint">
                {stand.erledigt} von {stand.gesamt}
              </span>
              {stand.vollstaendig && <Badge tone="good">durchgegangen</Badge>}
            </div>

            <AbgleichListe datum={vortag} punkte={punkte} />

            {stand.offen > 0 && (
              <p className="mt-2 text-[11px] text-ink-faint">
                Zu {stand.offen} {stand.offen === 1 ? "Punkt" : "Punkten"} steht noch
                nichts. Erledigt, nicht geschafft oder auf morgen — irgendetwas
                davon stimmt immer.
              </p>
            )}
          </div>
        )}

        <form action={rueckblickSpeichern} className="space-y-4">
          <input type="hidden" name="datum" value={tag} />
          {/* Der Altbestand darf beim Speichern nicht verlorengehen: gefragt
              wird nach `erreicht` nicht mehr, gespeichert wird es weiter. */}
          <input type="hidden" name="erreicht" value={werte.erreicht} />

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
              <Link key={t} href={`/rueckblick?t=${t}#heute`} title={t}
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

      {/* -------------------------------------------------------- Woche */}
      <Card area="zeit">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Wochenrückblick</CardTitle>
          <span className="text-sm text-ink-muted">{weekLabel(week)}</span>
          {paar.amWochenende
            ? <Badge tone="neutral">die Woche, die endet</Badge>
            : <Badge tone="warn">nachgeholt — noch bis Freitag</Badge>}
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <Stat label="Trainingstage" value={trainingstage ?? "—"}
            tone={trainingstage !== null && trainingstage >= 4 ? "good" : "neutral"}
            sub="Kraft und Ausdauer zusammen" />
          <Stat label="Backtest-Trades" value={backtestNeu ?? "—"}
            tone={backtestNeu !== null && backtestNeu >= 24 ? "good" : "neutral"}
            sub="dokumentiert in dieser Woche" />
        </div>

        {/* Der Massstab zuerst: was stand für diese Woche an? Ohne das ist
            „Was lief gut?" eine Frage ins Blaue. */}
        {zieleRueckblickwoche.ziele.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-medium text-ink">Das hattest du dir vorgenommen</h3>
              <span className="tabular text-xs text-ink-faint">
                {zielErledigt} von {zieleRueckblickwoche.ziele.length}
              </span>
            </div>
            <WochenzielListe ziele={zieleRueckblickwoche.ziele} weekStart={week} />
          </div>
        )}

        {review ? (
          <div className="space-y-3 border-t border-line/70 pt-4">
            <p className="text-sm text-ink-soft">
              Festgehalten. <span className="text-ink-faint">
                Ändern geht nur noch unten im Verlauf — was eingetragen ist,
                bleibt stehen.
              </span>
            </p>
            {review.went_well && (
              <div>
                <div className="text-xs text-ink-faint">Lief gut</div>
                <p className="whitespace-pre-line text-sm text-ink">{review.went_well}</p>
              </div>
            )}
            {review.went_poorly && (
              <div>
                <div className="text-xs text-ink-faint">Lief nicht</div>
                <p className="whitespace-pre-line text-sm text-ink">{review.went_poorly}</p>
              </div>
            )}

            <div className="border-t border-line/70 pt-3">
              <div className="mb-2 text-xs text-ink-faint">
                Vorgenommen für {weekLabel(paar.ziele)}
              </div>
              {zieleZielwoche.ziele.length === 0 ? (
                <p className="text-sm text-ink-muted">Nichts gesetzt.</p>
              ) : (
                <WochenzielListe ziele={zieleZielwoche.ziele} weekStart={paar.ziele} />
              )}
            </div>
          </div>
        ) : (
          <form action={wochenrueckblickFesthalten}
            className="space-y-4 border-t border-line/70 pt-4">
            <input type="hidden" name="week_start" value={week} />
            <input type="hidden" name="ziel_woche" value={paar.ziele} />

            <div>
              <Label htmlFor="went_well">Was lief gut?</Label>
              <textarea id="went_well" name="went_well" rows={2}
                className={`${inputClass} resize-y`}
                placeholder="Konkret — nicht „war ok“" />
            </div>
            <div>
              <Label htmlFor="went_poorly">Was nicht?</Label>
              <textarea id="went_poorly" name="went_poorly" rows={2}
                className={`${inputClass} resize-y`} />
            </div>
            <div>
              <Label htmlFor="ziele">
                Was nimmst du dir für {weekLabel(paar.ziele)} vor?
              </Label>
              <p className="mb-1.5 text-xs text-ink-faint">
                Eine Zeile, ein Ziel. Das werden die Wochenziele — sie stehen
                dann die ganze Woche auf der Startseite. Zwei oder drei reichen;
                mehr als {MAX_ZIELE} werden nicht übernommen.
              </p>
              <textarea id="ziele" name="ziele" rows={3}
                className={`${inputClass} resize-y`}
                placeholder={"24 Backtest-Trades durchziehen\n4x Kraft"} />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit">Festhalten</Button>
              <span className="text-[11px] text-ink-faint">
                Danach ist die Woche zu.
              </span>
            </div>
          </form>
        )}
      </Card>

      {/* ------------------------------------------------------- Verlauf */}
      <Card flat>
        <CardTitle>Verlauf</CardTitle>
        <p className="mb-3 text-xs text-ink-faint">
          Der einzige Ort, an dem eine festgehaltene Woche noch geändert wird.
        </p>
        {past.length === 0 ? (
          <Empty>Noch kein Rückblick festgehalten.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {past.map((r) => (
              <li key={r.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 list-none">
                    <span className="text-sm font-medium text-ink">{weekLabel(r.week_start)}</span>
                    <span className="text-xs text-ink-faint">bearbeiten</span>
                  </summary>

                  {r.next_week_focus && (
                    <p className="mt-1.5 whitespace-pre-line text-sm text-ink-soft">
                      → {r.next_week_focus}
                    </p>
                  )}

                  <form action={wochenrueckblickAendern} className="mt-3 space-y-2.5">
                    <input type="hidden" name="id" value={r.id} />
                    <textarea name="went_well" rows={2} defaultValue={r.went_well ?? ""}
                      placeholder="Was lief gut?" className={`${inputClass} resize-y`} />
                    <textarea name="went_poorly" rows={2} defaultValue={r.went_poorly ?? ""}
                      placeholder="Was nicht?" className={`${inputClass} resize-y`} />
                    <textarea name="next_week_focus" rows={2} defaultValue={r.next_week_focus ?? ""}
                      placeholder="Vorgenommen" className={`${inputClass} resize-y`} />
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Button type="submit" variant="ghost">Ändern</Button>
                      <Button type="submit" variant="ghost" formAction={deleteWeeklyReview}>
                        Löschen
                      </Button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(tabelleFehlt || spalteFehlt || zieleRueckblickwoche.tabelleFehlt) && (
        <Card>
          <CardTitle>Ein Schritt fehlt noch</CardTitle>
          <p className="text-sm text-ink-soft">
            Einmal im Supabase-SQL-Editor der KerimOS-Datenbank ausführen — bis
            dahin geht das Speichern nicht.
          </p>
          <pre className="mt-2.5 overflow-x-auto rounded-xl bg-sand/70 p-3 text-[11.5px] leading-relaxed text-ink-soft">
            <code>{[
              tabelleFehlt ? RUECKBLICK_SQL : null,
              spalteFehlt ? GRUENDE_SQL : null,
              zieleRueckblickwoche.tabelleFehlt ? WOCHENZIELE_SQL : null,
            ].filter(Boolean).join("\n\n")}</code>
          </pre>
        </Card>
      )}
    </div>
  );
}
