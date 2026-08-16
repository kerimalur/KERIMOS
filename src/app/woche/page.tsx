import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, Badge, Empty, cx } from "@/components/ui";
import { WeekNav } from "@/components/week-nav";
import { DayBar } from "@/components/day-bar";
import { chf } from "@/lib/format";
import {
  weekStart as toWeekStart, addDays, fmtMinutes, fmtHours, summarizeWeek,
  dayComposition, dayNameShort, pct, heuteISO,
} from "@/lib/time";
import {
  BUCKET_COLOR, BUCKET_LABEL, BUCKET_HINT, UNACCOUNTED_COLOR,
  type ActivityValue, type DailyTime, type WeeklyActivity, type WeeklyBucket,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WochePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const params = await searchParams;
  const current = toWeekStart(heuteISO());
  const week = /^\d{4}-\d{2}-\d{2}$/.test(params.w ?? "")
    ? toWeekStart(params.w!)
    : current;
  const weekEnd = addDays(week, 6);
  const prevWeek = addDays(week, -7);

  const supabase = await createClient();
  const [
    { data: dailyRows }, { data: prevDailyRows },
    { data: bucketRows }, { data: prevBucketRows },
    { data: activityRows }, { data: valueRows },
  ] = await Promise.all([
    supabase.from("v_daily_time").select("*")
      .gte("entry_date", week).lte("entry_date", weekEnd).order("entry_date"),
    supabase.from("v_daily_time").select("*")
      .gte("entry_date", prevWeek).lte("entry_date", addDays(prevWeek, 6)),
    supabase.from("v_weekly_buckets").select("*").eq("week_start", week),
    supabase.from("v_weekly_buckets").select("*").eq("week_start", prevWeek),
    supabase.from("v_weekly_activities").select("*").eq("week_start", week)
      .order("minutes", { ascending: false }),
    supabase.from("v_activity_value").select("*").order("hours", { ascending: false }),
  ]);

  const toNum = (d: DailyTime): DailyTime => ({
    ...d,
    logged_minutes: Number(d.logged_minutes),
    ziel_minutes: Number(d.ziel_minutes),
    arbeit_minutes: Number(d.arbeit_minutes),
    pflicht_minutes: Number(d.pflicht_minutes),
    regeneration_minutes: Number(d.regeneration_minutes),
    sozial_minutes: Number(d.sozial_minutes),
    spass_minutes: Number(d.spass_minutes),
    leerlauf_minutes: Number(d.leerlauf_minutes),
    sleep_hours: d.sleep_hours === null ? null : Number(d.sleep_hours),
    waking_minutes: Number(d.waking_minutes),
    unaccounted_minutes: Number(d.unaccounted_minutes),
  });

  const days = ((dailyRows ?? []) as DailyTime[]).map(toNum);
  const prevDays = ((prevDailyRows ?? []) as DailyTime[]).map(toNum);
  const buckets = (bucketRows ?? []) as WeeklyBucket[];
  const prevBuckets = (prevBucketRows ?? []) as WeeklyBucket[];
  const activities = (activityRows ?? []) as WeeklyActivity[];
  const values = ((valueRows ?? []) as ActivityValue[]).filter((v) => Number(v.hours) > 0);

  const summary = summarizeWeek(days, buckets);
  const prevSummary = summarizeWeek(prevDays, prevBuckets);

  const byDate = new Map(days.map((d) => [d.entry_date, d]));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const today = heuteISO();

  const prevShare = new Map(prevSummary.byBucket.map((b) => [b.bucket, b.share]));
  const maxBucket = Math.max(1, ...summary.byBucket.map((b) => b.minutes),
    summary.totalUnaccounted);

  if (summary.totalLogged === 0 && days.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-semibold text-ink">Woche</h1>
          <WeekNav weekStart={week} isCurrent={week === current} />
        </div>
        <Empty>
          Für diese Woche liegt noch nichts vor. Seit dem Umbau wird keine Zeit
          mehr minutengenau erfasst — was aus einem Tag geworden ist, steht im{" "}
          <Link href="/rueckblick/heute" className="text-accent hover:underline">
            Tagesrückblick
          </Link>.
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Woche</h1>
          <p className="mt-1 text-sm text-ink-muted">Wohin ist die Zeit gegangen?</p>
        </div>
        <WeekNav weekStart={week} isCurrent={week === current} />
      </div>

      {/* Der eine Satz */}
      <Card>
        <p className="text-lg leading-relaxed text-ink">
          Von {fmtHours(summary.totalWaking)} Wachzeit gingen{" "}
          <span className="font-semibold text-accent">
            {fmtHours(summary.byBucket.find((b) => b.bucket === "ziel")?.minutes ?? 0)}
          </span>{" "}
          an deine Ziele — das sind{" "}
          <span className="font-semibold text-accent">{pct(summary.goalShare)}</span>.
          {summary.totalUnaccounted > 0 && (
            <>
              {" "}
              <span className="font-semibold text-ink-muted">
                {fmtHours(summary.totalUnaccounted)}
              </span>{" "}
              sind noch nicht zugeordnet.
            </>
          )}
        </p>
        {prevSummary.totalWaking > 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            Vorwoche: {pct(prevSummary.goalShare)} an Zielen ·{" "}
            {fmtHours(prevSummary.totalUnaccounted)} unerfasst
          </p>
        )}

        {/* Die Lücken einzeln benennen. Eine Gesamtzahl sagt nur, dass etwas
            fehlt - erst der einzelne Tag macht sie nachtragbar. */}
        {(() => {
          const luecken = weekDays
            .map((d) => ({ datum: d, offen: Number(byDate.get(d)?.unaccounted_minutes ?? 0) }))
            .filter((l) => l.offen >= 30 && l.datum <= today);

          if (luecken.length === 0) return null;

          // Frueher fuehrte jede Luecke ins Nachtragen. Die Erfassung gibt es
          // nicht mehr - jetzt ist die Luecke einfach freie Zeit, und genau
          // die ist die Frage: wo neben der Arbeit ist Platz fuer Training
          // und Kochen?
          return (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 text-xs text-ink-muted">
                Freier Platz neben Arbeit und Schlaf:
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {luecken.map((l) => (
                  <li key={l.datum}
                    className="flex items-center gap-2 rounded-lg border border-line/70
                               bg-sand/60 px-2.5 py-1.5 text-xs">
                    <span className="text-ink-soft">
                      {new Date(l.datum + "T12:00:00").toLocaleDateString("de-CH", {
                        weekday: "short", day: "2-digit", month: "2-digit",
                      })}
                    </span>
                    <span className="tabular font-medium text-ink">
                      {fmtHours(l.offen)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </Card>

      {/* Verteilung */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardTitle>Verteilung nach Lebensbereich</CardTitle>
          <ul className="space-y-3">
            {summary.byBucket.map((b) => {
              const before = prevShare.get(b.bucket);
              const diff = before === undefined ? null : b.share - before;
              return (
                <li key={b.bucket}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: BUCKET_COLOR[b.bucket] }} />
                      <span className="text-sm text-ink">{BUCKET_LABEL[b.bucket]}</span>
                      <span className="hidden text-xs text-ink-faint sm:inline">
                        {BUCKET_HINT[b.bucket]}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {diff !== null && Math.abs(diff) >= 0.01 && (
                        <span className={cx("text-xs",
                          (b.bucket === "leerlauf") === (diff < 0) ? "text-good" : "text-ink-muted")}>
                          {diff > 0 ? "+" : ""}{Math.round(diff * 100)} pp
                        </span>
                      )}
                      <span className="tabular text-sm text-ink">
                        {fmtHours(b.minutes)}
                      </span>
                      <span className="tabular w-10 text-right text-xs text-ink-muted">
                        {pct(b.share)}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sand">
                    <div className="h-full rounded-full"
                      style={{
                        width: `${(b.minutes / maxBucket) * 100}%`,
                        background: BUCKET_COLOR[b.bucket],
                      }} />
                  </div>
                </li>
              );
            })}

            {summary.totalUnaccounted > 0 && (
              <li className="border-t border-line pt-3">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: UNACCOUNTED_COLOR }} />
                    <span className="text-sm text-ink-soft">Unerfasst</span>
                    <span className="hidden text-xs text-ink-faint sm:inline">
                      Zeit ohne Zuordnung
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-sm text-ink">
                      {fmtHours(summary.totalUnaccounted)}
                    </span>
                    <span className="tabular w-10 text-right text-xs text-ink-muted">
                      {pct(summary.totalUnaccounted / Math.max(1, summary.totalWaking))}
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sand">
                  <div className="h-full rounded-full"
                    style={{
                      width: `${(summary.totalUnaccounted / maxBucket) * 100}%`,
                      background: UNACCOUNTED_COLOR,
                    }} />
                </div>
              </li>
            )}
          </ul>
        </Card>

        {/* Zeitfresser */}
        <Card>
          <CardTitle>Grösste Posten</CardTitle>
          {activities.length === 0 ? (
            <Empty>Nichts erfasst.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {activities.slice(0, 10).map((a) => (
                <li key={a.activity_id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color }} />
                    <span className="truncate text-sm text-ink">{a.name}</span>
                    {a.bucket === "leerlauf" && <Badge tone="bad">Leerlauf</Badge>}
                    {a.counts_toward_goal && <Badge tone="accent">Ziel</Badge>}
                  </span>
                  <span className="tabular shrink-0 text-sm text-ink">
                    {fmtHours(Number(a.minutes))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Tag für Tag */}
      <Card>
        <CardTitle>Tag für Tag</CardTitle>
        <div className="space-y-3">
          {weekDays.map((d) => {
            const day = byDate.get(d);
            const future = d > today;
            return (
              <div key={d} className="flex items-center gap-3">
                <Link href={`/zeit?d=${d}`}
                  className="w-10 shrink-0 text-xs text-ink-muted transition hover:text-accent">
                  {dayNameShort(d)}
                </Link>
                <div className="min-w-0 flex-1">
                  {day ? (
                    <div className="flex overflow-hidden rounded-md border border-line"
                      style={{ height: 18 }}>
                      {dayComposition(day).map((s, i) => (
                        <div key={i} title={`${s.label}: ${fmtMinutes(s.minutes)}`}
                          style={{ width: `${(s.minutes / 1440) * 100}%`, background: s.color }} />
                      ))}
                    </div>
                  ) : (
                    <div className={cx("rounded-md border border-dashed border-line",
                      future && "opacity-40")} style={{ height: 18 }} />
                  )}
                </div>
                <span className="tabular w-16 shrink-0 text-right text-xs text-ink-muted">
                  {day ? fmtHours(day.logged_minutes) : future ? "" : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Stundenwert-Matrix */}
      <Card>
        <CardTitle>Stundenwert — was bringt eine Stunde ein?</CardTitle>
        {values.length === 0 ? (
          <Empty>Noch keine erfasste Zeit.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="py-2 pr-3 font-medium">Aktivität</th>
                  <th className="py-2 pr-3 text-right font-medium">Stunden gesamt</th>
                  <th className="py-2 pr-3 text-right font-medium">Ertrag</th>
                  <th className="py-2 pr-3 text-right font-medium">CHF pro Stunde</th>
                  <th className="py-2 text-right font-medium">Ansatz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {values.map((v) => {
                  const eff = v.effective_hourly === null ? null : Number(v.effective_hourly);
                  const rate = v.hourly_rate === null ? null : Number(v.hourly_rate);
                  return (
                    <tr key={v.activity_id}>
                      <td className="py-2.5 pr-3">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: v.color }} />
                          <span className="text-ink">{v.name}</span>
                          <Badge>{BUCKET_LABEL[v.bucket]}</Badge>
                        </span>
                      </td>
                      <td className="tabular py-2.5 pr-3 text-right text-ink-soft">
                        {Number(v.hours).toFixed(1).replace(".", ",")}
                      </td>
                      <td className={cx("tabular py-2.5 pr-3 text-right",
                        Number(v.net_amount) > 0 ? "text-good"
                          : Number(v.net_amount) < 0 ? "text-bad" : "text-ink-faint")}>
                        {Number(v.net_amount) === 0 ? "—" : chf(Number(v.net_amount))}
                      </td>
                      <td className={cx("tabular py-2.5 pr-3 text-right font-medium",
                        eff === null ? "text-ink-faint"
                          : eff > 0 ? "text-good" : eff < 0 ? "text-bad" : "text-ink-muted")}>
                        {eff === null || eff === 0 ? "—" : chf(eff)}
                      </td>
                      <td className="tabular py-2.5 text-right text-ink-muted">
                        {rate === null ? "—" : chf(rate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 max-w-3xl text-xs text-ink-muted">
          „Ertrag" ist die Summe der Buchungen, die du dieser Aktivität zugeordnet hast —
          Lohn beim Koch-Job, realisierte Gewinne beim Trading, Einnahmen aus einem Projekt.
          Bei den meisten Projekten steht hier am Anfang eine Null. Das ist keine schlechte
          Nachricht, sondern der Ausgangspunkt: Erst wenn die Stunden sichtbar sind, kann man
          sagen, ob sich die Investition gelohnt hat.{" "}
          <Link href="/transaktionen" className="text-accent hover:underline">
            Buchungen zuordnen
          </Link>
        </p>
      </Card>
    </div>
  );
}
