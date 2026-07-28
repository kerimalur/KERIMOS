"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logFocus, startFocusForActivity } from "@/lib/actions";
import { elapsedMinutes, humanDuration, plannedEntry } from "@/lib/focus";
import { Card, cx } from "@/components/ui";
import type { Activity, FocusSession } from "@/lib/types";

/**
 * "Läuft gerade" fürs Handy: ein Tap, wenn etwas beginnt. Der Wechsel auf
 * eine andere Aktivität beendet die laufende automatisch und verbucht sie
 * als Zeiteintrag — abends ist der Tag schon erfasst.
 *
 * Nutzt die bestehenden focus_sessions: hier landen nur Sitzungen MIT
 * Aktivität; Sitzungen ohne (von Kacheln gestartet) klärt der FocusPrompt.
 */
export function QuickTrack({
  sessions, activities,
}: {
  sessions: FocusSession[];
  activities: Activity[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const offen = sessions.filter((s) => s.status === "open" && s.activity_id);
  const laufend = offen[0] ?? null;
  const wählbar = activities.filter((a) => !a.is_sleep && !a.archived);

  /** Beendet alle offenen Sitzungen mit Aktivität und verbucht die Zeit. */
  async function beenden() {
    const jetzt = new Date();
    for (const s of offen) {
      const mins = Math.max(1, elapsedMinutes(s.started_at, jetzt));
      const p = plannedEntry(s.started_at, mins);
      const fd = new FormData();
      fd.set("id", s.id);
      fd.set("activity_id", s.activity_id!);
      fd.set("minutes", String(p.minutes));
      fd.set("entry_date", p.entry_date);
      fd.set("start_minute", String(p.start_minute));
      await logFocus(fd);
    }
  }

  async function tippen(a: Activity) {
    if (busy) return;
    setBusy(true);
    const dieselbe = laufend?.activity_id === a.id;
    await beenden();
    if (!dieselbe) {
      const fd = new FormData();
      fd.set("activity_id", a.id);
      await startFocusForActivity(fd); // Ziel-Links bewusst ignoriert - nur die Uhr läuft
    }
    setBusy(false);
    router.refresh();
  }

  async function stopp() {
    if (busy || !laufend) return;
    setBusy(true);
    await beenden();
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Läuft gerade
        </span>
        {laufend && now && (
          <button onClick={stopp} disabled={busy}
            className="rounded-lg bg-sand px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:text-ink">
            Stopp · {humanDuration(elapsedMinutes(laufend.started_at, now))}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {wählbar.map((a) => {
          const aktiv = laufend?.activity_id === a.id;
          return (
            <button key={a.id} onClick={() => tippen(a)} disabled={busy}
              className={cx(
                "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm transition active:scale-95",
                aktiv
                  ? "border-accent bg-accent-tint font-medium text-ink"
                  : "border-line bg-card text-ink-soft hover:border-line-strong"
              )}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: a.color }} />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {aktiv && <span className="text-xs text-accent-soft">●</span>}
            </button>
          );
        })}
      </div>

      {!laufend && (
        <p className="mt-2.5 text-xs text-ink-muted">
          Tippen, wenn etwas beginnt — der nächste Tipp wechselt und verbucht automatisch.
        </p>
      )}
    </Card>
  );
}
