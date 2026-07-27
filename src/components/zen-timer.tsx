"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logFocus, dismissFocus } from "@/lib/actions";
import { Button, Card, Select } from "@/components/ui";
import { elapsedMinutes, plannedEntry, startLabel } from "@/lib/focus";
import { BUCKET_LABEL } from "@/lib/types";
import type { Activity, FocusSession } from "@/lib/types";

/** Ablenkungsfreier Zähler. Läuft weiter, auch wenn der Tab im Hintergrund ist. */
export function ZenTimer({
  session, activities, others, targets,
}: {
  session: FocusSession;
  activities: Activity[];
  others: number;
  targets: { target: string; kind: string; title: string }[];
}) {
  const router = useRouter();
  const [seconds, setSeconds] = useState<number | null>(null);
  const [activityId, setActivityId] = useState(session.activity_id ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session.started_at]);

  async function finish() {
    if (!activityId || busy) return;
    setBusy(true);
    const minutes = Math.max(1, elapsedMinutes(session.started_at));
    const plan = plannedEntry(session.started_at, minutes);
    const fd = new FormData();
    fd.set("id", session.id);
    fd.set("activity_id", activityId);
    fd.set("minutes", String(plan.minutes));
    fd.set("entry_date", plan.entry_date);
    fd.set("start_minute", String(plan.start_minute));
    await logFocus(fd);
    setBusy(false);
    router.push("/kalender?ansicht=tag");
  }

  const h = seconds === null ? 0 : Math.floor(seconds / 3600);
  const m = seconds === null ? 0 : Math.floor((seconds % 3600) / 60);
  const s = seconds === null ? 0 : seconds % 60;
  const activity = activities.find((a) => a.id === activityId);

  return (
    <Card className="text-center">
      <p className="text-xs uppercase tracking-[0.16em] text-ink-muted">
        {session.label}
      </p>

      <div className="tabular my-7 text-6xl font-medium text-ink">
        {seconds === null ? (
          <span className="text-ink-faint">··:··</span>
        ) : (
          <>
            {String(h).padStart(2, "0")}
            <span className="text-ink-faint">:</span>
            {String(m).padStart(2, "0")}
            <span className="text-2xl text-ink-faint">:{String(s).padStart(2, "0")}</span>
          </>
        )}
      </div>

      <p className="text-sm text-ink-muted">
        gestartet {startLabel(session.started_at)}
      </p>

      {targets.length > 0 && (
        <button
          onClick={() => {
            for (const t of targets) {
              if (t.kind === "web") window.open(t.target, "_blank", "noopener,noreferrer");
              else if (t.kind === "section") router.push(t.target);
              else void navigator.clipboard.writeText(t.target);
            }
          }}
          className="mt-3 text-xs text-accent-soft transition hover:underline"
        >
          {targets.length === 1
            ? `${targets[0].title} wieder öffnen`
            : `Alle ${targets.length} wieder öffnen`}
        </button>
      )}

      <div className="mx-auto mt-7 max-w-xs space-y-3">
        <Select value={activityId} onChange={(e) => setActivityId(e.target.value)}
          aria-label="Aktivität">
          <option value="">— Aktivität wählen —</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({BUCKET_LABEL[a.bucket]})
            </option>
          ))}
        </Select>

        <Button onClick={finish} disabled={!activityId || busy} className="w-full">
          {busy ? "Trage ein…" : `Beenden und eintragen${activity ? ` als ${activity.name}` : ""}`}
        </Button>

        <form action={dismissFocus}>
          <input type="hidden" name="id" value={session.id} />
          <button className="w-full text-xs text-ink-muted transition hover:text-bad">
            Ohne Eintrag beenden
          </button>
        </form>
      </div>

      {others > 0 && (
        <p className="mt-6 text-xs text-ink-muted">
          {others} weitere offene {others === 1 ? "Sitzung wartet" : "Sitzungen warten"} auf
          der <Link href="/" className="text-accent-soft hover:underline">Startseite</Link>.
        </p>
      )}
    </Card>
  );
}
