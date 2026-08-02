"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { layoutDay, hourRange, minuteToTime } from "@/lib/calendar";
import { fmtMinutes, fmtHours, dayNameShort, addDays, toISODate } from "@/lib/time";
import { BUCKET_COLOR, BUCKET_LABEL, UNACCOUNTED_COLOR } from "@/lib/types";
import type { Activity, DailyTime, TimeEntry, TimeBucket } from "@/lib/types";
import { Card, CardTitle, Badge, Button, Input, Label, cx } from "@/components/ui";
import {
  setEntryStart, setEntryRange, addTimedEntry, deleteTimeEntry, saveCheckin,
} from "@/lib/actions";
import { useState, useTransition } from "react";
import { BUCKET_ORDER, BUCKET_HINT } from "@/lib/types";

const ROW = 30;   // Pixel je Stunde
const STEPS = [15, 30, 45, 60, 90, 120, 180, 240, 480];

type Entry = TimeEntry & { activity: Activity | undefined };

/* ------------------------------------------------------------- Tag */

export function DayCalendar({
  date, entries, activities, checkin,
}: {
  date: string;
  entries: Entry[];
  activities: Activity[];
  checkin: { energy: number | null; note: string | null } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(60);
  // Der Erfassungsblock erscheint erst, wenn eine Stunde angeklickt wird.
  const [cursor, setCursor] = useState<number | null>(null);
  // Klick auf einen Block wählt ihn aus - zum Löschen von Fehlklicks.
  const [selected, setSelected] = useState<string | null>(null);

  const blocks = layoutDay(entries);
  const untimed = entries.filter((e) => e.start_minute === null);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const height = 24 * ROW;
  const filled = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);

  function place(activityId: string) {
    if (cursor === null || cursor >= 1440) return;
    const minutes = Math.min(step, 1440 - cursor);
    const fd = new FormData();
    fd.set("activity_id", activityId);
    fd.set("entry_date", date);
    fd.set("start", minuteToTime(cursor));
    fd.set("minutes", String(minutes));
    setCursor(cursor + minutes);
    startTransition(async () => {
      await addTimedEntry(fd);
      router.refresh();
    });
  }

  function removeLast() {
    const last = [...blocks].sort((a, b) => b.end - a.end)[0];
    if (!last) return;
    const fd = new FormData();
    fd.set("id", last.entry.id);
    startTransition(async () => {
      await deleteTimeEntry(fd);
      router.refresh();
    });
  }

  function deleteSelected() {
    if (!selected) return;
    const fd = new FormData();
    fd.set("id", selected);
    setSelected(null);
    startTransition(async () => {
      await deleteTimeEntry(fd);
      router.refresh();
    });
  }

  const selectedBlock = blocks.find((b) => b.entry.id === selected) ?? null;

  const grouped = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: activities.filter((a) => a.bucket === bucket),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {/* Erfassung - nur sichtbar, wenn ein Zeitfenster gewählt ist */}
      {cursor !== null && (
        <Card className="border-accent">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="mb-1">Eintragen ab</CardTitle>
              <div className="flex items-center gap-2">
                <button onClick={() => setCursor(Math.max(0, cursor - 15))}
                  className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted transition hover:border-line-strong">
                  −15
                </button>
                <span className="tabular text-2xl font-medium text-ink">
                  {minuteToTime(cursor)}
                </span>
                <button onClick={() => setCursor(Math.min(1425, cursor + 15))}
                  className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted transition hover:border-line-strong">
                  +15
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-ink-muted">Dauer</span>
              {STEPS.map((m) => (
                <button key={m} onClick={() => setStep(m)}
                  className={cx("rounded-lg px-2 py-1 text-xs font-medium transition",
                    step === m ? "bg-accent text-ink-on" : "bg-sand text-ink-muted hover:text-ink-soft")}>
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              ))}
              <button onClick={() => setCursor(null)}
                className="ml-2 rounded-lg border border-line px-2 py-1 text-xs text-ink-muted transition hover:border-line-strong">
                Schliessen
              </button>
            </div>
          </div>

          <div className="space-y-3.5">
            {grouped.map(({ bucket, items }) => (
              <div key={bucket}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="h-2 w-2 rounded-sm" style={{ background: BUCKET_COLOR[bucket] }} />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                    {BUCKET_LABEL[bucket]}
                  </span>
                  <span className="text-[11px] text-ink-faint">{BUCKET_HINT[bucket]}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((a) => (
                    <button key={a.id} onClick={() => place(a.id)}
                      disabled={pending || cursor >= 1440}
                      className={cx(
                        "flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm transition",
                        "text-ink-soft hover:border-line-strong hover:text-ink",
                        (pending || cursor >= 1440) && "opacity-50"
                      )}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color }} />
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-xs text-ink-muted">
              Klick setzt {step < 60 ? `${step} Minuten` : `${step / 60} Stunden`} ab{" "}
              {minuteToTime(cursor)} und rückt weiter.
            </span>
            {blocks.length > 0 && (
              <button onClick={removeLast} disabled={pending}
                className="text-xs text-ink-muted transition hover:text-bad">
                Letzten Eintrag zurücknehmen
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Raster */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="mb-0">Tag</CardTitle>
          <span className="flex items-center gap-3">
            <span className="tabular text-xs text-ink-muted">
              {cursor === null
                ? "Auf eine Stunde klicken, um dort einzutragen"
                : `${fmtHours(filled)} von 24 h belegt`}
            </span>
            {/* Dieselben Daten als durchgehende Achse - dort sind die
                Lücken auf einen Blick sichtbar statt Zelle für Zelle. */}
            <Link href="/achse"
              className="shrink-0 text-xs font-medium text-accent-soft transition hover:underline">
              Als Achse →
            </Link>
          </span>
        </div>

        {selectedBlock && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-sand px-3 py-2 text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: selectedBlock.entry.activity?.color ?? "#A8A093" }} />
            <span className="text-ink">{selectedBlock.entry.activity?.name ?? "Unbekannt"}</span>

            {/* Zeit direkt umstellen - Speichern schreibt Start und Dauer neu */}
            <form key={selectedBlock.entry.id} action={setEntryRange}
              className="flex items-center gap-1.5">
              <input type="hidden" name="id" value={selectedBlock.entry.id} />
              <input type="time" name="von" required
                defaultValue={minuteToTime(selectedBlock.start)}
                className="rounded-lg border border-line bg-field px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
              <span className="text-xs text-ink-muted">–</span>
              <input type="time" name="bis" required
                defaultValue={minuteToTime(Math.min(selectedBlock.end, 1439))}
                className="rounded-lg border border-line bg-field px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
              <button className="text-xs font-medium text-accent-soft transition hover:underline">
                Speichern
              </button>
            </form>

            <span className="ml-auto flex items-center gap-3">
              <button onClick={deleteSelected} disabled={pending}
                className="text-xs font-medium text-bad transition hover:underline">
                Löschen
              </button>
              <button onClick={() => setSelected(null)}
                className="text-xs text-ink-muted transition hover:text-ink-soft">
                Abbrechen
              </button>
            </span>
          </div>
        )}

        <div className="relative" style={{ height }}>
          {hours.map((h) => (
            <button
              key={h}
              onClick={() => setCursor(h * 60)}
              title={`Ab ${String(h).padStart(2, "0")}:00 eintragen`}
              className="absolute left-0 right-0 flex items-start text-left transition hover:bg-sand/60"
              style={{ top: h * ROW, height: ROW }}
            >
              <span className="tabular w-12 shrink-0 -translate-y-1.5 text-[11px] text-ink-faint">
                {String(h).padStart(2, "0")}:00
              </span>
              <span className="h-px flex-1 bg-line" />
            </button>
          ))}

          {cursor !== null && (
            <div className="pointer-events-none absolute left-12 right-0 flex items-center"
              style={{ top: (cursor / 60) * ROW }}>
              <span className="h-2 w-2 -translate-x-1 rounded-full bg-accent" />
              <span className="h-px flex-1 bg-accent/60" />
            </div>
          )}

          <div className="pointer-events-none absolute bottom-0 left-12 right-0 top-0">
            {blocks.map(({ entry, start, end, column, columns }) => {
              const top = (start / 60) * ROW;
              const blockHeight = Math.max(16, ((end - start) / 60) * ROW - 2);
              const width = 100 / columns;
              const color = entry.activity?.color ?? "#A8A093";
              return (
                <button key={entry.id} type="button"
                  onClick={() => setSelected(selected === entry.id ? null : entry.id)}
                  className={cx(
                    "pointer-events-auto absolute cursor-pointer overflow-hidden rounded-lg px-2 py-0.5 text-left",
                    selected === entry.id && "ring-2 ring-bad/70"
                  )}
                  style={{
                    top, height: blockHeight,
                    left: `calc(${column * width}% + 2px)`,
                    width: `calc(${width}% - 4px)`,
                    background: color + "26",
                    borderLeft: `3px solid ${color}`,
                  }}
                  title={`${entry.activity?.name ?? ""} · ${minuteToTime(start)}–${minuteToTime(end)} — Klick zum Auswählen/Löschen`}>
                  <div className="truncate text-[12px] font-medium leading-tight text-ink">
                    {entry.activity?.name ?? "Unbekannt"}
                  </div>
                  {blockHeight > 28 && (
                    <div className="truncate text-[11px] text-ink-muted">
                      {minuteToTime(start)}–{minuteToTime(end)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {untimed.length > 0 && (
        <Card>
          <CardTitle>Ohne Uhrzeit</CardTitle>
          <ul className="space-y-2">
            {untimed.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: e.activity?.color ?? "#A8A093" }} />
                <span className="text-sm text-ink">{e.activity?.name ?? "Unbekannt"}</span>
                <span className="tabular text-xs text-ink-muted">{fmtMinutes(e.minutes)}</span>
                <form action={setEntryStart} className="ml-auto flex items-center gap-1.5">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="time" name="start" step={300}
                    className="rounded-lg border border-line bg-field px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
                  <button className="text-xs text-accent-soft hover:underline">
                    Uhrzeit setzen
                  </button>
                </form>
                <form action={deleteTimeEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <button aria-label="Eintrag löschen"
                    className="text-xs text-ink-faint transition hover:text-bad">✕</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Kurzer Tages-Check-in */}
      <Card>
        <CardTitle>Notiz zum Tag</CardTitle>
        <form action={saveCheckin} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="entry_date" value={date} />
          <div className="w-28">
            <Label htmlFor="energy">Energie (1–5)</Label>
            <Input id="energy" name="energy" type="number" min={1} max={5}
              defaultValue={checkin?.energy ?? ""} />
          </div>
          <div className="min-w-56 flex-1">
            <Label htmlFor="note">Notiz</Label>
            <Input id="note" name="note" defaultValue={checkin?.note ?? ""}
              placeholder="Was war heute los?" />
          </div>
          <Button variant="ghost" type="submit">Speichern</Button>
        </form>
        <p className="mt-2 text-xs text-ink-muted">
          Schlaf trägst du als Block im Raster ein — er zählt dann nicht als Wachzeit.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Woche */

export function WeekCalendar({
  weekStart, entriesByDate,
}: {
  weekStart: string;
  entriesByDate: Record<string, Entry[]>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const all = days.flatMap((d) => layoutDay(entriesByDate[d] ?? []));
  const [first, last] = hourRange(all);
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const height = hours.length * ROW;
  const today = toISODate(new Date());

  return (
    <Card>
      <div className="flex">
        <div className="w-11 shrink-0" />
        {days.map((d) => (
          <div key={d} className="min-w-0 flex-1 pb-2 text-center">
            <Link href={`/kalender?ansicht=tag&d=${d}`}
              className={cx("text-xs transition hover:text-accent-soft",
                d === today ? "font-medium text-accent-soft" : "text-ink-muted")}>
              {dayNameShort(d)} {Number(d.slice(8, 10))}
            </Link>
          </div>
        ))}
      </div>

      <div className="relative" style={{ height }}>
        {hours.map((h, i) => (
          <div key={h} className="absolute left-0 right-0 flex items-start"
            style={{ top: i * ROW, height: ROW }}>
            <span className="tabular w-11 shrink-0 -translate-y-1.5 text-[11px] text-ink-faint">
              {String(h).padStart(2, "0")}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
        ))}

        <div className="absolute bottom-0 left-11 right-0 top-0 flex">
          {days.map((d) => {
            const blocks = layoutDay(entriesByDate[d] ?? []);
            return (
              <div key={d} className="relative min-w-0 flex-1 border-l border-line/60">
                {blocks.map(({ entry, start, end, column, columns }) => {
                  const top = ((start - first * 60) / 60) * ROW;
                  const h = Math.max(14, ((end - start) / 60) * ROW - 2);
                  const width = 100 / columns;
                  const color = entry.activity?.color ?? "#A8A093";
                  return (
                    <div key={entry.id}
                      className="absolute overflow-hidden rounded px-1"
                      style={{
                        top, height: h,
                        left: `calc(${column * width}% + 1px)`,
                        width: `calc(${width}% - 2px)`,
                        background: color + "30",
                        borderLeft: `2px solid ${color}`,
                      }}
                      title={`${entry.activity?.name ?? ""} · ${minuteToTime(start)}–${minuteToTime(end)}`}>
                      {h > 22 && (
                        <div className="truncate text-[10px] leading-tight text-ink">
                          {entry.activity?.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Monat */

const BUCKET_KEYS: [TimeBucket, keyof DailyTime][] = [
  ["ziel", "ziel_minutes"], ["arbeit", "arbeit_minutes"], ["pflicht", "pflicht_minutes"],
  ["regeneration", "regeneration_minutes"], ["sozial", "sozial_minutes"],
  ["spass", "spass_minutes"], ["leerlauf", "leerlauf_minutes"],
];

export function MonthCalendar({
  monthStart, days, dailyByDate,
}: {
  monthStart: string;
  days: string[];
  dailyByDate: Record<string, DailyTime>;
}) {
  const router = useRouter();
  const today = toISODate(new Date());
  const month = monthStart.slice(0, 7);

  return (
    <Card>
      <div className="grid grid-cols-7 gap-1.5">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] text-ink-muted">{d}</div>
        ))}

        {days.map((d) => {
          const daily = dailyByDate[d];
          const inMonth = d.slice(0, 7) === month;
          const logged = Number(daily?.logged_minutes ?? 0);
          const unaccounted = Number(daily?.unaccounted_minutes ?? 0);
          const waking = Number(daily?.waking_minutes ?? 0) || 1;

          return (
            <button
              key={d}
              onClick={() => router.push(`/kalender?ansicht=tag&d=${d}`)}
              className={cx(
                "min-h-[74px] rounded-lg border p-1.5 text-left transition",
                inMonth ? "border-line bg-card hover:border-line-strong" : "border-transparent opacity-40",
                d === today && "border-accent"
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className={cx("text-[11px]",
                  d === today ? "font-medium text-accent-soft" : "text-ink-muted")}>
                  {Number(d.slice(8, 10))}
                </span>
                {logged > 0 && (
                  <span className="tabular text-[10px] text-ink-faint">{fmtHours(logged)}</span>
                )}
              </div>

              {daily && (
                <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-sand">
                  {BUCKET_KEYS.map(([bucket, key]) => {
                    const value = Number(daily[key] ?? 0);
                    if (value <= 0) return null;
                    return (
                      <div key={bucket} style={{
                        width: `${(value / waking) * 100}%`,
                        background: BUCKET_COLOR[bucket],
                      }} />
                    );
                  })}
                  {unaccounted > 0 && (
                    <div style={{
                      width: `${(unaccounted / waking) * 100}%`,
                      background: UNACCOUNTED_COLOR,
                    }} />
                  )}
                </div>
              )}

              {daily && unaccounted > 240 && (
                <div className="mt-1 text-[10px] text-ink-faint">
                  {fmtHours(unaccounted)} offen
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
        {BUCKET_KEYS.map(([bucket]) => (
          <span key={bucket} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: BUCKET_COLOR[bucket] }} />
            {BUCKET_LABEL[bucket]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: UNACCOUNTED_COLOR }} />
          Unerfasst
        </span>
      </div>
    </Card>
  );
}
