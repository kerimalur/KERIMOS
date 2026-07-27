"use client";
import { useRouter } from "next/navigation";
import { Button, cx } from "@/components/ui";
import { addDays, toISODate, weekLabel } from "@/lib/time";

export type CalView = "tag" | "woche" | "monat";

const VIEWS: [CalView, string][] = [["tag", "Tag"], ["woche", "Woche"], ["monat", "Monat"]];

export function CalendarNav({ view, date, anchor }: {
  view: CalView; date: string; anchor: string;
}) {
  const router = useRouter();
  const today = toISODate(new Date());

  const step = view === "tag" ? 1 : view === "woche" ? 7 : 0;

  function shift(direction: 1 | -1) {
    if (view === "monat") {
      const d = new Date(anchor + "T12:00:00");
      d.setDate(1);
      d.setMonth(d.getMonth() + direction);
      router.push(`/kalender?ansicht=monat&d=${toISODate(d)}`);
      return;
    }
    router.push(`/kalender?ansicht=${view}&d=${addDays(date, direction * step)}`);
  }

  const label =
    view === "tag"
      ? new Date(date + "T12:00:00").toLocaleDateString("de-CH",
          { weekday: "long", day: "2-digit", month: "long" })
      : view === "woche"
        ? weekLabel(anchor)
        : new Date(anchor + "T12:00:00").toLocaleDateString("de-CH",
            { month: "long", year: "numeric" });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => shift(-1)} aria-label="Zurück">←</Button>
        <span className="min-w-44 text-center text-sm font-medium text-ink">{label}</span>
        <Button variant="ghost" onClick={() => shift(1)} aria-label="Weiter">→</Button>
        <Button variant="ghost"
          onClick={() => router.push(`/kalender?ansicht=${view}&d=${today}`)}>
          Heute
        </Button>
      </div>

      <div className="flex items-center gap-1 rounded-xl bg-sand p-1">
        {VIEWS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => router.push(`/kalender?ansicht=${key}&d=${date}`)}
            className={cx(
              "rounded-lg px-3 py-1.5 text-sm transition",
              view === key ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
