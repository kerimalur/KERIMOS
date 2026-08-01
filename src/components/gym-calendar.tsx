"use client";
import { useState } from "react";
import { Card, cx } from "@/components/ui";
import { SPLIT_COLOR, FALLBACK_COLOR } from "@/components/gym-progress";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function isoDay(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Kleiner Monatskalender: welche Tage waren Push, welche Pull.
 * trainedDays: ISO-Tag → Splits, die an dem Tag trainiert wurden.
 */
export function GymCalendar({ trainedDays }: { trainedDays: Record<string, string[]> }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-basiert

  // Montag als erster Wochentag
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = isoDay(now.getFullYear(), now.getMonth(), now.getDate());

  const prev = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const next = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };

  const splitsInData = [...new Set(Object.values(trainedDays).flat())].sort();

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const navBtn =
    "grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition " +
    "hover:bg-sand hover:text-ink";

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Trainingstage
        </span>
        <div className="flex items-center">
          <button type="button" onClick={prev} aria-label="Voriger Monat" className={navBtn}>
            ‹
          </button>
          <span className="w-32 text-center text-sm text-ink">
            {MONTHS[month]} {year}
          </span>
          <button type="button" onClick={next} aria-label="Nächster Monat" className={navBtn}>
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[10px] uppercase tracking-wide text-ink-muted">
            {w}
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <div key={`leer-${i}`} />;

          const key = isoDay(year, month, day);
          const splits = trainedDays[key] ?? [];
          const colors = splits.map((s) => SPLIT_COLOR[s] ?? FALLBACK_COLOR);

          const background =
            colors.length === 1
              ? colors[0]
              : colors.length > 1
                ? `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`
                : undefined;

          return (
            <div
              key={key}
              title={splits.length > 0 ? `${splits.join(" + ")} trainiert` : undefined}
              style={background ? { background } : undefined}
              className={cx(
                "tabular mx-auto grid h-8 w-8 place-items-center rounded-lg text-xs",
                splits.length > 0 ? "font-medium text-ink-on" : "text-ink-soft",
                key === today && "ring-2 ring-accent/60 ring-offset-1 ring-offset-card"
              )}
            >
              {day}
            </div>
          );
        })}
      </div>

      {splitsInData.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-line/70 pt-3">
          {splitsInData.map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="h-2.5 w-2.5 rounded-full"
                style={{ background: SPLIT_COLOR[s] ?? FALLBACK_COLOR }} />
              {s}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
