"use client";
import { fmtMinutes, type Segment } from "@/lib/time";

/** 24 Stunden als durchgehender Balken - die Lücke ist Teil der Aussage. */
export function DayBar({ segments, height = 34 }: { segments: Segment[]; height?: number }) {
  const total = segments.reduce((s, x) => s + x.minutes, 0) || 1;

  return (
    <div>
      <div className="flex overflow-hidden rounded-lg border border-line"
        style={{ height }}>
        {segments.map((s, i) => (
          <div
            key={`${s.key}-${i}`}
            title={`${s.label}: ${fmtMinutes(s.minutes)}`}
            style={{ width: `${(s.minutes / total) * 100}%`, background: s.color }}
            className="transition-all"
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s, i) => (
          <span key={`${s.key}-${i}`} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            <span className={s.key === "unerfasst" ? "text-ink-muted" : "text-ink-muted"}>
              {s.label}
            </span>
            <span className="tabular text-ink-soft">{fmtMinutes(s.minutes)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
