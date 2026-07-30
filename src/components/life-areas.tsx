"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveLifeArea, createLifeArea, updateLifeArea } from "@/lib/actions";
import { Button, Input, Label, cx } from "@/components/ui";
import type { LifeArea } from "@/lib/types";

/**
 * Lebensbereiche verwalten. Die sieben Standardbereiche entsprechen den
 * Zeit-Buckets - eigene kommen einfach dazu. Bereiche werden archiviert statt
 * gelöscht, damit alte Aufgaben ihre Zuordnung behalten.
 */
export function LifeAreas({ areas }: { areas: LifeArea[] }) {
  const router = useRouter();
  const [auf, setAuf] = useState(false);
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const aktiv = areas.filter((a) => !a.archived);
  const archiviert = areas.filter((a) => a.archived);

  async function lauf(action: (fd: FormData) => Promise<void>, fd: FormData) {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      await action(fd);
      setAuf(false);
      setBearbeite(null);
      router.refresh();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {fehler && (
        <div className="mb-3 rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
        </div>
      )}

      <ul className="mb-3 flex flex-wrap gap-2">
        {aktiv.map((a) => (
          <li key={a.id}>
            {bearbeite === a.id ? (
              <form action={(fd) => lauf(updateLifeArea, fd)}
                className="flex items-center gap-2 rounded-xl bg-sand/60 p-2">
                <input type="hidden" name="id" value={a.id} />
                <Input name="name" defaultValue={a.name} required className="w-40 py-1 text-xs" />
                <input type="color" name="color" defaultValue={a.color}
                  aria-label="Farbe"
                  className="h-7 w-8 cursor-pointer rounded border border-line bg-white" />
                <Button type="submit" disabled={busy} className="px-2.5 py-1 text-xs">
                  OK
                </Button>
                <Button type="button" variant="ghost" className="px-2.5 py-1 text-xs"
                  onClick={() => setBearbeite(null)}>
                  Abbrechen
                </Button>
                <Button type="button" variant="danger" className="px-2.5 py-1 text-xs"
                  onClick={() => lauf(archiveLifeArea, formOf({ id: a.id }))}>
                  Archivieren
                </Button>
              </form>
            ) : (
              <button onClick={() => setBearbeite(a.id)}
                className="flex items-center gap-2 rounded-xl border border-line bg-card
                           px-3 py-1.5 text-sm text-ink-soft transition
                           hover:border-line-strong hover:text-ink">
                <span className="h-2.5 w-2.5 rounded-full"
                  style={{ background: a.color }} />
                {a.name}
                {a.bucket && (
                  <span className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                    Zeit
                  </span>
                )}
              </button>
            )}
          </li>
        ))}

        <li>
          <button onClick={() => setAuf(!auf)}
            className={cx("rounded-xl border border-dashed px-3 py-1.5 text-sm transition",
              auf ? "border-line-strong text-ink"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink-soft")}>
            {auf ? "×" : "+ Bereich"}
          </button>
        </li>
      </ul>

      {auf && (
        <form action={(fd) => lauf(createLifeArea, fd)}
          className="mb-3 flex flex-wrap items-end gap-3 rounded-xl bg-sand/50 p-3">
          <div>
            <Label htmlFor="area_name">Name</Label>
            <Input id="area_name" name="name" required autoFocus
              placeholder="z.B. Berufsmatura" className="w-52" />
          </div>
          <div>
            <Label htmlFor="area_color">Farbe</Label>
            <input id="area_color" type="color" name="color" defaultValue="#8A8478"
              className="h-9 w-14 cursor-pointer rounded-xl border border-line bg-white" />
          </div>
          <Button type="submit" disabled={busy}>Anlegen</Button>
        </form>
      )}

      {archiviert.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs text-ink-faint">Archiviert:</span>
          {archiviert.map((a) => (
            <button key={a.id}
              onClick={() => lauf(archiveLifeArea, formOf({ id: a.id, wieder: "true" }))}
              title="Wieder aktivieren"
              className="rounded-lg px-2 py-0.5 text-xs text-ink-faint transition
                         hover:bg-sand hover:text-ink-muted">
              {a.name} ↩
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function formOf(werte: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(werte)) fd.set(k, v);
  return fd;
}
