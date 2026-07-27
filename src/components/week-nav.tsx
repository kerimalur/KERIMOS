"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { addDays, weekLabel } from "@/lib/time";

export function WeekNav({ weekStart, isCurrent }: { weekStart: string; isCurrent: boolean }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" onClick={() => router.push(`/woche?w=${addDays(weekStart, -7)}`)}>
        ←
      </Button>
      <div className="min-w-36 text-center">
        <div className="text-sm font-medium text-ink">{weekLabel(weekStart)}</div>
        <div className="text-xs text-ink-muted">
          {isCurrent ? "laufende Woche" : "abgeschlossen"}
        </div>
      </div>
      <Button variant="ghost" onClick={() => router.push(`/woche?w=${addDays(weekStart, 7)}`)}
        disabled={isCurrent}>
        →
      </Button>
      {!isCurrent && (
        <Button variant="ghost" onClick={() => router.push("/woche")}>aktuell</Button>
      )}
    </div>
  );
}
