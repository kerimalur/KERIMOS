"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";
import type { BacktestSession } from "@/lib/backtest-types";

/**
 * Nur sichtbar, wenn mehr als eine aktive Session existiert - sonst gibt es
 * nichts umzuschalten und der Picker wäre nur Ballast auf der Seite.
 */
export function BacktestSessionPicker({
  sessions, currentId,
}: { sessions: BacktestSession[]; currentId: string }) {
  const router = useRouter();
  const params = useSearchParams();

  if (sessions.length <= 1) return null;

  function change(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("session", id);
    router.push(`/trading/backtest?${next.toString()}`);
  }

  return (
    <Select value={currentId} onChange={(e) => change(e.target.value)} className="w-44">
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>{s.pair}</option>
      ))}
    </Select>
  );
}
