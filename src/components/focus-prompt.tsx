"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logFocus, dismissFocus, dismissAllFocus } from "@/lib/actions";
import { Button, Input, Select, cx } from "@/components/ui";
import { elapsedMinutes, humanDuration, plannedEntry, startLabel, quickDurations } from "@/lib/focus";
import { BUCKET_LABEL } from "@/lib/types";
import type { Activity, FocusSession } from "@/lib/types";

/** Offene Sitzungen. Sie verfallen nie — auch von vorgestern wird noch gefragt. */
export function FocusPrompt({
  sessions, activities,
}: {
  sessions: FocusSession[];
  activities: Activity[];
}) {
  const [now, setNow] = useState<Date | null>(null);

  // Erst nach dem Einhängen rechnen, sonst weichen Server und Browser ab
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  if (sessions.length === 0 || !now) return null;

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} activities={activities} now={now} />
      ))}
      {sessions.length > 2 && (
        <form action={dismissAllFocus} className="text-right">
          <button className="text-xs text-ink-muted transition hover:text-bad">
            alle {sessions.length} verwerfen
          </button>
        </form>
      )}
    </div>
  );
}

function SessionRow({
  session, activities, now,
}: {
  session: FocusSession; activities: Activity[]; now: Date;
}) {
  const router = useRouter();
  const elapsed = elapsedMinutes(session.started_at, now);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(elapsed);
  const [activityId, setActivityId] = useState(session.activity_id ?? "");
  const [busy, setBusy] = useState(false);

  const plan = plannedEntry(session.started_at, minutes);
  const activity = activities.find((a) => a.id === activityId);

  async function submit(useMinutes = minutes) {
    if (!activityId || busy) return;
    setBusy(true);
    const p = plannedEntry(session.started_at, useMinutes);
    const fd = new FormData();
    fd.set("id", session.id);
    fd.set("activity_id", activityId);
    fd.set("minutes", String(p.minutes));
    fd.set("entry_date", p.entry_date);
    fd.set("start_minute", String(p.start_minute));
    await logFocus(fd);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-accent bg-card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Offene Sitzung
          </div>
          <div className="mt-0.5 truncate text-sm text-ink">
            <span className="font-medium">{session.label}</span>
            <span className="text-ink-muted">
              {" "}· geöffnet vor {humanDuration(elapsed)}
            </span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setOpen(!open)}
            className="text-xs text-ink-muted transition hover:text-ink-soft">
            {open ? "weniger" : "anpassen"}
          </button>
          <Button
            onClick={() => (activityId ? submit(elapsed) : setOpen(true))}
            disabled={busy}
            title={activityId
              ? `${humanDuration(elapsed)} als ${activity?.name} eintragen`
              : "Zuerst eine Aktivität wählen"}
          >
            {busy ? "…" : "Eintragen"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <p className="text-xs text-ink-muted">
            geöffnet {startLabel(session.started_at, now)}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {quickDurations(elapsed).map((m) => (
              <button key={m} onClick={() => setMinutes(m)}
                className={cx("rounded-lg px-2 py-1 text-xs font-medium transition",
                  minutes === m ? "bg-accent text-ink-on"
                                : "bg-sand text-ink-muted hover:text-ink-soft")}>
                {m === elapsed ? "bis jetzt" : m < 60 ? `${m}m` : `${Math.round(m / 6) / 10}h`}
              </button>
            ))}
            <Input type="number" min={1} value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
              className="w-20" aria-label="Minuten" />
            <span className="text-xs text-ink-muted">min</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={activityId} onChange={(e) => setActivityId(e.target.value)}
              className="min-w-52 flex-1" aria-label="Aktivität">
              <option value="">— Aktivität wählen —</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({BUCKET_LABEL[a.bucket]})
                </option>
              ))}
            </Select>
            <Button onClick={() => submit()} disabled={!activityId || busy}>
              {busy ? "…" : "Eintragen"}
            </Button>
            <form action={dismissFocus}>
              <input type="hidden" name="id" value={session.id} />
              <button className="text-xs text-ink-muted transition hover:text-bad">
                verwerfen
              </button>
            </form>
          </div>

          <p className="text-xs text-ink-muted">
            Wird eingetragen als {activity ? activity.name : "…"} am{" "}
            {new Date(plan.entry_date + "T12:00:00").toLocaleDateString("de-CH")} ab{" "}
            {String(Math.floor(plan.start_minute / 60)).padStart(2, "0")}:
            {String(plan.start_minute % 60).padStart(2, "0")} für {humanDuration(plan.minutes)}.
            {plan.capped && (
              <span className="text-warn">
                {" "}Gekürzt, weil der Tag um Mitternacht endet.
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
