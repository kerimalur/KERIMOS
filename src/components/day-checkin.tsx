"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTime, saveCheckin, deleteTimeEntry } from "@/lib/actions";
import { DayBar } from "@/components/day-bar";
import { Button, Card, CardTitle, Input, Label, Badge, cx } from "@/components/ui";
import {
  fmtMinutes, dayComposition, addDays, dayName, QUICK_MINUTES, toISODate,
} from "@/lib/time";
import { BUCKET_LABEL, BUCKET_ORDER, BUCKET_COLOR, BUCKET_HINT } from "@/lib/types";
import type { Activity, DailyTime, DayCheckin as Checkin, TimeEntry } from "@/lib/types";

interface Props {
  date: string;
  activities: Activity[];
  entries: (TimeEntry & { activity: Activity | undefined })[];
  daily: DailyTime;
  checkin: Checkin | null;
  defaultSleepHours: number;
}

export function DayCheckinBoard({
  date, activities, entries, daily, checkin, defaultSleepHours,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(30);
  const today = toISODate(new Date());

  const segments = dayComposition(daily, defaultSleepHours);
  const unaccounted = daily.unaccounted_minutes;
  const overfilled = daily.logged_minutes > daily.waking_minutes;

  const minutesByActivity = new Map<string, number>();
  for (const e of entries) {
    minutesByActivity.set(e.activity_id, (minutesByActivity.get(e.activity_id) ?? 0) + e.minutes);
  }

  function bump(activityId: string, minutes: number) {
    const fd = new FormData();
    fd.set("activity_id", activityId);
    fd.set("entry_date", date);
    fd.set("minutes", String(minutes));
    startTransition(async () => {
      await addTime(fd);
      router.refresh();
    });
  }

  function go(offset: number) {
    router.push(`/zeit?d=${addDays(date, offset)}`);
  }

  const grouped = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: activities.filter((a) => a.bucket === bucket),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {/* Datumsnavigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => go(-1)}>←</Button>
          <div>
            <div className="text-sm font-medium text-ink">
              {dayName(date)}
              {date === today && <span className="ml-2 text-accent">heute</span>}
            </div>
            <div className="text-xs text-ink-muted">
              {new Date(date + "T12:00:00").toLocaleDateString("de-CH", {
                day: "2-digit", month: "long", year: "numeric",
              })}
            </div>
          </div>
          <Button variant="ghost" onClick={() => go(1)} disabled={date >= today}>→</Button>
          {date !== today && (
            <Button variant="ghost" onClick={() => router.push("/zeit")}>heute</Button>
          )}
        </div>

        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-ink-muted">Unerfasst</div>
          <div className={cx("tabular text-2xl font-semibold",
            unaccounted > 240 ? "text-bad" : unaccounted > 90 ? "text-warn" : "text-good")}>
            {fmtMinutes(unaccounted)}
          </div>
        </div>
      </div>

      {/* Tagesbalken */}
      <Card>
        <CardTitle>Dein Tag, 24 Stunden</CardTitle>
        <DayBar segments={segments} />
        {overfilled && (
          <p className="mt-3 text-sm text-warn">
            Du hast mehr Zeit erfasst, als der Tag Wachstunden hat. Stimmt die
            Schlafdauer, oder ist irgendwo zu viel eingetragen?
          </p>
        )}
        {!overfilled && unaccounted > 180 && (
          <p className="mt-3 text-sm text-ink-muted">
            {fmtMinutes(unaccounted)} sind noch nicht zugeordnet. Genau darum geht es:
            trag ein, was du weisst — der Rest ist der ehrliche Teil der Antwort.
          </p>
        )}
      </Card>

      {/* Schnellerfassung */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="mb-0">Schnell erfassen</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-muted">Schrittweite</span>
            {QUICK_MINUTES.map((m) => (
              <button
                key={m}
                onClick={() => setStep(m)}
                className={cx(
                  "rounded-md px-2 py-1 text-xs font-medium transition",
                  step === m
                    ? "bg-accent text-white"
                    : "bg-sand text-ink-muted hover:text-ink"
                )}
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {grouped.map(({ bucket, items }) => (
            <div key={bucket}>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="h-2 w-2 rounded-sm"
                  style={{ background: BUCKET_COLOR[bucket] }} />
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  {BUCKET_LABEL[bucket]}
                </span>
                <span className="text-xs text-ink-faint">{BUCKET_HINT[bucket]}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {items.map((a) => {
                  const mins = minutesByActivity.get(a.id) ?? 0;
                  return (
                    <button
                      key={a.id}
                      onClick={() => bump(a.id, step)}
                      onContextMenu={(e) => { e.preventDefault(); bump(a.id, -step); }}
                      disabled={pending}
                      title="Klick addiert, Rechtsklick zieht ab"
                      className={cx(
                        "group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                        mins > 0
                          ? "border-line bg-sand text-ink"
                          : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                        pending && "opacity-60"
                      )}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: a.color }} />
                      {a.name}
                      {mins > 0 && (
                        <span className="tabular rounded bg-card px-1.5 py-0.5 text-xs text-accent">
                          {fmtMinutes(mins)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          Klick addiert die Schrittweite, Rechtsklick zieht sie wieder ab.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Erfasste Blöcke */}
        <Card>
          <CardTitle>Erfasst an diesem Tag</CardTitle>
          {entries.length === 0 ? (
            <p className="text-sm text-ink-muted">Noch nichts eingetragen.</p>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: e.activity?.color ?? "#8A8478" }} />
                    <span className="truncate text-sm text-ink">
                      {e.activity?.name ?? "Unbekannt"}
                    </span>
                    {e.activity && (
                      <Badge>{BUCKET_LABEL[e.activity.bucket]}</Badge>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-sm text-ink">
                      {fmtMinutes(e.minutes)}
                    </span>
                    <form action={deleteTimeEntry}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-xs text-ink-faint transition hover:text-bad">
                        ✕
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
            <span className="text-ink-muted">Summe</span>
            <span className="tabular font-medium text-ink">
              {fmtMinutes(daily.logged_minutes)} von {fmtMinutes(daily.waking_minutes)} Wachzeit
            </span>
          </div>
        </Card>

        {/* Check-in */}
        <Card>
          <CardTitle>Tages-Check-in</CardTitle>
          <form action={saveCheckin} className="space-y-4">
            <input type="hidden" name="entry_date" value={date} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sleep_hours">Geschlafen (Std.)</Label>
                <Input id="sleep_hours" name="sleep_hours" type="number" step="0.5"
                  min={0} max={16} defaultValue={checkin?.sleep_hours ?? ""}
                  placeholder={String(defaultSleepHours)} />
              </div>
              <div>
                <Label htmlFor="energy">Energie (1–5)</Label>
                <Input id="energy" name="energy" type="number" min={1} max={5}
                  defaultValue={checkin?.energy ?? ""} />
              </div>
            </div>
            <div>
              <Label htmlFor="note">Notiz</Label>
              <Input id="note" name="note" defaultValue={checkin?.note ?? ""}
                placeholder="Was war heute los?" />
            </div>
            <Button type="submit" variant="ghost" className="w-full">Speichern</Button>
          </form>
          <p className="mt-3 text-xs text-ink-muted">
            Die Schlafdauer bestimmt, wie viel Wachzeit der Tag hat — und damit, wie
            gross die unerfasste Lücke ist. Hast du den Schlaf im Kalender als Blöcke
            erfasst, gilt der Kalender; dieses Feld greift dann nicht mehr.
          </p>
        </Card>
      </div>
    </div>
  );
}
