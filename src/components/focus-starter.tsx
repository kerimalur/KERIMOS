"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { startFocusForActivity } from "@/lib/actions";
import { Button, Card, Select, cx } from "@/components/ui";
import { BUCKET_LABEL, BUCKET_ORDER, type Activity, type NavLink } from "@/lib/types";

import { MODE_ORDER as PICKABLE } from "@/lib/modes";

/**
 * Startet eine Fokus-Sitzung. Auswählbar sind beliebig viele Kacheln —
 * Chartanalyse heisst in der Praxis TradingView *und* GVA Screener.
 */
export function FocusStarter({
  activities, links,
}: {
  activities: Activity[];
  links: NavLink[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [activityId, setActivityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, NavLink[]>();
    for (const l of links) {
      const list = map.get(l.group_name) ?? [];
      list.push(l);
      map.set(l.group_name, list);
    }
    return [...map.entries()].sort(
      (a, b) => ((PICKABLE.indexOf(a[0]) + 1) || 99) - ((PICKABLE.indexOf(b[0]) + 1) || 99)
    );
  }, [links]);

  function toggle(link: NavLink) {
    setPicked((current) => {
      const next = current.includes(link.id)
        ? current.filter((id) => id !== link.id)
        : [...current, link.id];
      // Erste Kachel mit hinterlegter Aktivität schlägt die Tätigkeit vor
      if (!activityId) {
        const suggestion = next
          .map((id) => links.find((l) => l.id === id))
          .find((l) => l?.activity_id);
        if (suggestion?.activity_id) setActivityId(suggestion.activity_id);
      }
      return next;
    });
  }

  async function start() {
    if ((!activityId && picked.length === 0) || busy) return;
    setBusy(true);
    setHint(null);

    const fd = new FormData();
    if (activityId) fd.set("activity_id", activityId);
    fd.set("link_ids", picked.join(","));
    const result = await startFocusForActivity(fd);

    const copied: string[] = [];
    let sectionTarget: string | null = null;

    for (const t of result.targets) {
      if (t.kind === "web") window.open(t.target, "_blank", "noopener,noreferrer");
      else if (t.kind === "folder") {
        await navigator.clipboard.writeText(t.target).catch(() => {});
        copied.push(t.target);
      } else sectionTarget = t.target;
    }

    if (copied.length > 0) setHint(`Pfad kopiert: ${copied[copied.length - 1]}`);
    if (sectionTarget) { router.push(sectionTarget); return; }

    setBusy(false);
    setPicked([]);
    router.refresh();
  }

  const canStart = activityId !== "" || picked.length > 0;

  return (
    <Card>
      <h1 className="font-display text-lg font-bold text-ink">Fokus starten</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Wähl aus, womit du arbeitest — auch mehreres. KerimOS öffnet alles, zählt die
        Zeit als eine Sitzung und trägt sie beim Beenden ein.
      </p>

      <div className="mt-5 space-y-4">
        {groups.map(([group, items]) => (
          <div key={group}>
            <h2 className="font-display mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              {group}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {items.map((l) => {
                const on = picked.includes(l.id);
                return (
                  <button key={l.id} onClick={() => toggle(l)}
                    className={cx(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                      on ? "border-accent bg-accent-tint text-accent-soft"
                         : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
                    )}>
                    {l.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.image_url} alt="" style={{ objectPosition: l.image_position }}
                        className="h-4 w-4 rounded object-cover" />
                    ) : (
                      <span style={{ color: on ? undefined : l.color }}>{l.icon ?? "•"}</span>
                    )}
                    {l.title}
                    {on && <span className="text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="border-t border-line pt-4">
          <label className="mb-1.5 block text-xs text-ink-muted" htmlFor="focus-activity">
            Zählt als
          </label>
          <Select id="focus-activity" value={activityId}
            onChange={(e) => setActivityId(e.target.value)}>
            <option value="">— Aktivität wählen —</option>
            {BUCKET_ORDER.map((bucket) => {
              const items = activities.filter((a) => a.bucket === bucket);
              if (items.length === 0) return null;
              return (
                <optgroup key={bucket} label={BUCKET_LABEL[bucket]}>
                  {items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              );
            })}
          </Select>
          {picked.length > 1 && (
            <p className="mt-1.5 text-xs text-ink-muted">
              {picked.length} Kacheln werden als eine Sitzung geführt.
            </p>
          )}
        </div>

        <Button onClick={start} disabled={!canStart || busy} className="w-full">
          {busy ? "Starte…" : "Loslegen"}
        </Button>

        {hint && <p className="text-xs text-good">{hint}</p>}
        {!activityId && picked.length > 0 && (
          <p className="text-xs text-warn">
            Ohne Aktivität läuft der Zähler, aber die Zeit lässt sich am Ende nicht
            eintragen. Du kannst sie auch später im Zähler noch wählen.
          </p>
        )}
      </div>

      <Link href="/"
        className="mt-5 block text-center text-xs text-ink-muted transition hover:text-ink-soft">
        Zurück zum Dashboard
      </Link>
    </Card>
  );
}
