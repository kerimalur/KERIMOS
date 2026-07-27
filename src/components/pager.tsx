"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";

export function Pager({ page, pageSize, total }: {
  page: number; pageSize: number; total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  function go(p: number) {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("seite"); else next.set("seite", String(p));
    router.push(`/transaktionen?${next.toString()}`);
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <span className="text-xs text-ink-muted">
        {from}–{to} von {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => go(page - 1)} disabled={page <= 1}>
          Zurück
        </Button>
        <span className="text-xs text-ink-muted">Seite {page} von {pages}</span>
        <Button variant="ghost" onClick={() => go(page + 1)} disabled={page >= pages}>
          Weiter
        </Button>
      </div>
    </div>
  );
}
